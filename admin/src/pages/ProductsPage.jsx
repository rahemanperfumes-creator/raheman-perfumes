import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Button, IconButton } from '@/components/ui/Button'
import { Icon } from '@/components/ui/Icon'
import { StatusPill, TierBadge, StockBar } from '@/components/ui/Badge'
import { DataTable, BulkBar } from '@/components/ui/DataTable'
import { Toolbar, FilterSelect, Pagination } from '@/components/ui/Toolbar'
import { Modal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/Feedback'
import { ProductThumb } from '@/components/ui/ProductThumb'
import { Barcode } from '@/components/ui/Barcode'
import { BarcodeLabelModal } from '@/components/modals/BarcodeLabelModal'
import { ProductFormModal } from '@/components/modals/ProductFormModal'
import { StockAdjustModal } from '@/components/modals/StockAdjustModal'
import useDataTable from '@/hooks/useDataTable'
import useDocumentTitle from '@/hooks/useDocumentTitle'
import { PageHeader } from '@/components/ui/PageHeader'
import { marginPercent, formatPrice, formatNumber } from '@/lib/format'
import { TIER_CODE, stockState } from '@/data/products'
import { useAdminStore, PRODUCT_STATUS_FILTERS } from '@/store/adminStore'
import { useSessionStore } from '@/store/sessionStore'

const TIERS = Object.keys(TIER_CODE)
const STOCK_STATES = ['Healthy', 'Watch', 'Low', 'Out of Stock']

/** The 36px preview tile: the shop's own photograph, or the drawn flacon when
 * the record has no photography yet. */
function Thumb({ product }) {
  return <ProductThumb product={product} />
}

/**
 * The catalogue.
 *
 * Nine columns, matching the products mockup, over the store's product slice.
 * Every row action is a store action — publishing, duplicating and deleting all
 * write through `adminStore`, so this table has no state of its own beyond
 * which modal is open.
 */
export function ProductsPage() {
  useDocumentTitle('Products')

  const isOwner = useSessionStore((state) => state.user?.role === 'owner')
  const products = useAdminStore((state) => state.products)
  const categories = useAdminStore((state) => state.categories)
  const setProductStatus = useAdminStore((state) => state.setProductStatus)
  const setProductsStatus = useAdminStore((state) => state.setProductsStatus)
  const duplicateProduct = useAdminStore((state) => state.duplicateProduct)
  const deleteProduct = useAdminStore((state) => state.deleteProduct)
  const deleteProducts = useAdminStore((state) => state.deleteProducts)

  const [tier, setTier] = useState('All')
  const [category, setCategory] = useState('All')
  const [status, setStatus] = useState('All')
  const [stock, setStock] = useState('All')

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [restocking, setRestocking] = useState(null)
  const [labelling, setLabelling] = useState(null)
  const [pendingDelete, setPendingDelete] = useState(null)

  const [searchParams, setSearchParams] = useSearchParams()

  /**
   * Filter choices from the live taxonomy, never a fixed vocabulary — a
   * dropdown of shelves the database does not have offers filters that can
   * match nothing. Any shelf a listed product still carries is appended, so a
   * row is always filterable even after its category was renamed or removed.
   */
  const categoryFilterNames = useMemo(() => {
    const names = categories.map((category) => category.name)
    products.forEach((product) => {
      if (product.category && !names.includes(product.category)) names.push(product.category)
    })
    return names
  }, [categories, products])

  /** Narrow the rows the table engine sees, so filters and search compose. */
  const scoped = useMemo(
    () =>
      products.filter(
        (product) =>
          (tier === 'All' || product.tier === tier) &&
          (category === 'All' || product.category === category) &&
          (status === 'All' || product.status === status) &&
          (stock === 'All' || stockState(product) === stock),
      ),
    [products, tier, category, status, stock],
  )

  const table = useDataTable({
    rows: scoped,
    pageSize: 10,
    initialSort: { key: 'salesYtd', dir: 'desc' },
    matches: (product, query) =>
      [product.name, product.brand, product.sku, product.category, product.family]
        .join(' ')
        .toLowerCase()
        .includes(query),
    compare: {
      name: (product) => product.name,
      price: (product) => product.price,
      stock: (product) => product.stock,
      salesYtd: (product) => product.salesYtd,
      status: (product) => product.status,
    },
  })

  /**
   * Deep link from the command palette: `?focus=<id>` opens that fragrance for
   * editing. The parameter is cleared afterwards so closing the modal and
   * reloading does not reopen it.
   */
  const focusId = searchParams.get('focus')
  useEffect(() => {
    if (!focusId) return
    const product = products.find((p) => p.id === focusId)
    if (product) {
      setEditing(product)
      setFormOpen(true)
    }
    setSearchParams({}, { replace: true })
  }, [focusId, products, setSearchParams])

  const openCreate = () => {
    setEditing(null)
    setFormOpen(true)
  }

  const onConfirmDelete = () => {
    if (!pendingDelete) return
    if (pendingDelete.ids.length === 1) deleteProduct(pendingDelete.ids[0])
    else deleteProducts(pendingDelete.ids)
    table.clearSelection()
    setPendingDelete(null)
  }

  /** Export exactly what the filters left on screen, not the whole catalogue. */
  const exportCsv = () => {
    const header = ['SKU', 'Barcode', 'Name', 'Brand', 'Type', 'Category', 'Price', 'MRP', 'Cost', 'Margin %', 'Stock', 'Safe limit', 'State', 'Status', 'Sold this year']
    const lines = table.filtered.map((product) => [
      product.sku,
      product.barcode?.value ?? '',
      product.name,
      product.brand,
      product.tier,
      product.category,
      product.price,
      product.mrp,
      product.cost,
      marginPercent(product.cost, product.price),
      product.stock,
      product.safeLimit,
      stockState(product),
      product.status,
      product.salesYtd,
    ])
    const csv = [header, ...lines]
      .map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `rehman-catalogue-${new Date().toISOString().slice(0, 10)}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const columns = [
    {
      key: 'thumb',
      header: '',
      width: '56px',
      render: (product) => <Thumb product={product} />,
    },
    {
      key: 'name',
      header: 'Product & SKU',
      sortable: true,
      width: '220px',
      render: (product) => (
        <span className="block min-w-0">
          <span className="block truncate font-semibold text-ink">{product.name}</span>
          <span className="tabular mt-0.5 block text-body-sm text-ink-muted">
            {product.sku} · {product.brand}
          </span>
        </span>
      ),
    },
    {
      key: 'barcode',
      header: 'Barcode',
      width: '132px',
      render: (product) => (
        /**
         * A miniature of the actual symbol, not just the string. It is small
         * enough that no scanner will read it at this size, and that is fine —
         * this column is for *recognition*: a glance tells staff the label is
         * there and roughly which one it is. The printable size is one click
         * away, and the value is printed under it either way.
         */
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            setLabelling(product)
          }}
          className="block w-full rounded px-1 py-0.5 text-left transition-colors hover:bg-surface-low"
          title={`Print the shelf label for ${product.name}`}
        >
          <Barcode value={product.barcode?.value ?? product.sku} height={22} showValue={false} />
          <span className="tabular mt-0.5 block truncate text-body-sm text-ink-muted">
            {product.barcode?.value ?? '—'}
          </span>
        </button>
      ),
    },
    {
      key: 'tier',
      header: 'Type',
      render: (product) => <TierBadge tier={product.tier} />,
    },
    {
      key: 'category',
      header: 'Category',
      render: (product) => <span className="whitespace-nowrap text-ink-variant">{product.category}</span>,
    },
    {
      key: 'price',
      header: isOwner ? 'Price & profit' : 'Selling price',
      align: 'right',
      sortable: true,
      render: (product) => {
        const margin = marginPercent(product.cost, product.price)
        return (
          <span className="block">
            <span className="tabular block font-semibold text-ink">{formatPrice(product.price)}</span>
            {isOwner && (
              <span className={margin < 20 ? 'block text-body-sm text-error' : 'block text-body-sm text-ink-muted'}>
                {margin}% profit
              </span>
            )}
          </span>
        )
      },
    },
    {
      key: 'stock',
      header: 'Live stock',
      sortable: true,
      render: (product) => (
        <span className="block">
          <StockBar stock={product.stock} safeLimit={product.safeLimit} />
          <span className="mt-0.5 block text-body-sm text-ink-muted">
            limit {product.safeLimit} · {stockState(product)}
          </span>
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      render: (product) => <StatusPill status={product.status} />,
    },
    ...(isOwner
      ? [
          {
            key: 'salesYtd',
            header: 'Sold this year',
            align: 'right',
            sortable: true,
            render: (product) => (
              <span className="block">
                <span className="tabular block font-semibold text-ink">{formatNumber(product.salesYtd)}</span>
                <span className="tabular block text-body-sm text-ink-muted">
                  {formatPrice(product.salesYtd * product.price, { compact: true })}
                </span>
              </span>
            ),
          },
        ]
      : []),
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (product) => (
        <span className="flex items-center justify-end gap-0.5" onClick={(event) => event.stopPropagation()}>
          {isOwner && (
            <IconButton
              icon="edit"
              label={`Edit ${product.name}`}
              onClick={() => {
                setEditing(product)
                setFormOpen(true)
              }}
            />
          )}
          <IconButton
            icon="scan"
            label={`Print the shelf label for ${product.name}`}
            onClick={() => setLabelling(product)}
          />
          {isOwner && (
            <>
              <IconButton
                icon="plus"
                label={`Adjust stock for ${product.name}`}
                tone="gold"
                onClick={() => setRestocking(product)}
              />
              <IconButton
                icon="copy"
                label={`Duplicate ${product.name}`}
                onClick={() => duplicateProduct(product.id)}
              />
              <IconButton
                icon="trash"
                label={`Delete ${product.name}`}
                tone="danger"
                onClick={() => setPendingDelete({ ids: [product.id], label: product.name })}
              />
            </>
          )}
        </span>
      ),
    },
  ]

  const filtersActive = tier !== 'All' || category !== 'All' || status !== 'All' || stock !== 'All'

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        actions={
          isOwner ? (
            <>
              <Button variant="gold" icon="plus" onClick={openCreate}>
                Add fragrance
              </Button>
              <Button variant="ghost" size="sm" icon="download" onClick={exportCsv}>
                Export CSV
              </Button>
            </>
          ) : null
        }
      />

      <div className="card-admin-flush">
        <Toolbar
          search={table.query}
          onSearch={table.setQuery}
          placeholder="Search by name, SKU, brand or family…"
          filters={
            <>
              <FilterSelect
                label="Filter by type"
                value={tier}
                onChange={setTier}
                options={['All', ...TIERS].map((value) => ({ value, label: value === 'All' ? 'All types' : value }))}
              />
              <FilterSelect
                label="Filter by category"
                value={category}
                onChange={setCategory}
                options={['All', ...categoryFilterNames].map((value) => ({
                  value,
                  label: value === 'All' ? 'All categories' : value,
                }))}
              />
              <FilterSelect
                label="Filter by status"
                value={status}
                onChange={setStatus}
                options={PRODUCT_STATUS_FILTERS.map((value) => ({
                  value,
                  label: value === 'All' ? 'Any status' : value,
                }))}
              />
              <FilterSelect
                label="Filter by stock state"
                value={stock}
                onChange={setStock}
                options={['All', ...STOCK_STATES].map((value) => ({
                  value,
                  label: value === 'All' ? 'Any stock' : value,
                }))}
              />
            </>
          }
          actions={
            filtersActive ? (
              <Button
                variant="ghost"
                size="sm"
                icon="close"
                onClick={() => {
                  setTier('All')
                  setCategory('All')
                  setStatus('All')
                  setStock('All')
                }}
              >
                Clear filters
              </Button>
            ) : (
              <span className="text-body-sm text-ink-muted">
                {table.total} of {products.length} shown
              </span>
            )
          }
        />

        {isOwner && (
          <BulkBar count={table.selectedIds.length} onClear={table.clearSelection}>
            <Button variant="outline" size="sm" onClick={() => setProductsStatus(table.selectedIds, 'Active')}>
              Publish
            </Button>
            <Button variant="outline" size="sm" onClick={() => setProductsStatus(table.selectedIds, 'Draft')}>
              Move to draft
            </Button>
            <Button variant="outline" size="sm" onClick={() => setProductsStatus(table.selectedIds, 'Archived')}>
              Archive
            </Button>
            <Button
              variant="danger"
              size="sm"
              icon="trash"
              onClick={() => setPendingDelete({ ids: table.selectedIds, label: `${table.selectedIds.length} fragrances` })}
            >
              Delete
            </Button>
          </BulkBar>
        )}

        <DataTable
          columns={columns}
          rows={table.visible}
          selectable={isOwner}
          selectedIds={table.selectedIds}
          onSelectedChange={table.setSelectedIds}
          sort={table.sort}
          onSortChange={table.setSort}
          onRowClick={
            isOwner
              ? (product) => {
                  setEditing(product)
                  setFormOpen(true)
                }
              : undefined
          }
          empty={
            <EmptyState
              icon="package"
              title="No fragrances match"
              description={
                filtersActive
                  ? 'Loosen a filter or clear the search to see the rest of the catalogue.'
                  : 'Add the first fragrance to the catalogue to get started.'
              }
              action={
                isOwner ? (
                  <Button variant="gold" size="sm" icon="plus" onClick={openCreate}>
                    Add fragrance
                  </Button>
                ) : null
              }
            />
          }
        />

        <Pagination
          page={table.page}
          pageSize={table.pageSize}
          total={table.total}
          onPageChange={table.setPage}
          onPageSizeChange={table.setPageSize}
        />
      </div>

      <ProductFormModal open={formOpen} onClose={() => setFormOpen(false)} product={editing} />
      <StockAdjustModal open={Boolean(restocking)} onClose={() => setRestocking(null)} product={restocking} />
      <BarcodeLabelModal open={Boolean(labelling)} onClose={() => setLabelling(null)} product={labelling} />

      <Modal
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        title="Delete from the catalogue?"
        description={pendingDelete?.label}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPendingDelete(null)}>
              Keep
            </Button>
            <Button variant="danger" icon="trash" onClick={onConfirmDelete}>
              Delete
            </Button>
          </>
        }
      >
        <p className="flex items-start gap-2.5 text-body-sm text-ink-variant">
          <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0 text-error" />
          <span>
            This removes the product from your live list and hides it from the website. If any customer has bought it
            before, it will be kept as <strong>Archived</strong> instead so old bills stay accurate. An archived
            product leaves the website, stays here under <em>Any status → Archived</em>, and can be made Active again.
            Stock history is always kept.
          </span>
        </p>
      </Modal>
    </div>
  )
}

export default ProductsPage
