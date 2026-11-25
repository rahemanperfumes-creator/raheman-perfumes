import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, IconButton } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { Panel, StatCard } from '@/components/ui/StatCard'
import { StatusPill, StockBar, TierBadge } from '@/components/ui/Badge'
import { BarChart, ShareBars } from '@/components/ui/Chart'
import { PillTabs } from '@/components/ui/Toolbar'
import { DataTable } from '@/components/ui/DataTable'
import { EmptyState } from '@/components/ui/Feedback'
import { ProductThumb } from '@/components/ui/ProductThumb'
import { ProductFormModal } from '@/components/modals/ProductFormModal'
import { StockAdjustModal } from '@/components/modals/StockAdjustModal'
import useDocumentTitle from '@/hooks/useDocumentTitle'
import { PageHeader } from '@/components/ui/PageHeader'
import { dashboardTotals, recentOrders, topSellers, dailySeries, channelMix, tierMix } from '@/lib/derive'
import { formatPrice, formatCompactINR, formatRelative, initials } from '@/lib/format'
import { useAdminStore } from '@/store/adminStore'
import { useSessionStore } from '@/store/sessionStore'
import { useUiStore } from '@/store/uiStore'

const RANGES = [
  { value: 7, label: '7 days' },
  { value: 30, label: '30 days' },
  { value: 90, label: '90 days' },
]

/** Percentage change between two windows. Zero-safe: no previous, no claim. */
function deltaPercent(current, previous) {
  if (!previous) return null
  return ((current - previous) / previous) * 100
}

/** Sum a slice of the daily series into headline figures. */
function sumRows(rows) {
  return {
    revenue: rows.reduce((sum, day) => sum + day.revenue, 0),
    orders: rows.reduce((sum, day) => sum + day.orders, 0),
  }
}

/**
 * The executive dashboard.
 *
 * Every figure on this page is derived from the hydrated order book and
 * catalogue — none is typed in and none is a seeded series. That is what makes
 * it a real dashboard rather than a screenshot: pack an order in the drawer and
 * the revenue tile, the status counts and the activity feed all move together.
 */
export function DashboardPage() {
  useDocumentTitle('Dashboard')

  const navigate = useNavigate()
  const user = useSessionStore((state) => state.user)
  const isOwner = user?.role === 'owner'
  const products = useAdminStore((state) => state.products)
  const orders = useAdminStore((state) => state.orders)
  const customers = useAdminStore((state) => state.customers)
  const ledger = useAdminStore((state) => state.ledger)
  const pushToast = useUiStore((state) => state.pushToast)

  const [range, setRange] = useState(30)
  const [addOpen, setAddOpen] = useState(false)
  const [restockId, setRestockId] = useState(null)
  const [refreshing, setRefreshing] = useState(false)

  const totals = useMemo(
    () => dashboardTotals({ products, orders, customers, ledger }),
    [products, orders, customers, ledger],
  )

  const series = useMemo(
    () => dailySeries(orders, range * 2).slice(range),
    [orders, range],
  )
  const comparison = useMemo(() => {
    const full = dailySeries(orders, range * 2)
    return { current: sumRows(full.slice(range)), previous: sumRows(full.slice(0, range)) }
  }, [orders, range])

  const channels = useMemo(() => channelMix(orders), [orders])
  const tiers = useMemo(() => tierMix(orders, products), [orders, products])

  const feed = useMemo(() => recentOrders(orders, 6), [orders])
  /* Only the ones that have actually sold. A bottle listed at "0 units" under a
     heading that reads "Best sellers" is the kind of confident wrong statement a
     new owner remembers all day. */
  const sellers = useMemo(() => topSellers(products, 5).filter((product) => product.salesYtd > 0), [products])
  const topProducts = useMemo(() => {
    if (sellers.length > 0) return sellers
    return [...products].filter((product) => product.status === 'Active').slice(0, 5)
  }, [sellers, products])

  const revenueSpark = useMemo(() => series.map((day) => day.revenue), [series])
  const orderSpark = useMemo(() => series.map((day) => day.orders), [series])
  const avgOrderSpark = useMemo(
    () => series.map((day) => (day.orders > 0 ? Math.round(day.revenue / day.orders) : 0)),
    [series],
  )

  const restockProduct = products.find((product) => product.id === restockId) ?? null

  /*
   * Is there anything to count yet?
   *
   * Every figure below is honest arithmetic, but arithmetic over an empty order
   * book prints six zeros and an empty chart, and a person opening the panel for
   * the first time cannot tell "nothing has sold" apart from "the shop is dying".
   * So the sales machinery waits for a sale, and what is left is stated in words.
   */
  const hasSales = orders.length > 0
  const liveCount = products.filter((product) => product.status === 'Active').length

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

  /**
   * Re-read the shop from the server. There is nothing to fall back to, so an
   * unreachable backend leaves the panel empty and the toast says so — a refresh
   * that quietly showed stale rows would be worse than no refresh at all.
   */
  const onRefresh = async () => {
    setRefreshing(true)
    const ok = await useAdminStore.getState().hydrate()
    setRefreshing(false)
    pushToast({
      title: ok ? 'Loaded from the backend' : 'Backend unreachable',
      description: ok
        ? `${useAdminStore.getState().products.length} fragrances read over the API.`
        : 'The panel could not reach the server, so it shows nothing rather than stale rows.',
      tone: ok ? 'success' : 'error',
    })
  }

  const columns = [
    {
      key: 'id',
      header: 'Order',
      render: (row) => <span className="tabular font-semibold text-ink">{row.id}</span>,
    },
    {
      key: 'customer',
      header: 'Customer',
      render: (row) => (
        <span className="flex items-center gap-2">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface text-[10px] font-bold text-ink-variant">
            {initials(row.customer)}
          </span>
          <span className="truncate text-ink-variant">{row.customer}</span>
        </span>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      render: (row) => <span className="tabular font-semibold text-ink">{formatPrice(row.amount)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => <StatusPill status={row.status} />,
    },
    {
      key: 'placedAt',
      header: 'Placed',
      align: 'right',
      render: (row) => <span className="whitespace-nowrap text-ink-muted">{formatRelative(row.placedAt)}</span>,
    },
  ]

  return (
    <div className="flex flex-col gap-6">
      {/* Greeting and quick actions */}
      <PageHeader
        title={
          <span className="flex items-center gap-2.5">
            {greeting}, {isOwner ? 'Owner' : user?.name || 'Staff'} <span aria-hidden="true">👋</span>
          </span>
        }
        description="Live overview of revenue, store orders, and fragrance inventory."
        actions={
          <>
            {isOwner ? (
              <Button variant="gold" icon="plus" onClick={() => setAddOpen(true)}>
                Add fragrance
              </Button>
            ) : (
              <Button variant="gold" icon="receipt" to="/billing">
                Counter Sale
              </Button>
            )}
            <Button variant="outline" icon="warehouse" to="/inventory">
              Stock
            </Button>
            <Button variant="ghost" size="sm" icon="refresh" onClick={onRefresh} loading={refreshing}>
              Refresh
            </Button>
          </>
        }
      />

      {/* Stat tiles. */}
      {hasSales ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {isOwner && (
            <StatCard
              label={`Revenue · ${range}d`}
              value={formatCompactINR(comparison.current.revenue)}
              delta={deltaPercent(comparison.current.revenue, comparison.previous.revenue)}
              hint={`vs prev ${range} days`}
              icon="trending-up"
              spark={revenueSpark}
              to="/analytics"
            />
          )}
          <StatCard
            label={`Orders · ${range}d`}
            value={comparison.current.orders.toLocaleString('en-IN')}
            delta={deltaPercent(comparison.current.orders, comparison.previous.orders)}
            hint={`vs prev ${range} days`}
            icon="bag"
            tone="active"
            spark={orderSpark}
            to="/orders"
          />
          {isOwner && (
            <StatCard
              label="Average order"
              value={formatPrice(comparison.current.orders ? comparison.current.revenue / comparison.current.orders : 0)}
              delta={deltaPercent(
                comparison.current.orders ? comparison.current.revenue / comparison.current.orders : 0,
                comparison.previous.orders ? comparison.previous.revenue / comparison.previous.orders : 0,
              )}
              hint="Avg cart value"
              icon="percent"
              tone="pending"
              spark={avgOrderSpark}
            />
          )}
          <StatCard
            label="Customers"
            value={totals.customers.toLocaleString('en-IN')}
            hint={`${customers.filter((c) => c.status === 'VIP').length} marked VIP`}
            icon="users"
            tone="done"
            to="/customers"
          />
          <StatCard
            label="Low stock"
            value={totals.lowStock.length.toLocaleString('en-IN')}
            hint={isOwner ? `${formatPrice(totals.stockValueAtCost, { compact: true })} at cost` : 'Products needing restock'}
            icon="alert"
            tone={totals.lowStock.length ? 'halted' : 'done'}
            to="/inventory"
          />
          <StatCard
            label="Active fragrances"
            value={totals.activeProducts.toLocaleString('en-IN')}
            hint={`${totals.draftProducts} draft · ${totals.archivedProducts} archived`}
            icon="package"
            tone="gold"
            to="/products"
          />
        </div>
      ) : null}

      {/* Analytics row: Revenue performance + Channel/Tier distribution */}
      {isOwner && hasSales ? (
        <div className="grid gap-5 xl:grid-cols-3 items-stretch">
          {/* Revenue chart (Left 2/3) */}
          <div className="xl:col-span-2 flex flex-col">
            <Panel
              title="Revenue Overview"
              action={<PillTabs tabs={RANGES} value={range} onChange={setRange} />}
              className="h-full flex flex-col justify-between"
            >
              <BarChart data={series} height={210} />
            </Panel>
          </div>

          {/* Sales Mix Panels (Right 1/3) */}
          <div className="flex flex-col gap-5">
            <Panel title="Where orders come from" className="flex-1">
              <ShareBars rows={channels} formatValue={(row) => `${row.share}% · ${formatCompactINR(row.revenue)}`} />
            </Panel>
            <Panel title="Which types sold" className="flex-1">
              <ShareBars rows={tiers} formatValue={(row) => `${row.share}% · ${formatCompactINR(row.revenue)}`} />
            </Panel>
          </div>
        </div>
      ) : null}

      {/* Operations row: Recent Orders (Left 2/3) + Stock Alerts & Catalogue Highlights (Right 1/3) */}
      <div className="grid gap-5 xl:grid-cols-3 items-start">
        {/* Recent orders (Left 2/3) */}
        <div className="xl:col-span-2">
          <Panel
            title="Recent orders"
            flush
            action={
              <Button variant="ghost" size="sm" iconRight="arrow-right" to="/orders">
                All orders
              </Button>
            }
          >
            <DataTable
              columns={columns}
              rows={feed}
              onRowClick={(row) => navigate(`/orders?focus=${row.id}`)}
              empty={<EmptyState icon="bag" title="No orders yet" />}
            />
          </Panel>
        </div>

        {/* Inventory & Catalogue (Right 1/3) */}
        <div className="flex flex-col gap-5">
          {/* Needs restocking */}
          <Panel
            title="Needs restocking"
            action={
              <Button variant="ghost" size="sm" to="/inventory">
                Stock
              </Button>
            }
            bodyClassName={totals.lowStock.length ? 'p-0' : undefined}
          >
            {totals.lowStock.length === 0 ? (
              <div className="p-4 flex items-center gap-2 text-body-sm text-state-done font-medium">
                <Icon name="check" className="h-4 w-4" />
                <span>All stock levels healthy</span>
              </div>
            ) : (
              <ul className="divide-y divide-outline-variant/40">
                {totals.lowStock.slice(0, 5).map((product) => (
                  <li key={product.id} className="flex items-center gap-3 px-4 py-3">
                    <ProductThumb product={product} className="h-9 w-9" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-body-sm font-semibold text-ink">{product.name}</p>
                      <div className="mt-0.5">
                        <StockBar stock={product.stock} safeLimit={product.safeLimit} />
                      </div>
                    </div>
                    {isOwner && (
                      <IconButton
                        icon="plus"
                        label={`Restock ${product.name}`}
                        tone="gold"
                        onClick={() => setRestockId(product.id)}
                      />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {/* Top sellers or active catalogue highlights */}
          {topProducts.length > 0 ? (
            <Panel
              title={sellers.length > 0 ? 'Best sellers' : 'Catalogue highlights'}
              action={
                <Button variant="ghost" size="sm" to="/products">
                  Products
                </Button>
              }
            >
              <ul className="flex flex-col gap-3">
                {topProducts.map((product, index) => (
                  <li key={product.id} className="flex items-center gap-3">
                    <span className="tabular w-4 shrink-0 font-serif text-body-md font-semibold text-ink-muted">
                      {index + 1}
                    </span>
                    <ProductThumb product={product} className="h-9 w-9" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-body-sm font-semibold text-ink">{product.name}</span>
                      <span className="mt-0.5 flex items-center gap-2">
                        <TierBadge tier={product.tier} size="sm" />
                        <span className="text-body-sm text-ink-muted">
                          {sellers.length > 0 ? `${product.salesYtd} units sold` : `${product.stock} on hand`}
                        </span>
                      </span>
                    </span>
                    <span className="tabular shrink-0 text-body-sm font-semibold text-ink">
                      {formatCompactINR(sellers.length > 0 ? product.salesYtd * product.price : product.price)}
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}
        </div>
      </div>

      <ProductFormModal open={addOpen} onClose={() => setAddOpen(false)} />
      <StockAdjustModal open={Boolean(restockProduct)} onClose={() => setRestockId(null)} product={restockProduct} />
    </div>
  )
}

export default DashboardPage
