import { useEffect, useMemo, useState } from 'react'
import cn from '@/lib/cn'
import { formatPrice } from '@/lib/format'
import { Icon } from '@/components/ui/Icon'
import { Button, IconButton } from '@/components/ui/Button'
import { SearchInput } from '@/components/ui/Form'
import { Chip, StatusPill, TierBadge } from '@/components/ui/Badge'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback'
import { Panel } from '@/components/ui/StatCard'
import { ProductThumb } from '@/components/ui/ProductThumb'
import { PageHeader } from '@/components/ui/PageHeader'
import useDocumentTitle from '@/hooks/useDocumentTitle'
import { useServerAction, useServerResource } from '@/hooks/useServerResource'
import { useAdminStore } from '@/store/adminStore'
import { useSessionStore } from '@/store/sessionStore'
import adminApi from '@/services/adminApi'

const DEFAULT_SHOWCASE = {
  codEnabled: true,
  showBestsellers: true,
  showHomeDeals: true,
  showOffersProducts: true,
  showCouponsSection: true,
  showMultiBottleOffers: true,
  showCombos: true,
  showCelebrities: true,
  showCarPerfumes: true,
  offerProductIds: [],
  bestsellerProductIds: [],
  homeDealProductIds: [],
  comboProductIds: [],
  celebrityProductIds: [],
  carPerfumeProductIds: [],
}

const ACCESS_TOGGLES = [
  {
    key: 'codEnabled',
    label: 'Cash on Delivery (COD)',
    description: 'Turn ON to allow Cash on Delivery at checkout. Turn OFF to accept online payments only (UPI, Card, Net Banking).',
    icon: 'truck',
    highlight: true,
  },
  {
    key: 'showBestsellers',
    listKey: 'bestsellerProductIds',
    label: 'Home Page — Best Sellers Section',
    description: 'Show/hide "The Bestsellers" section on Home page.',
    icon: 'star',
  },
  {
    key: 'showHomeDeals',
    listKey: 'homeDealProductIds',
    label: 'Home Page — Discount Offer Area',
    description: 'Show/hide "Best Discounts Right Now" on Home page.',
    icon: 'percent',
  },
  {
    key: 'showOffersProducts',
    listKey: 'offerProductIds',
    label: 'Offers Page — Special Offer Products',
    description: 'Show/hide selected offer products on Offers page.',
    icon: 'tag',
  },
  {
    key: 'showCouponsSection',
    label: 'Offers Page — Coupon Codes',
    description: 'Show or hide active Coupon Codes on the Offers page.',
    icon: 'ticket',
  },
  {
    key: 'showMultiBottleOffers',
    label: 'Offers Page — Multi-Bottle Savings',
    description: 'Show or hide the Buy 2+, 3+, 4+ bottle extra savings section on the Offers page.',
    icon: 'gift',
  },
  {
    key: 'showCombos',
    listKey: 'comboProductIds',
    label: 'Combos Page — Curated Combos',
    description: 'Control products appearing in the Combos & Gift Sets section.',
    icon: 'package',
  },
  {
    key: 'showCelebrities',
    listKey: 'celebrityProductIds',
    label: 'Celebrities Perfumes Page',
    description: 'Control products appearing in the Celebrities Perfumes section.',
    icon: 'crown',
  },
  {
    key: 'showCarPerfumes',
    listKey: 'carPerfumeProductIds',
    label: 'Car Perfumes Page',
    description: 'Control products appearing in the Car Perfumes section.',
    icon: 'sparkle',
  },
]

const SHOWCASE_SECTIONS = [
  {
    key: 'offerProductIds',
    toggleKey: 'showOffersProducts',
    inStockOnly: true,
    title: 'Offers Page — Showcased Products',
    description:
      'Manually add which in-stock perfumes show on the Offers page (/offers). Just writing MRP and Selling Price on a product does NOT add it here; out-of-stock perfumes are hidden automatically.',
    emptyTitle: 'No products added for the Offers page',
    emptyDescription: 'Pick an in-stock product above to showcase it in the Special Offer Deals section on /offers.',
  },
  {
    key: 'bestsellerProductIds',
    toggleKey: 'showBestsellers',
    inStockOnly: false,
    title: 'Home Page — Best Sellers',
    description: 'Manually add and order the perfumes shown under "The Bestsellers" on the Home page.',
    emptyTitle: 'No Best Sellers selected',
    emptyDescription: 'Pick products above to display them in Best Sellers on the Home page.',
  },
  {
    key: 'homeDealProductIds',
    toggleKey: 'showHomeDeals',
    inStockOnly: true,
    title: 'Home Page — Max Discount Offer Area',
    description:
      'Manually add and order the in-stock perfumes shown in the "Best Discounts Right Now" offer area on the Home page. Out-of-stock items are hidden automatically.',
    emptyTitle: 'No Home discount products selected',
    emptyDescription: 'Pick in-stock products above to showcase them in the Home page discount offer area.',
  },
  {
    key: 'comboProductIds',
    toggleKey: 'showCombos',
    inStockOnly: false,
    title: 'Combos Page — Curated Combos & Gift Sets',
    description:
      'Manually add and order products on the /combos page. Products marked with Type: Combo in the product catalog also appear here automatically.',
    emptyTitle: 'No Combos selected',
    emptyDescription: 'Pick products above to showcase them in Combos & Gift Sets, or mark products with Type: Combo in Products.',
  },
  {
    key: 'celebrityProductIds',
    toggleKey: 'showCelebrities',
    inStockOnly: false,
    title: 'Celebrities Perfumes Page — Showcased Products',
    description:
      'Manually add and order products on the /shop/celebrities page. Products tagged with Collection "Celebrities Perfumes" in the product catalog also appear here automatically.',
    emptyTitle: 'No Celebrities Perfumes selected',
    emptyDescription: 'Pick products above to showcase them in Celebrities Perfumes, or tag products with Collection: Celebrities Perfumes in Products.',
  },
  {
    key: 'carPerfumeProductIds',
    toggleKey: 'showCarPerfumes',
    inStockOnly: false,
    title: 'Car Perfumes Page — Showcased Products',
    description:
      'Manually add and order products on the /shop/car-perfumes page. Products tagged with Collection "Car Perfumes" or Type "Car Perfume" in the product catalog also appear here automatically.',
    emptyTitle: 'No Car Perfumes selected',
    emptyDescription: 'Pick products above to showcase them in Car Perfumes, or tag products with Collection: Car Perfumes or Type: Car Perfume in Products.',
  },
]

function discountPercent(mrp, price) {
  const m = Number(mrp) || 0
  const p = Number(price) || 0
  if (m <= p || m <= 0) return 0
  return Math.round(((m - p) / m) * 100)
}

function ToggleRow({ item, checked, count, disabled, onToggle }) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 rounded border px-3.5 py-2.5 transition-colors',
        item.highlight
          ? checked
            ? 'border-state-done/30 bg-state-doneSurface/35'
            : 'border-state-halted/30 bg-state-haltedSurface/35'
          : 'border-outline-variant/60 bg-surface-low/40',
      )}
    >
      <div className="flex min-w-0 items-start gap-2.5">
        <span
          className={cn(
            'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded',
            checked ? 'bg-brand-gold/20 text-brand-goldInk' : 'bg-surface text-ink-muted',
          )}
        >
          <Icon name={item.icon} className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="text-body-sm font-semibold text-ink">{item.label}</p>
            {count !== undefined && checked && (
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-[10px] font-bold',
                  count === 0 ? 'bg-state-pendingSurface text-state-pending' : 'bg-brand-gold/25 text-brand-goldInk',
                )}
              >
                {count === 0 ? 'Add products below' : `${count} added`}
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[12px] text-ink-muted">{item.description}</p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2.5">
        <span
          className={cn(
            'rounded-full px-2 py-0.5 text-label-sm font-bold uppercase',
            checked ? 'bg-state-doneSurface text-state-done' : 'bg-state-haltedSurface text-state-halted',
          )}
        >
          {checked ? 'ON' : 'OFF'}
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          aria-label={item.label}
          disabled={disabled}
          onClick={onToggle}
          className={cn(
            'relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-gold disabled:cursor-not-allowed disabled:opacity-50',
            checked ? 'bg-state-done' : 'bg-outline-variant',
          )}
        >
          <span
            className={cn(
              'pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',
              checked ? 'translate-x-5' : 'translate-x-0.5',
            )}
          />
        </button>
      </div>
    </div>
  )
}

const stockOf = (product) => Number(product?.onlineStock ?? product?.stock ?? 0)

function ShowcaseProductSection({
  title,
  description,
  emptyTitle,
  emptyDescription,
  enabled,
  inStockOnly = false,
  selectedIds,
  products,
  productsById,
  disabled,
  onChange,
}) {
  const [search, setSearch] = useState('')
  const [pickedId, setPickedId] = useState('')

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])
  const query = search.trim().toLowerCase()

  const activeMatches = useMemo(
    () =>
      products.filter((product) => {
        if (product.status !== 'Active') return false
        if (inStockOnly && stockOf(product) <= 0) return false
        if (!query) return true
        return `${product.name} ${product.brand} ${product.sku} ${product.tier}`.toLowerCase().includes(query)
      }),
    [products, query, inStockOnly],
  )

  const available = useMemo(
    () => activeMatches.filter((product) => !selectedSet.has(product.id)),
    [activeMatches, selectedSet],
  )

  const hasAnyActive = useMemo(
    () => products.some((p) => p.status === 'Active' && (!inStockOnly || stockOf(p) > 0)),
    [products, inStockOnly],
  )
  const emptyOptionLabel = !hasAnyActive
    ? inStockOnly
      ? 'No in-stock active products available'
      : 'No active products found'
    : query && activeMatches.length === 0
      ? 'No matching products found'
      : query
        ? 'Matching products are already added'
        : inStockOnly
          ? 'All in-stock active products are already added'
          : 'All active products are already added'

  const effectivePick = available.some((p) => p.id === pickedId) ? pickedId : (available[0]?.id ?? '')

  const addSelected = () => {
    if (!effectivePick || disabled) return
    onChange([...selectedIds, effectivePick])
    setPickedId('')
  }

  const move = (index, delta) => {
    const nextIndex = index + delta
    if (nextIndex < 0 || nextIndex >= selectedIds.length) return
    const copy = [...selectedIds]
    const [moved] = copy.splice(index, 1)
    copy.splice(nextIndex, 0, moved)
    onChange(copy)
  }

  const remove = (id) => {
    onChange(selectedIds.filter((entry) => entry !== id))
  }

  return (
    <Panel
      title={title}
      action={
        <div className="flex items-center gap-2">
          <Chip tone={enabled ? 'gold' : 'muted'}>{enabled ? 'Visible on website' : 'Hidden on website'}</Chip>
          <Chip>{selectedIds.length} added</Chip>
        </div>
      }
    >
      <p className="text-body-sm text-ink-muted">{description}</p>

      {!enabled && (
        <p className="mt-3 rounded border border-state-pending/30 bg-state-pendingSurface px-3 py-2 text-body-sm text-state-pending">
          This section is currently turned OFF above. Customers will not see these products until you turn it ON.
        </p>
      )}

      {/* Picker */}
      {!disabled && (
        <div className="mt-4 flex flex-col gap-2 rounded border border-outline-variant/60 bg-surface-low/50 p-3 sm:flex-row sm:items-center">
          <SearchInput
            value={search}
            onChange={setSearch}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && effectivePick) {
                event.preventDefault()
                addSelected()
              }
            }}
            placeholder="Search name, brand or code…"
            aria-label={`Search products for ${title}`}
            className="sm:w-64 sm:shrink-0 lg:w-72"
          />

          <select
            value={effectivePick}
            onChange={(event) => setPickedId(event.target.value)}
            disabled={available.length === 0}
            aria-label={`Choose product for ${title}`}
            className="field min-w-0 flex-1"
          >
            {available.length === 0 ? (
              <option value="">{emptyOptionLabel}</option>
            ) : (
              available.map((product) => {
                const off = discountPercent(product.mrp, product.price)
                const stock = stockOf(product)
                return (
                  <option key={product.id} value={product.id}>
                    {product.name} ({product.brand || product.sku}) · {formatPrice(product.price)}
                    {off > 0 ? ` (${off}% off MRP)` : ''} · {stock > 0 ? `${stock} in stock` : 'Out of stock'}
                  </option>
                )
              })
            )}
          </select>

          <Button
            variant="gold"
            size="sm"
            icon="plus"
            disabled={!effectivePick}
            onClick={addSelected}
            className="shrink-0"
          >
            Add product
          </Button>
        </div>
      )}

      {/* Selected products */}
      {selectedIds.length === 0 ? (
        <div className="mt-4 rounded border border-dashed border-outline-variant/70 py-4">
          <EmptyState icon="package" title={emptyTitle} description={emptyDescription} />
        </div>
      ) : (
        <ul className="mt-4 divide-y divide-outline-variant/40 rounded border border-outline-variant/60 bg-brand-paper">
          {selectedIds.map((id, index) => {
            const product = productsById.get(id)
            if (!product) {
              return (
                <li key={id} className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-body-sm text-ink-muted">
                  <span>Deleted product ({id})</span>
                  {!disabled && (
                    <IconButton icon="trash" tone="danger" label="Remove missing product" onClick={() => remove(id)} />
                  )}
                </li>
              )
            }

            const off = discountPercent(product.mrp, product.price)
            const outOfStock = stockOf(product) <= 0
            return (
              <li key={id} className="flex flex-wrap items-center gap-3 px-3.5 py-2.5">
                <span className="tabular w-6 text-center text-label-sm font-bold text-ink-muted">#{index + 1}</span>
                <ProductThumb product={product} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-semibold text-ink">{product.name}</p>
                    <TierBadge tier={product.tier} />
                    {product.status !== 'Active' && <StatusPill status={product.status} />}
                    {outOfStock && (
                      <Chip tone="halted">
                        {inStockOnly ? 'Out of stock · Hidden on site' : 'Out of stock'}
                      </Chip>
                    )}
                  </div>
                  <p className="mt-0.5 text-body-sm text-ink-muted">
                    {product.sku} · {product.brand} · {outOfStock ? '0 online stock' : `${stockOf(product)} in stock`}
                  </p>
                </div>

                <div className="text-right">
                  <p className="tabular font-semibold text-ink">{formatPrice(product.price)}</p>
                  {off > 0 ? (
                    <p className="tabular text-body-sm text-state-done">
                      <span className="mr-1.5 text-ink-muted line-through">{formatPrice(product.mrp)}</span>
                      {off}% off
                    </p>
                  ) : (
                    <p className="text-body-sm text-ink-muted">Listed price</p>
                  )}
                </div>

                {!disabled && (
                  <div className="flex items-center gap-1">
                    <IconButton
                      icon="chevron-up"
                      label="Move up"
                      disabled={index === 0}
                      onClick={() => move(index, -1)}
                    />
                    <IconButton
                      icon="chevron-down"
                      label="Move down"
                      disabled={index === selectedIds.length - 1}
                      onClick={() => move(index, 1)}
                    />
                    <IconButton icon="trash" tone="danger" label={`Remove ${product.name}`} onClick={() => remove(id)} />
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </Panel>
  )
}

export function ShowcaseControlPage() {
  useDocumentTitle('Website Display')

  const role = useSessionStore((state) => state.user?.role)
  const isOwner = role === 'owner'

  const products = useAdminStore((state) => state.products)
  const productsById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products])

  const settings = useServerResource(() => adminApi.getSettings())
  const { run, busy } = useServerAction()

  const serverShowcase = useMemo(
    () => ({ ...DEFAULT_SHOWCASE, ...(settings.data?.showcase ?? {}) }),
    [settings.data],
  )
  const [draft, setDraft] = useState(DEFAULT_SHOWCASE)

  useEffect(() => {
    setDraft(serverShowcase)
  }, [serverShowcase])

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(serverShowcase), [draft, serverShowcase])
  const patch = (next) => setDraft((current) => ({ ...current, ...next }))

  const save = async () => {
    const result = await run(() => adminApi.saveShowcase(draft), { success: 'Website display settings saved' })
    if (result) settings.reload()
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        actions={
          isOwner && (
            <div className="flex items-center gap-2.5">
              {dirty && <Chip tone="gold">Unsaved changes</Chip>}
              <Button variant="gold" icon="check" loading={busy} disabled={!dirty} onClick={save}>
                Save changes
              </Button>
            </div>
          )
        }
      />

      {!isOwner && (
        <div className="flex items-start gap-3 rounded border border-outline-variant bg-surface-low px-4 py-3">
          <Chip>Read-only</Chip>
          <p className="text-body-sm text-ink-variant">Only the owner can change website display controls and COD access.</p>
        </div>
      )}

      {settings.error ? (
        <div className="card-admin">
          <ErrorState error={settings.error} refused={settings.refused} onRetry={settings.reload} />
        </div>
      ) : settings.loading || !settings.data ? (
        <div className="flex flex-col gap-5">
          <Skeleton className="h-[260px]" />
          <Skeleton className="h-[240px]" />
          <Skeleton className="h-[240px]" />
        </div>
      ) : (
        <>
          <Panel title="Access & Section Controls">
            <p className="mb-3 text-body-sm text-ink-muted">
              Step 1: Turn sections ON or OFF. Step 2: Add products in the sections below, then click <strong>Save changes</strong>.
            </p>
            <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
              {ACCESS_TOGGLES.map((item) => (
                <ToggleRow
                  key={item.key}
                  item={item}
                  checked={Boolean(draft[item.key])}
                  count={item.listKey ? (draft[item.listKey]?.length ?? 0) : undefined}
                  disabled={!isOwner}
                  onToggle={() => patch({ [item.key]: !draft[item.key] })}
                />
              ))}
            </div>
          </Panel>

          {SHOWCASE_SECTIONS.map((section) => (
            <ShowcaseProductSection
              key={section.key}
              title={section.title}
              description={section.description}
              emptyTitle={section.emptyTitle}
              emptyDescription={section.emptyDescription}
              enabled={Boolean(draft[section.toggleKey])}
              inStockOnly={Boolean(section.inStockOnly)}
              selectedIds={draft[section.key] ?? []}
              products={products}
              productsById={productsById}
              disabled={!isOwner}
              onChange={(nextIds) => patch({ [section.key]: nextIds })}
            />
          ))}

          {isOwner && dirty && (
            <div className="flex items-center justify-end gap-3 rounded border border-brand-gold/40 bg-brand-gold/10 px-4 py-3">
              <span className="text-body-sm font-medium text-brand-goldInk">You have unsaved changes.</span>
              <Button variant="ghost" size="sm" onClick={() => setDraft(serverShowcase)}>
                Reset
              </Button>
              <Button variant="gold" icon="check" loading={busy} onClick={save}>
                Save changes
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default ShowcaseControlPage

