import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { StatusPill, TierBadge, StockBar, Chip } from '@/components/ui/Badge'
import { DataTable } from '@/components/ui/DataTable'
import { Toolbar, FilterSelect, Pagination } from '@/components/ui/Toolbar'
import { Panel, StatCard } from '@/components/ui/StatCard'
import { EmptyState } from '@/components/ui/Feedback'
import { StockAdjustModal } from '@/components/modals/StockAdjustModal'
import { ShopReserveModal } from '@/components/modals/ShopReserveModal'
import { ProductThumb } from '@/components/ui/ProductThumb'
import useDataTable from '@/hooks/useDataTable'
import useDocumentTitle from '@/hooks/useDocumentTitle'
import { PageHeader } from '@/components/ui/PageHeader'
import { dashboardTotals } from '@/lib/derive'
import { formatPrice, formatCompactINR, formatNumber, formatDateTime, formatRelative } from '@/lib/format'
import { TIER_CODE, stockState } from '@/data/products'
import { ADJUSTMENT_REASONS } from '@/data/inventory'
import { useAdminStore } from '@/store/adminStore'
import { useSessionStore } from '@/store/sessionStore'

const TIERS = Object.keys(TIER_CODE)
const STATES = ['Healthy', 'Watch', 'Low', 'Out of Stock']

/**
 * The stock room.
 *
 * Two tables: what is on the shelf now, and the ledger of how it got there.
 * Nothing on this screen can set a figure directly — the only write is a signed
 * movement through `StockAdjustModal`, which appends to the ledger and moves the
 * shelf in one action, so the two tables cannot disagree.
 */
export function InventoryPage() {
  useDocumentTitle('Stock')

  const isOwner = useSessionStore((state) => state.user?.role === 'owner')
  const products = useAdminStore((state) => state.products)
  const ledger = useAdminStore((state) => state.ledger)

  const [tier, setTier] = useState('All')
  const [state, setState] = useState('All')
  const [lowOnly, setLowOnly] = useState(false)
  const [reason, setReason] = useState('All')
  const [restocking, setRestocking] = useState(null)
  const [reserving, setReserving] = useState(null)

  const totals = useMemo(() => dashboardTotals({ products, ledger }), [products, ledger])

  /** The shelf, narrowed by the screen's own filters. */
  const scoped = useMemo(
    () =>
      products.filter(
        (product) =>
          (tier === 'All' || product.tier === tier) &&
          (state === 'All' || stockState(product) === state) &&
          (!lowOnly || product.stock <= product.safeLimit),
      ),
    [products, tier, state, lowOnly],
  )

  const shelf = useDataTable({
    rows: scoped,
    pageSize: 10,
    initialSort: { key: 'stock', dir: 'asc' },
    matches: (product, query) =>
      [product.name, product.sku, product.brand, product.category].join(' ').toLowerCase().includes(query),
    compare: {
      name: (product) => product.name,
      sku: (product) => product.sku,
      stock: (product) => product.stock,
      shopReserve: (product) => product.shopReserve ?? 0,
      safeLimit: (product) => product.safeLimit,
      lastCompounded: (product) => product.lastCompounded ?? '',
      state: (product) => STATES.indexOf(stockState(product)),
    },
  })

  const movements = useMemo(
    () => (reason === 'All' ? ledger : ledger.filter((row) => row.reason === reason)),
    [ledger, reason],
  )

  const book = useDataTable({
    rows: movements,
    pageSize: 8,
    matches: (row, query) => [row.name, row.sku, row.reason, row.by].join(' ').toLowerCase().includes(query),
    compare: {
      at: (row) => row.at,
      name: (row) => row.name,
      change: (row) => row.change,
      reason: (row) => row.reason,
    },
  })

  const lowCount = totals.lowStock.length

  const shelfColumns = [
    {
      key: 'name',
      header: 'Product',
      sortable: true,
      render: (product) => (
        <span className="flex min-w-0 items-center gap-2.5">
          <ProductThumb product={product} className="h-9 w-9" />
          <span className="block min-w-0">
            <span className="block truncate font-semibold text-ink">{product.name}</span>
            <span className="block text-body-sm text-ink-muted">
              {product.brand} · {product.category}
            </span>
          </span>
        </span>
      ),
    },
    {
      key: 'sku',
      header: 'SKU',
      sortable: true,
      render: (product) => <span className="tabular whitespace-nowrap text-ink-variant">{product.sku}</span>,
    },
    {
      key: 'tier',
      /* "Provenance" is the trade's word for whether you blended it or bought it
         in. The owner only ever needs the type. */
      header: 'Type',
      render: (product) => <TierBadge tier={product.tier} />,
    },
    {
      key: 'stock',
      header: 'Current stock',
      sortable: true,
      render: (product) => (
        <span className="block">
          <StockBar stock={product.stock} safeLimit={product.safeLimit} />
          <span className="mt-0.5 block whitespace-nowrap text-body-sm text-ink-muted">
            {/* What the website may sell — the shelf less the shop's reserve. */}
            {product.shopReserve > 0
              ? `${Math.max(0, product.stock - product.shopReserve)} online`
              : isOwner
                ? `${formatPrice(product.stock * product.cost, { compact: true })} at cost`
                : `${product.stock} on shelf`}
          </span>
        </span>
      ),
    },
    {
      key: 'shopReserve',
      header: 'Kept for shop',
      align: 'right',
      sortable: true,
      render: (product) =>
        isOwner ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              setReserving(product)
            }}
            className="group inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 text-ink-variant transition-colors hover:bg-brand-gold/15 hover:text-brand-goldInk"
            aria-label={`Set how many bottles of ${product.name} to keep for the shop`}
            title="Bottles kept only for shop counter sales"
          >
            {product.shopReserve > 0 ? (
              <span className="tabular font-semibold text-brand-goldInk">{product.shopReserve}</span>
            ) : (
              <span className="text-ink-muted">—</span>
            )}
            <Icon name="edit" className="h-3.5 w-3.5 opacity-50 group-hover:opacity-100" />
          </button>
        ) : (
          <span className="tabular text-ink-muted">{product.shopReserve > 0 ? product.shopReserve : '—'}</span>
        ),
    },
    {
      key: 'safeLimit',
      header: 'Low stock limit',
      align: 'right',
      sortable: true,
      render: (product) => <span className="tabular text-ink-variant">{product.safeLimit}</span>,
    },
    {
      key: 'state',
      header: 'State',
      sortable: true,
      render: (product) => <StatusPill status={stockState(product)} />,
    },
    {
      key: 'lastCompounded',
      header: 'Last blended',
      align: 'right',
      sortable: true,
      render: (product) =>
        product.lastCompounded ? (
          <span className="tabular whitespace-nowrap text-ink-variant">{product.lastCompounded}</span>
        ) : (
          <span className="text-ink-muted">—</span>
        ),
    },
    ...(isOwner
      ? [
          {
            key: 'actions',
            header: 'Quick action',
            align: 'right',
            render: (product) => (
              <span className="flex items-center justify-end gap-1" onClick={(event) => event.stopPropagation()}>
                <Button variant="outline" size="sm" icon="plus" onClick={() => setRestocking(product)}>
                  Adjust
                </Button>
              </span>
            ),
          },
        ]
      : []),
  ]

  const ledgerColumns = [
    {
      key: 'at',
      header: 'When',
      sortable: true,
      render: (row) => (
        <span className="block whitespace-nowrap">
          <span className="block text-ink-variant">{formatRelative(row.at)}</span>
          <span className="block text-body-sm text-ink-muted">{formatDateTime(row.at)}</span>
        </span>
      ),
    },
    {
      key: 'name',
      header: 'Product & SKU',
      sortable: true,
      render: (row) => (
        <span className="block min-w-0">
          <span className="block truncate font-medium text-ink">{row.name}</span>
          <span className="tabular block text-body-sm text-ink-muted">{row.sku}</span>
        </span>
      ),
    },
    {
      key: 'change',
      header: 'Stock change',
      align: 'right',
      sortable: true,
      render: (row) => (
        <span className="block whitespace-nowrap">
          <span
            className={
              row.change >= 0
                ? 'tabular inline-flex items-center gap-1 font-semibold text-state-done'
                : 'tabular inline-flex items-center gap-1 font-semibold text-state-halted'
            }
          >
            <Icon name={row.change >= 0 ? 'trending-up' : 'trending-down'} className="h-3.5 w-3.5" />
            {row.change >= 0 ? `+${row.change}` : row.change}
          </span>
          <span className="tabular block text-body-sm text-ink-muted">
            {row.previous} → {row.next}
          </span>
        </span>
      ),
    },
    {
      key: 'reason',
      header: 'Reason',
      sortable: true,
      render: (row) => <span className="whitespace-nowrap text-ink-variant">{row.reason}</span>,
    },
    {
      key: 'by',
      header: 'Approved by',
      render: (row) => <span className="whitespace-nowrap text-ink-variant">{row.by}</span>,
    },
  ]

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        actions={
          <Button
            variant={lowOnly ? 'gold' : 'outline'}
            icon="alert"
            onClick={() => {
              setLowOnly((current) => !current)
              shelf.setPage(1)
            }}
          >
            {lowOnly ? 'Showing low stock' : 'Show only what needs restocking'}
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {isOwner ? (
          <StatCard
            label="Stock value (cost)"
            value={formatCompactINR(totals.stockValueAtCost)}
            hint="total cost of current stock"
            icon="warehouse"
          />
        ) : (
          <StatCard
            label="Tracked products"
            value={formatNumber(products.length)}
            hint="read-only stock view"
            icon="warehouse"
          />
        )}
        <StatCard
          label="Stock value (selling)"
          value={formatCompactINR(totals.stockValueAtRetail)}
          hint="if all bottles sell at full price"
          icon="tag"
          tone="active"
        />
        <StatCard
          label="Low stock products"
          value={formatNumber(lowCount)}
          hint={lowCount ? 'needs restock soon' : 'all products have enough stock'}
          icon="alert"
          tone={lowCount ? 'halted' : 'done'}
        />
        <StatCard
          label="Stock changes"
          value={formatNumber(ledger.length)}
          hint={`last one: ${totals.ledgerDay || '—'}`}
          icon="history"
          tone="gold"
        />
      </div>

      <div className="card-admin-flush">
        <Toolbar
          search={shelf.query}
          onSearch={shelf.setQuery}
          placeholder="Search by name, SKU or brand…"
          filters={
            <>
              <FilterSelect
                label="Filter by type"
                value={tier}
                onChange={setTier}
                options={['All', ...TIERS].map((value) => ({ value, label: value === 'All' ? 'All types' : value }))}
              />
              <FilterSelect
                label="Filter by stock state"
                value={state}
                onChange={setState}
                options={['All', ...STATES].map((value) => ({ value, label: value === 'All' ? 'Any state' : value }))}
              />
            </>
          }
          actions={<span className="text-body-sm text-ink-muted">{shelf.total} products</span>}
        />

        <DataTable
          columns={shelfColumns}
          rows={shelf.visible}
          sort={shelf.sort}
          onSortChange={shelf.setSort}
          onRowClick={isOwner ? (product) => setRestocking(product) : undefined}
          empty={
            <EmptyState
              icon="warehouse"
              title={lowOnly ? 'Nothing is low' : 'Nothing matches'}
              description={
                lowOnly
                  ? 'Every fragrance is comfortably above its safe limit. Turn the filter off to see all your stock.'
                  : 'Change a filter to see the rest of your stock.'
              }
              action={
                lowOnly ? (
                  <Button variant="outline" size="sm" onClick={() => setLowOnly(false)}>
                    Show everything
                  </Button>
                ) : null
              }
            />
          }
        />

        <Pagination
          page={shelf.page}
          pageSize={shelf.pageSize}
          total={shelf.total}
          onPageChange={shelf.setPage}
          onPageSizeChange={shelf.setPageSize}
        />
      </div>

      <Panel
        title="Stock history"
        description="Every stock change, newest first. Added when you adjust stock above."
        action={
          <div className="flex items-center gap-2">
            <Chip>{book.total} changes</Chip>
            <FilterSelect
              label="Filter changes by reason"
              value={reason}
              onChange={setReason}
              options={['All', ...ADJUSTMENT_REASONS].map((value) => ({
                value,
                label: value === 'All' ? 'Any reason' : value,
              }))}
            />
          </div>
        }
        flush
      >
        <Toolbar
          search={book.query}
          onSearch={book.setQuery}
          placeholder="Search changes by product, SKU, reason or staff…"
          actions={<span className="text-body-sm text-ink-muted">{book.total} shown</span>}
        />

        <DataTable
          columns={ledgerColumns}
          rows={book.visible}
          sort={book.sort}
          onSortChange={book.setSort}
          empty={
            <EmptyState
              icon="history"
              title="No stock changes yet"
              description="Update a product's stock and it will show up here."
            />
          }
        />

        <Pagination
          page={book.page}
          pageSize={book.pageSize}
          total={book.total}
          onPageChange={book.setPage}
          onPageSizeChange={book.setPageSize}
        />
      </Panel>

      <StockAdjustModal open={Boolean(restocking)} onClose={() => setRestocking(null)} product={restocking} />
      <ShopReserveModal open={Boolean(reserving)} onClose={() => setReserving(null)} product={reserving} />
    </div>
  )
}

export default InventoryPage
