import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, IconButton } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { Input, SearchInput } from '@/components/ui/Form'
import { StatusPill, TierBadge, Chip } from '@/components/ui/Badge'
import { DataTable } from '@/components/ui/DataTable'
import { PillTabs } from '@/components/ui/Toolbar'
import { Panel, StatCard } from '@/components/ui/StatCard'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback'
import { ProductThumb } from '@/components/ui/ProductThumb'
import { Modal } from '@/components/ui/Modal'
import { ReceiptModal } from '@/components/modals/ReceiptModal'
import useDocumentTitle from '@/hooks/useDocumentTitle'
import { PageHeader } from '@/components/ui/PageHeader'
import useServerResource, { useServerAction } from '@/hooks/useServerResource'
import cn from '@/lib/cn'
import { formatPrice, formatNumber, formatDate, formatDateTime, formatRelative } from '@/lib/format'
import { adminApi, isRef } from '@/services/adminApi'
import { useAdminStore } from '@/store/adminStore'
import { useSessionStore } from '@/store/sessionStore'
import { useUiStore } from '@/store/uiStore'

/** How a counter bill is settled — the server's `SHOP_PAYMENT_METHODS`. */
const METHODS = ['Cash', 'UPI', 'Card']

/** The record unnamed counter sales are filed under — see `services/pos.js`. */
const WALK_IN_EMAIL = 'walk-in@counter.rehmanperfume.in'

/**
 * How often the shelf is re-read while the counter is open. The website is
 * selling from the same shelf, so the counts on this screen go stale on their
 * own; half a minute keeps them honest without hammering the API. The server
 * re-checks every bill against the live count regardless, so a stale screen can
 * never oversell — it can only be refused.
 */
const POLL_MS = 30_000

/** GST is included in every price; the preview splits it out the way the server does. */
const GST_RATE = 18

/** Convert any date/ISO string into local calendar key `YYYY-MM-DD`. */
const localDateKey = (value) => {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const getTodayAndYesterdayKeys = () => {
  const now = new Date()
  const todayKey = localDateKey(now)
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  return { todayKey, yesterdayKey: localDateKey(yesterday) }
}

const formatDateGroupTitle = (key, todayKey, yesterdayKey) => {
  if (!key) return 'Unknown Date'
  const [y, m, d] = key.split('-').map(Number)
  const label = formatDate(new Date(y, (m || 1) - 1, d || 1))
  if (key === todayKey) return `Today · ${label}`
  if (key === yesterdayKey) return `Yesterday · ${label}`
  return label
}

const newSalt = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10)

/** A short, stable digest of a bill's contents — djb2, which is plenty for a retry key. */
function fingerprint(text) {
  let hash = 5381
  for (let index = 0; index < text.length; index += 1) hash = ((hash << 5) + hash + text.charCodeAt(index)) >>> 0
  return hash.toString(36)
}

/**
 * The preview of a hand-given discount — the same rule `couponDiscount()` on the
 * server applies, so the total on the Charge button is the total on the
 * receipt: a percentage is rounded, and nothing takes the bill below zero.
 */
function discountOff({ type, value }, subtotal) {
  const amount = Number(value) || 0
  if (amount <= 0 || subtotal <= 0) return 0
  const raw = type === 'percent' ? Math.round((subtotal * Math.min(amount, 100)) / 100) : amount
  return Math.max(0, Math.min(Math.round(raw), subtotal))
}

/**
 * The shop counter.
 *
 * Bills rung up here are orders on the `Shop` channel: they draw from the same
 * shelf the website sells from, through the same ledger, inside the same
 * transaction, so the shop and the website can never both sell the last bottle.
 * The difference is the shop reserve — the counter may sell the whole shelf,
 * while the website is held above each fragrance's reserve. That is why every
 * row here shows two numbers.
 *
 * This screen keeps **no offline path**. Every other table in the panel falls
 * back to its fixtures when the API is down; a till cannot, because a bill rung
 * up against a fixture would sell bottles that may already be gone.
 */
export function BillingPage() {
  useDocumentTitle('Counter Sale')

  const user = useSessionStore((state) => state.user)
  const customers = useAdminStore((state) => state.customers)
  const hydrate = useAdminStore((state) => state.hydrate)
  const landProducts = useAdminStore((state) => state.landProducts)
  const landOrder = useAdminStore((state) => state.landOrder)
  const pushToast = useUiStore((state) => state.pushToast)
  const { run, busy } = useServerAction()

  const catalogue = useServerResource(() => adminApi.listCounterProducts())
  const bills = useServerResource(() => adminApi.listShopBills())
  const [syncedAt, setSyncedAt] = useState(null)
  const [dateScope, setDateScope] = useState('all')
  const [pickedDate, setPickedDate] = useState('')
  const [billSearch, setBillSearch] = useState('')
  const [collapsedDays, setCollapsedDays] = useState(() => new Set())

  const searchRef = useRef(null)
  const [query, setQuery] = useState('')
  const [tier, setTier] = useState('All')

  const [lines, setLines] = useState([])
  const [buyer, setBuyer] = useState({ id: null, name: '', phone: '', email: '' })
  const [customerQuery, setCustomerQuery] = useState('')
  const [sendBenefitEmail, setSendBenefitEmail] = useState(true)
  const [repeatInfo, setRepeatInfo] = useState(null)
  const [discount, setDiscount] = useState({ type: 'flat', value: '' })
  const [method, setMethod] = useState('Cash')
  const [txnRef, setTxnRef] = useState('')
  const [salt, setSalt] = useState(newSalt)

  const [receipt, setReceipt] = useState(null)
  const [voiding, setVoiding] = useState(null)
  const [voidReason, setVoidReason] = useState('')

  const isOwner = user?.role === 'owner'
  const canVoid = isOwner

  /* --- Staying live ------------------------------------------------------ */

  // Every fresh read of the shelf also lands in the shared store, so the
  // Inventory screen and the sidebar's low-stock count move with the counter.
  useEffect(() => {
    if (!catalogue.data) return
    landProducts(catalogue.data)
    setSyncedAt(Date.now())
  }, [catalogue.data, landProducts])

  const { reload: reloadCatalogue } = catalogue
  const { reload: reloadBills } = bills
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== 'visible') return
      reloadCatalogue()
      reloadBills()
    }
    const timer = setInterval(refresh, POLL_MS)
    window.addEventListener('focus', refresh)
    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', refresh)
    }
  }, [reloadCatalogue, reloadBills])

  /** Apply the products a bill or a void moved, without waiting for the next poll. */
  const landMoved = (moved = []) => {
    if (!moved.length) return
    landProducts(moved)
    const byId = new Map(moved.map((row) => [row.id, row]))
    catalogue.setData((current) => (current ? current.map((row) => byId.get(row.id) ?? row) : current))
  }

  /* --- The shelf ---------------------------------------------------------- */

  const products = useMemo(() => catalogue.data ?? [], [catalogue.data])
  const byId = useMemo(() => new Map(products.map((product) => [product.id, product])), [products])
  const tiers = useMemo(() => ['All', ...new Set(products.map((product) => product.tier))], [products])

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return products
      .filter(
        (product) =>
          (tier === 'All' || product.tier === tier) &&
          (!needle || [product.name, product.sku, product.brand].join(' ').toLowerCase().includes(needle)),
      )
      .sort((a, b) => Number(b.stock > 0) - Number(a.stock > 0) || a.name.localeCompare(b.name))
  }, [products, query, tier])

  const onBill = (productId) => lines.reduce((sum, line) => (line.productId === productId ? sum + line.qty : sum), 0)

  /* --- The bill ----------------------------------------------------------- */

  const addLine = (product, size = product.volumes?.[0]?.size) => {
    if (!size) return
    if (onBill(product.id) + 1 > product.stock) {
      pushToast({
        tone: 'error',
        title: 'Not enough on the shelf',
        description:
          product.stock > 0
            ? `${product.name}: all ${product.stock} on hand are already on this bill.`
            : `${product.name} is out of stock.`,
      })
      return
    }
    setLines((current) => {
      const index = current.findIndex((line) => line.productId === product.id && line.size === size)
      if (index >= 0) return current.map((line, at) => (at === index ? { ...line, qty: line.qty + 1 } : line))
      return [...current, { productId: product.id, size, qty: 1 }]
    })
  }

  const setQty = (index, wanted) => {
    setLines((current) => {
      const line = current[index]
      const product = byId.get(line?.productId)
      if (!line || !product) return current
      const elsewhere = current.reduce(
        (sum, other, at) => (at !== index && other.productId === line.productId ? sum + other.qty : sum),
        0,
      )
      const qty = Math.max(1, Math.min(Number(wanted) || 1, product.stock - elsewhere))
      return current.map((entry, at) => (at === index ? { ...entry, qty } : entry))
    })
  }

  const removeLine = (index) => setLines((current) => current.filter((_, at) => at !== index))

  const clearBill = () => {
    setLines([])
    setBuyer({ id: null, name: '', phone: '', email: '' })
    setCustomerQuery('')
    setSendBenefitEmail(true)
    setRepeatInfo(null)
    setDiscount({ type: 'flat', value: '' })
    setMethod('Cash')
    setTxnRef('')
    setSalt(newSalt())
  }

  // Live repeat-customer detection as cashier enters Name / Phone / Email or selects a customer.
  useEffect(() => {
    const hasQuery =
      Boolean(buyer.id) ||
      buyer.name.trim().length >= 2 ||
      buyer.phone.replace(/\D/g, '').length >= 7 ||
      buyer.email.includes('@')

    if (!hasQuery) {
      setRepeatInfo(null)
      return undefined
    }

    let cancelled = false
    const timer = setTimeout(() => {
      adminApi
        .lookupCounterCustomer({
          name: buyer.name,
          phone: buyer.phone,
          email: buyer.email,
          customerId: buyer.id || '',
        })
        .then((res) => {
          if (!cancelled) setRepeatInfo(res)
        })
        .catch(() => {})
    }, 240)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [buyer.id, buyer.name, buyer.phone, buyer.email])

  // Read through the live catalogue, so a price or a count that changes on the
  // server mid-bill is what the cashier sees before charging.
  const billLines = lines.map((line) => {
    const product = byId.get(line.productId)
    const volume = product?.volumes?.find((entry) => entry.size === line.size)
    const over = product ? onBill(product.id) > product.stock : false
    return {
      ...line,
      product,
      name: product?.name ?? 'No longer on sale',
      sku: product?.sku ?? '',
      price: volume?.price ?? 0,
      unavailable: !product || !volume,
      over,
    }
  })

  const subtotal = billLines.reduce((sum, line) => sum + line.price * line.qty, 0)
  const off = discountOff(discount, subtotal)
  const discountOverStaffCap =
    !isOwner &&
    Number(discount.value) > 0 &&
    ((discount.type === 'percent' && Number(discount.value) > 15) ||
      (discount.type === 'flat' && subtotal > 0 && Number(discount.value) > Math.round(subtotal * 0.15)))
  const total = subtotal - off
  const gst = Math.round((total * GST_RATE) / (100 + GST_RATE))
  const units = lines.reduce((sum, line) => sum + line.qty, 0)
  const blocked = billLines.some((line) => line.unavailable || line.over) || discountOverStaffCap

  /*
   * The retry key. The same bill sent twice — a timeout, then Charge again —
   * carries the same key and the server hands back the first bill instead of
   * selling the bottles twice. Any change to the bill changes the key, and a
   * fresh salt after every sale means two identical sales in a row are still two
   * bills.
   */
  const clientRef = useMemo(
    () => `pos-${salt}-${fingerprint(JSON.stringify([lines, buyer, discount, method, txnRef]))}`,
    [salt, lines, buyer, discount, method, txnRef],
  )

  const customerMatches = useMemo(() => {
    const needle = customerQuery.trim().toLowerCase()
    if (needle.length < 2) return []
    return customers
      .filter(
        (customer) =>
          isRef(customer.id) &&
          customer.email !== WALK_IN_EMAIL &&
          [customer.name, customer.phone, customer.email].join(' ').toLowerCase().includes(needle),
      )
      .slice(0, 5)
  }, [customers, customerQuery])

  const charge = async () => {
    if (!lines.length || busy || blocked) return

    const result = await run(() =>
      adminApi.createBill({
        items: lines.map(({ productId, size, qty }) => ({ productId, size, qty })),
        ...(buyer.id ? { customerId: buyer.id } : {}),
        customer: { name: buyer.name.trim(), phone: buyer.phone.trim(), email: buyer.email.trim() },
        sendBenefitEmail: Boolean(buyer.email.trim() && sendBenefitEmail),
        payment: { method, ...(method !== 'Cash' && txnRef.trim() ? { txnRef: txnRef.trim() } : {}) },
        ...(Number(discount.value) > 0 ? { discount: { type: discount.type, value: Number(discount.value) } } : {}),
        clientRef,
      }),
    )

    // Refused — most often because the website sold a bottle since the last
    // read. The toast says which; a fresh read makes the screen agree.
    if (!result) {
      reloadCatalogue()
      return
    }

    const { order, products: moved, duplicate, loyalty } = result.data
    landOrder(order)
    landMoved(moved)
    bills.setData((current) => [order, ...(current ?? []).filter((bill) => bill.id !== order.id)])
    if (buyer.name.trim() || buyer.phone.trim() || buyer.email.trim()) hydrate?.()

    const loyaltyNote = loyalty?.emailTriggered
      ? ` · Visit #${loyalty.visits} benefit ${loyalty.discountPercent}% (${loyalty.couponCode}) ${loyalty.smtpConfigured ? 'emailed' : 'saved'}`
      : loyalty?.visits > 1
        ? ` · Repeat Visit #${loyalty.visits}`
        : ''

    pushToast(
      duplicate
        ? { tone: 'info', title: `Already billed as ${order.id}`, description: 'The first attempt went through — nothing was charged twice.' }
        : { title: `Bill ${order.id} saved`, description: `${formatPrice(order.amount)} by ${order.paymentMethod}${loyaltyNote}.` },
    )
    clearBill()
    setReceipt({ ...order, loyalty })
  }

  const confirmVoid = async () => {
    if (!voiding) return
    const result = await run(() => adminApi.voidBill(voiding.id, voidReason.trim()))
    if (!result) return

    const { order, products: moved } = result.data
    landOrder(order)
    landMoved(moved)
    bills.setData((current) => (current ?? []).map((bill) => (bill.id === order.id ? order : bill)))
    pushToast({ title: `Bill ${order.id} cancelled`, description: `${formatPrice(order.amount)} refunded — the stock is back in shop.` })
    setVoiding(null)
  }

  /* --- All Bills + Today Register Summary --------------------------------- */

  const allBills = useMemo(() => bills.data ?? [], [bills.data])
  const { todayKey, yesterdayKey } = getTodayAndYesterdayKeys()

  const todays = useMemo(
    () => allBills.filter((bill) => localDateKey(bill.placedAt) === todayKey),
    [allBills, todayKey],
  )

  const day = useMemo(() => {
    const live = todays.filter((bill) => bill.status !== 'Cancelled')
    const by = (name) => live.filter((bill) => bill.paymentMethod === name).reduce((sum, bill) => sum + bill.amount, 0)
    return {
      count: live.length,
      takings: live.reduce((sum, bill) => sum + bill.amount, 0),
      cash: by('Cash'),
      upi: by('UPI'),
      card: by('Card'),
    }
  }, [todays])

  const filteredBills = useMemo(() => {
    const needle = billSearch.trim().toLowerCase()
    return allBills
      .filter((bill) => {
        const key = localDateKey(bill.placedAt)
        if (pickedDate) {
          if (key !== pickedDate) return false
        } else if (dateScope === 'today') {
          if (key !== todayKey) return false
        } else if (dateScope === 'yesterday') {
          if (key !== yesterdayKey) return false
        }
        if (!needle) return true
        return [bill.id, bill.customer, bill.phone, bill.email, bill.paymentMethod, ...bill.items.map((line) => line.name)]
          .join(' ')
          .toLowerCase()
          .includes(needle)
      })
      .sort((a, b) => new Date(b.placedAt).getTime() - new Date(a.placedAt).getTime())
  }, [allBills, billSearch, dateScope, pickedDate, todayKey, yesterdayKey])

  const dateGroups = useMemo(() => {
    const map = new Map()
    for (const bill of filteredBills) {
      const key = localDateKey(bill.placedAt) || 'unknown'
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(bill)
    }

    return [...map.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([key, rows]) => {
        const live = rows.filter((bill) => bill.status !== 'Cancelled')
        const sumMethod = (name) =>
          live.filter((bill) => bill.paymentMethod === name).reduce((sum, bill) => sum + bill.amount, 0)
        return {
          key,
          title: formatDateGroupTitle(key, todayKey, yesterdayKey),
          rows,
          activeCount: live.length,
          total: live.reduce((sum, bill) => sum + bill.amount, 0),
          cash: sumMethod('Cash'),
          upi: sumMethod('UPI'),
          card: sumMethod('Card'),
        }
      })
  }, [filteredBills, todayKey, yesterdayKey])

  const totalFilteredSales = useMemo(
    () =>
      filteredBills
        .filter((bill) => bill.status !== 'Cancelled')
        .reduce((sum, bill) => sum + bill.amount, 0),
    [filteredBills],
  )

  const toggleDayGroup = (key) => {
    setCollapsedDays((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const billColumns = [
    {
      key: 'id',
      header: 'Bill',
      render: (bill) => (
        <span className="block whitespace-nowrap">
          <span className="tabular block font-semibold text-ink">{bill.id}</span>
          <span className="block text-body-sm text-ink-muted">{formatDateTime(bill.placedAt)}</span>
        </span>
      ),
    },
    {
      key: 'customer',
      header: 'Customer',
      render: (bill) => (
        <span className="block min-w-0">
          <span className="block truncate text-ink">{bill.customer}</span>
          {(bill.phone || bill.email) && (
            <span className="tabular block truncate text-body-sm text-ink-muted">
              {[bill.phone, bill.email].filter(Boolean).join(' · ')}
            </span>
          )}
        </span>
      ),
    },
    {
      key: 'items',
      header: 'Items',
      render: (bill) => (
        <span className="block max-w-[16rem] truncate text-ink-variant" title={bill.items.map((line) => `${line.qty} × ${line.name}`).join(', ')}>
          {bill.items.map((line) => `${line.qty} × ${line.name}`).join(', ')}
        </span>
      ),
    },
    {
      key: 'method',
      header: 'Paid by',
      render: (bill) => <Chip>{bill.paymentMethod}</Chip>,
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      render: (bill) => (
        <span className={cn('tabular font-semibold', bill.status === 'Cancelled' ? 'text-ink-muted line-through' : 'text-ink')}>
          {formatPrice(bill.amount)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'State',
      render: (bill) => <StatusPill status={bill.status === 'Cancelled' ? 'Refunded' : bill.payment} />,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (bill) => (
        <span className="flex items-center justify-end gap-0.5" onClick={(event) => event.stopPropagation()}>
          <IconButton icon="print" label={`Receipt for ${bill.id}`} onClick={() => setReceipt(bill)} />
          {canVoid && bill.status !== 'Cancelled' && (
            <IconButton
              icon="trash"
              tone="danger"
              label={`Cancel ${bill.id}`}
              onClick={() => {
                setVoidReason('')
                setVoiding(bill)
              }}
            />
          )}
        </span>
      ),
    },
  ]

  /* --- Render ------------------------------------------------------------- */

  const firstLoad = !catalogue.data && catalogue.loading
  const stale = Boolean(catalogue.data && catalogue.error)

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        actions={
          <>
            {/* Three states in shopkeeper's words rather than a sync log. The
                timestamp it used to print — "Live · synced 3 minutes ago" — is the
                information nobody acts on, so it moved into the tooltip for anyone
                who wants to check, and the row now only answers "can I trust the
                numbers in front of me?". */}
            <span
              className="flex items-center gap-2 text-body-sm text-ink-muted"
              title={syncedAt ? `Last read from the server ${formatRelative(syncedAt)}` : undefined}
              aria-live="polite"
            >
              <span
                className={cn('h-2 w-2 rounded-full', stale || catalogue.error ? 'bg-error' : 'bg-state-done animate-pulse')}
                aria-hidden="true"
              />
              {stale || catalogue.error
                ? 'Stock numbers may be out of date'
                : syncedAt
                  ? 'Stock numbers are up to date'
                  : 'Connecting…'}
            </span>
            <Button
              variant="ghost"
              size="sm"
              icon="refresh"
              loading={catalogue.loading && Boolean(catalogue.data)}
              onClick={() => {
                reloadCatalogue()
                reloadBills()
              }}
            >
              Refresh
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard
          label={`Today · ${formatNumber(day.count)} ${day.count === 1 ? 'bill' : 'bills'}`}
          value={formatPrice(day.takings)}
          icon="receipt"
        />
        <StatCard label="Cash in the till" value={formatPrice(day.cash)} icon="tag" tone="done" />
        <StatCard label="UPI" value={formatPrice(day.upi)} icon="scan" tone="active" />
        <StatCard label="Card" value={formatPrice(day.card)} icon="card" tone="pending" />
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
        {/* ------------------------------------------------------ the shelf */}
        <section className="card-admin-flush">
          <div className="flex flex-col gap-3 border-b border-outline-variant/50 px-4 py-3">
            <SearchInput
              ref={searchRef}
              name="billing-product-search"
              autoComplete="off"
              value={query}
              onChange={setQuery}
              placeholder="Search by name, SKU or brand — scan a SKU and press Enter"
              aria-label="Search your stock"
              autoFocus
              onKeyDown={(event) => {
                if (event.key !== 'Enter') return
                const needle = query.trim().toLowerCase()
                const exact = products.find((product) => product.sku.toLowerCase() === needle)
                const pick = exact ?? (matches.length === 1 ? matches[0] : null)
                if (pick) {
                  addLine(pick)
                  setQuery('')
                }
              }}
            />
            {tiers.length > 2 && (
              <PillTabs
                tabs={tiers.map((value) => ({ value, label: value === 'All' ? 'All types' : value }))}
                value={tier}
                onChange={setTier}
              />
            )}
          </div>

          {firstLoad ? (
            <div className="flex flex-col gap-3 p-4">
              {Array.from({ length: 6 }, (_, index) => (
                <Skeleton key={index} className="h-14 w-full" />
              ))}
            </div>
          ) : !catalogue.data && catalogue.error ? (
            <ErrorState error={catalogue.error} refused={catalogue.refused} onRetry={reloadCatalogue} className="py-12" />
          ) : matches.length === 0 ? (
            <EmptyState
              icon="search"
              title="Nothing matches that search"
              description="Try fewer words, or another type."
              className="py-12"
            />
          ) : (
            <ul className="max-h-[38rem] divide-y divide-outline-variant/40 overflow-y-auto">
              {matches.slice(0, 60).map((product) => {
                const taken = onBill(product.id)
                const left = product.stock - taken
                return (
                  <li key={product.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
                    <div className="flex min-w-0 flex-1 items-start gap-2.5">
                      {/* The bottle at the counter, not a stand-in: the cashier
                          matches the box in their hand against this row. */}
                      <ProductThumb product={product} className="mt-0.5 h-10 w-10" />
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="truncate font-semibold text-ink">{product.name}</span>
                          <TierBadge tier={product.tier} className="shrink-0" />
                        </div>
                        <p className="truncate text-body-sm text-ink-muted">
                          {product.brand} · <span className="tabular">{product.sku}</span>
                        </p>
                        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-body-sm">
                          <span className={cn('font-semibold', product.stock <= 0 ? 'text-error' : 'text-ink')}>
                            <span className="tabular">{product.stock}</span> in shop
                          </span>
                          <span className="text-ink-muted">
                            <span className="tabular">{product.onlineStock ?? product.stock}</span> online
                          </span>
                          {product.shopReserve > 0 && (
                            <span className="text-brand-goldInk">
                              <span className="tabular">{product.shopReserve}</span> kept for shop
                            </span>
                          )}
                          {taken > 0 && <span className="text-state-active">{taken} on this bill</span>}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5 sm:justify-end">
                      {product.volumes.map((volume) => (
                        <button
                          key={volume.size}
                          type="button"
                          disabled={left <= 0}
                          onClick={() => addLine(product, volume.size)}
                          className="btn btn-sm btn-outline normal-case tracking-normal"
                          aria-label={`Add ${product.name} ${volume.size} to the bill`}
                        >
                          <Icon name="plus" className="h-3.5 w-3.5" />
                          {volume.size} · <span className="tabular">{formatPrice(volume.price)}</span>
                        </button>
                      ))}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}

          {matches.length > 60 && (
            <p className="border-t border-outline-variant/50 px-4 py-2.5 text-body-sm text-ink-muted">
              Showing 60 of {matches.length} — narrow the search to see the rest.
            </p>
          )}
        </section>

        {/* ------------------------------------------------------- the bill */}
        <section className="card-admin flex flex-col xl:sticky xl:top-24" aria-label="Current bill">
          <header className="flex items-center justify-between gap-3 border-b border-outline-variant/50 px-4 py-3">
            <div>
              <h2 className="panel-title">Current bill</h2>
              <p className="text-body-sm text-ink-muted">
                {units ? `${units} ${units === 1 ? 'unit' : 'units'}` : 'Empty'} · cashier {user?.name ?? '—'}
              </p>
            </div>
            {lines.length > 0 && (
              <Button variant="ghost" size="sm" icon="trash" onClick={clearBill}>
                Clear
              </Button>
            )}
          </header>

          {billLines.length === 0 ? (
            <EmptyState
              icon="receipt"
              title="No items yet"
              description="Pick a size from the list, or scan a SKU into the search."
              className="py-10"
            />
          ) : (
            <ul className="max-h-72 divide-y divide-outline-variant/40 overflow-y-auto">
              {billLines.map((line, index) => (
                <li key={`${line.productId}:${line.size}`} className="flex items-center gap-2 px-4 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body-sm font-semibold text-ink">{line.name}</span>
                    <span className={cn('block text-body-sm', line.unavailable || line.over ? 'text-error' : 'text-ink-muted')}>
                      {line.unavailable
                        ? 'Not on sale any more — remove it'
                        : line.over
                          ? `Only ${line.product.stock} on the shelf now`
                          : `${line.size} · ${formatPrice(line.price)}`}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center rounded border border-outline-variant">
                    <button
                      type="button"
                      onClick={() => setQty(index, line.qty - 1)}
                      disabled={line.qty <= 1}
                      aria-label={`One fewer ${line.name}`}
                      className="flex h-7 w-7 items-center justify-center text-ink-variant transition hover:bg-surface-low disabled:opacity-30"
                    >
                      <Icon name="minus" className="h-3.5 w-3.5" />
                    </button>
                    <span className="tabular min-w-[1.75rem] text-center text-body-sm font-semibold text-ink" aria-live="polite">
                      {line.qty}
                    </span>
                    <button
                      type="button"
                      onClick={() => setQty(index, line.qty + 1)}
                      disabled={!line.product || onBill(line.productId) >= line.product.stock}
                      aria-label={`One more ${line.name}`}
                      className="flex h-7 w-7 items-center justify-center text-ink-variant transition hover:bg-surface-low disabled:opacity-30"
                    >
                      <Icon name="plus" className="h-3.5 w-3.5" />
                    </button>
                  </span>
                  <span className="tabular w-20 shrink-0 text-right text-body-sm font-semibold text-ink">
                    {formatPrice(line.price * line.qty)}
                  </span>
                  <IconButton icon="close" label={`Remove ${line.name}`} onClick={() => removeLine(index)} />
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-col gap-4 border-t border-outline-variant/50 px-4 py-4">
            {/* Customer */}
            <div>
              <span className="field-label">Customer</span>
              {buyer.id ? (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between gap-2 rounded border border-brand-gold/50 bg-brand-gold/10 px-3 py-2">
                    <span className="min-w-0">
                      <span className="block truncate text-body-sm font-semibold text-ink">{buyer.name}</span>
                      <span className="block truncate text-body-sm text-ink-muted">
                        {[buyer.phone, buyer.email].filter(Boolean).join(' · ') || 'Saved customer'}
                      </span>
                    </span>
                    <IconButton
                      icon="close"
                      label="Unlink customer"
                      onClick={() => {
                        setBuyer({ id: null, name: '', phone: '', email: '' })
                        setCustomerQuery('')
                      }}
                    />
                  </div>
                  {!buyer.email && (
                    <Input
                      type="email"
                      aria-label="Customer email"
                      placeholder="Add email to send repeat benefit…"
                      value={buyer.email}
                      onChange={(event) => setBuyer((current) => ({ ...current, email: event.target.value }))}
                    />
                  )}
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      aria-label="Customer name"
                      placeholder="Name (optional)"
                      value={buyer.name}
                      onChange={(event) => setBuyer((current) => ({ ...current, name: event.target.value }))}
                    />
                    <Input
                      aria-label="Customer phone"
                      placeholder="Phone (optional)"
                      inputMode="tel"
                      value={buyer.phone}
                      onChange={(event) => setBuyer((current) => ({ ...current, phone: event.target.value }))}
                    />
                  </div>
                  <Input
                    type="email"
                    icon="mail"
                    aria-label="Customer email"
                    placeholder="Email (optional — sends repeat benefit)"
                    value={buyer.email}
                    onChange={(event) => setBuyer((current) => ({ ...current, email: event.target.value }))}
                  />
                  <div className="relative">
                    <Input
                      icon="users"
                      aria-label="Find a saved customer"
                      placeholder="…or find a saved customer"
                      value={customerQuery}
                      onChange={(event) => setCustomerQuery(event.target.value)}
                    />
                    {customerMatches.length > 0 && (
                      <ul className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded border border-outline-variant bg-brand-paper shadow-lift">
                        {customerMatches.map((customer) => (
                          <li key={customer.id}>
                            <button
                              type="button"
                              onClick={() => {
                                setBuyer({
                                  id: customer.id,
                                  name: customer.name,
                                  phone: customer.phone ?? '',
                                  email: customer.email ?? '',
                                })
                                setCustomerQuery('')
                              }}
                              className="flex w-full flex-col px-3 py-2 text-left transition hover:bg-surface-low"
                            >
                              <span className="text-body-sm font-semibold text-ink">{customer.name}</span>
                              <span className="text-body-sm text-ink-muted">
                                {[customer.phone, customer.email].filter(Boolean).join(' · ')}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}

              {repeatInfo?.found && (
                <div className="mt-2 rounded border border-brand-gold/50 bg-brand-gold/10 px-3 py-2.5 text-body-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-ink">
                      Repeat Customer · {repeatInfo.visits} past {repeatInfo.visits === 1 ? 'bill' : 'bills'}
                    </span>
                    <Chip tone="gold">{formatPrice(repeatInfo.totalSpent)} spent</Chip>
                  </div>
                  <p className="mt-0.5 text-[12px] text-ink-muted">
                    Matched by {repeatInfo.matchedBy?.join(', ') || 'History'} · Visit #{repeatInfo.upcomingVisit}
                  </p>
                  {repeatInfo.benefit && (
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-brand-gold/25 pt-2">
                      <span className="font-medium text-brand-goldInk">
                        Eligible: {repeatInfo.benefit.discountPercent}% OFF ({repeatInfo.benefit.label})
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setDiscount({ type: 'percent', value: String(repeatInfo.benefit.discountPercent) })
                        }
                      >
                        Apply {repeatInfo.benefit.discountPercent}% Off
                      </Button>
                    </div>
                  )}
                  {repeatInfo.activeCoupon && !repeatInfo.benefit && (
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-brand-gold/25 pt-2">
                      <span className="font-medium text-brand-goldInk">
                        Emailed code {repeatInfo.activeCoupon.code}: {repeatInfo.activeCoupon.value}% OFF
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setDiscount({ type: 'percent', value: String(repeatInfo.activeCoupon.value) })
                        }
                      >
                        Apply {repeatInfo.activeCoupon.value}%
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {buyer.email.includes('@') && (
                <label className="mt-2 flex cursor-pointer items-center gap-2 text-[12px] text-ink-variant">
                  <input
                    type="checkbox"
                    checked={sendBenefitEmail}
                    onChange={(event) => setSendBenefitEmail(event.target.checked)}
                    className="h-3.5 w-3.5 rounded border-outline-variant accent-brand-gold"
                  />
                  <span>Send repeat customer benefit coupon to customer email</span>
                </label>
              )}
            </div>

            {/* Discount */}
            <div>
              <span className="field-label">Discount</span>
              <div className="flex gap-2">
                <div className="flex shrink-0 overflow-hidden rounded border border-outline-variant">
                  {[
                    { value: 'flat', label: '₹' },
                    { value: 'percent', label: '%' },
                  ].map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={discount.type === option.value}
                      aria-label={option.value === 'flat' ? 'Discount in rupees' : 'Discount as a percentage'}
                      onClick={() => setDiscount((current) => ({ ...current, type: option.value }))}
                      className={cn(
                        'w-10 text-body-sm font-bold transition-colors',
                        discount.type === option.value ? 'bg-shell-obsidian text-surface-low' : 'bg-brand-paper text-ink-variant hover:bg-surface-low',
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <Input
                  type="number"
                  name="billing-discount-amount"
                  autoComplete="off"
                  min="0"
                  max={discount.type === 'percent' ? 100 : undefined}
                  aria-label="Discount amount"
                  placeholder="Enter discount amount"
                  value={discount.value}
                  onChange={(event) => setDiscount((current) => ({ ...current, value: event.target.value }))}
                />
              </div>
              {discountOverStaffCap ? (
                <p className="mt-1.5 text-[12px] font-medium text-error">
                  Staff discount limit is max 15% ({formatPrice(Math.round(subtotal * 0.15))}). Ask the Shop Owner for higher.
                </p>
              ) : !isOwner ? (
                <p className="mt-1 text-[11px] text-ink-muted">Staff discount limit: up to 15%</p>
              ) : null}
            </div>

            {/* Payment */}
            <div>
              <span className="field-label">Paid by</span>
              <div className="grid grid-cols-3 gap-2">
                {METHODS.map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={method === value}
                    onClick={() => setMethod(value)}
                    className={cn(
                      'btn btn-md border',
                      method === value
                        ? 'border-shell-obsidian bg-shell-obsidian text-surface-low'
                        : 'border-outline-variant bg-brand-paper text-ink-variant hover:border-brand-gold',
                    )}
                  >
                    {value}
                  </button>
                ))}
              </div>
              {method !== 'Cash' && (
                <Input
                  containerClassName="mt-2"
                  aria-label="Transaction reference"
                  placeholder={method === 'UPI' ? 'UPI reference (optional)' : 'Card slip / last 4 digits (optional)'}
                  value={txnRef}
                  onChange={(event) => setTxnRef(event.target.value)}
                />
              )}
            </div>

            {/* Totals */}
            <dl className="flex flex-col gap-1 rounded border border-outline-variant/60 bg-surface-low/60 px-3.5 py-3 text-body-sm">
              <div className="flex justify-between">
                <dt className="text-ink-variant">Subtotal</dt>
                <dd className="tabular text-ink">{formatPrice(subtotal)}</dd>
              </div>
              {off > 0 && (
                <div className="flex justify-between">
                  <dt className="text-ink-variant">Discount</dt>
                  <dd className="tabular text-state-done">−{formatPrice(off)}</dd>
                </div>
              )}
              <div className="mt-1 flex items-baseline justify-between border-t border-outline-variant/50 pt-2">
                <dt className="font-semibold text-ink">Total</dt>
                <dd className="tabular font-serif text-headline-md font-semibold text-ink">{formatPrice(total)}</dd>
              </div>
              <div className="flex justify-between text-ink-muted">
                <dt>Includes GST {GST_RATE}%</dt>
                <dd className="tabular">{formatPrice(gst)}</dd>
              </div>
            </dl>

            <Button
              variant="gold"
              size="lg"
              fullWidth
              icon="check"
              loading={busy}
              disabled={!lines.length || blocked || !catalogue.data}
              onClick={charge}
            >
              {lines.length ? `Charge ${formatPrice(total)}` : 'Charge'}
            </Button>
          </div>
        </section>
      </div>

      {/* ----------------------------------------------- all bills date-wise */}
      <Panel
        title="All shop bills (Date-wise)"
        description="Every shop counter bill organized by date — Today, Yesterday, and all past dates. Click any row to view or print its bill."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Chip tone="gold">Total: {formatPrice(totalFilteredSales)}</Chip>
            <Chip>
              {filteredBills.length} {filteredBills.length === 1 ? 'bill' : 'bills'}
            </Chip>
          </div>
        }
        flush
      >
        <div className="flex flex-col gap-3 border-b border-outline-variant/50 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <PillTabs
              tabs={[
                { value: 'all', label: 'All Dates', count: allBills.length },
                { value: 'today', label: 'Today', count: todays.length },
                {
                  value: 'yesterday',
                  label: 'Yesterday',
                  count: allBills.filter((b) => localDateKey(b.placedAt) === yesterdayKey).length,
                },
              ]}
              value={pickedDate ? '' : dateScope}
              onChange={(value) => {
                setPickedDate('')
                setDateScope(value)
              }}
            />
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={pickedDate}
                onChange={(event) => {
                  setPickedDate(event.target.value)
                  if (event.target.value) setDateScope('all')
                }}
                aria-label="Filter bills by date"
                className="field py-1.5 text-body-sm"
              />
              {pickedDate && (
                <Button variant="ghost" size="sm" onClick={() => setPickedDate('')}>
                  Clear date
                </Button>
              )}
            </div>
          </div>

          <SearchInput
            value={billSearch}
            onChange={setBillSearch}
            placeholder="Search bill no, customer, phone, email or payment…"
            className="w-full lg:w-72"
          />
        </div>

        {!bills.data && bills.error ? (
          <ErrorState error={bills.error} refused={bills.refused} onRetry={reloadBills} className="py-10" />
        ) : !bills.data && bills.loading ? (
          <div className="flex flex-col gap-3 p-4">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-14 w-full" />
            ))}
          </div>
        ) : dateGroups.length === 0 ? (
          <EmptyState
            icon="receipt"
            title={allBills.length === 0 ? 'No shop bills yet' : 'No bills match your filter'}
            description={
              allBills.length === 0
                ? 'The first bill you charge will appear here.'
                : 'Try switching to All Dates or clearing your search.'
            }
          />
        ) : (
          <div className="divide-y divide-outline-variant/60">
            {dateGroups.map((group) => {
              const collapsed = collapsedDays.has(group.key)
              return (
                <section key={group.key}>
                  <button
                    type="button"
                    onClick={() => toggleDayGroup(group.key)}
                    className="flex w-full flex-wrap items-center justify-between gap-3 bg-surface-low/80 px-4 py-3 text-left transition-colors hover:bg-surface"
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon
                        name={collapsed ? 'chevron-right' : 'chevron-down'}
                        className="h-4 w-4 shrink-0 text-ink-muted"
                      />
                      <Icon name="calendar" className="h-4 w-4 shrink-0 text-brand-goldDark" />
                      <span className="font-serif text-title-md font-semibold text-ink">{group.title}</span>
                      <Chip>
                        {group.rows.length} {group.rows.length === 1 ? 'bill' : 'bills'}
                      </Chip>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-body-sm">
                      {group.cash > 0 && <Chip tone="done">Cash {formatPrice(group.cash)}</Chip>}
                      {group.upi > 0 && <Chip tone="active">UPI {formatPrice(group.upi)}</Chip>}
                      {group.card > 0 && <Chip tone="pending">Card {formatPrice(group.card)}</Chip>}
                      <span className="tabular font-serif text-title-md font-semibold text-ink">
                        {formatPrice(group.total)}
                      </span>
                    </div>
                  </button>

                  {!collapsed && (
                    <DataTable
                      columns={billColumns}
                      rows={group.rows}
                      onRowClick={(bill) => setReceipt(bill)}
                    />
                  )}
                </section>
              )
            })}
          </div>
        )}
      </Panel>

      <ReceiptModal
        open={Boolean(receipt)}
        order={receipt}
        onClose={() => setReceipt(null)}
        onNewBill={() => {
          setReceipt(null)
          searchRef.current?.focus()
        }}
      />

      <Modal
        open={Boolean(voiding)}
        onClose={() => setVoiding(null)}
        size="sm"
        title={voiding ? `Cancel bill ${voiding.id}?` : 'Cancel bill'}
        description={voiding ? `${formatPrice(voiding.amount)} · ${voiding.customer}` : ''}
        footer={
          <>
            <Button variant="ghost" onClick={() => setVoiding(null)}>
              Keep the bill
            </Button>
            <Button variant="danger" icon="trash" loading={busy} onClick={confirmVoid}>
              Cancel bill & refund
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <p className="text-body-sm text-ink-variant">
            The bottles go back into shop stock, the payment is marked refunded, and the bill is saved as cancelled.
            Return the customer's money before confirming.
          </p>
          <Input
            label="Reason"
            placeholder="Enter reason for cancelling bill"
            value={voidReason}
            onChange={(event) => setVoidReason(event.target.value)}
            data-autofocus
          />
        </div>
      </Modal>
    </div>
  )
}

export default BillingPage
