import { useMemo, useState } from 'react'
import { Button, IconButton } from '@/components/ui/Button'
import { StatusPill, TierBadge, Chip } from '@/components/ui/Badge'
import { DataTable } from '@/components/ui/DataTable'
import { Toolbar, FilterSelect, Pagination } from '@/components/ui/Toolbar'
import { Panel } from '@/components/ui/StatCard'
import { EmptyState } from '@/components/ui/Feedback'
import { TaxonomyModal } from '@/components/modals/TaxonomyModal'
import useDataTable from '@/hooks/useDataTable'
import useDocumentTitle from '@/hooks/useDocumentTitle'
import { PageHeader } from '@/components/ui/PageHeader'
import { formatCompactINR, formatNumber } from '@/lib/format'
import { CATEGORY_STATUSES, categoryStats } from '@/data/categories'
import { BRAND_HOUSES, BRAND_STATUSES, brandStats } from '@/data/brands'
import { useAdminStore } from '@/store/adminStore'
import { useSessionStore } from '@/store/sessionStore'

/**
 * Categories and brands.
 *
 * Both tables are half editorial, half derived: the name, description and
 * status are records a human keeps, while products, units and revenue are
 * rolled up from the catalogue by `categoryStats` and `brandStats` on every
 * render. Nothing counts anything twice, so adding a fragrance moves these
 * numbers without anyone touching this screen.
 */
export function CategoriesBrandsPage() {
  useDocumentTitle('Categories & Brands')

  const isOwner = useSessionStore((state) => state.user?.role === 'owner')
  const products = useAdminStore((state) => state.products)
  const categories = useAdminStore((state) => state.categories)
  const brands = useAdminStore((state) => state.brands)
  const deleteCategory = useAdminStore((state) => state.deleteCategory)
  const deleteBrand = useAdminStore((state) => state.deleteBrand)

  const [categoryStatus, setCategoryStatus] = useState('All')
  const [brandStatus, setBrandStatus] = useState('All')
  const [house, setHouse] = useState('All')
  const [editing, setEditing] = useState(null) // { kind, record }

  const categoryRollup = useMemo(() => categoryStats(products), [products])
  const brandRollup = useMemo(() => brandStats(products), [products])

  const categoryRows = useMemo(
    () => categories.filter((category) => categoryStatus === 'All' || category.status === categoryStatus),
    [categories, categoryStatus],
  )

  const brandRows = useMemo(
    () =>
      brands.filter(
        (brand) => (brandStatus === 'All' || brand.status === brandStatus) && (house === 'All' || brand.house === house),
      ),
    [brands, brandStatus, house],
  )

  const shelves = useDataTable({
    rows: categoryRows,
    pageSize: 10,
    matches: (category, query) =>
      [category.name, category.slug, category.description].join(' ').toLowerCase().includes(query),
    compare: {
      name: (category) => category.name,
      products: (category) => categoryRollup.get(category.name)?.products ?? 0,
      revenue: (category) => categoryRollup.get(category.name)?.revenue ?? 0,
      shelf: (category) => category.shelf,
    },
  })

  const maisons = useDataTable({
    rows: brandRows,
    pageSize: 10,
    matches: (brand, query) => [brand.name, brand.country, brand.house].join(' ').toLowerCase().includes(query),
    compare: {
      name: (brand) => brand.name,
      products: (brand) => brandRollup.get(brand.name)?.products ?? 0,
      revenue: (brand) => brandRollup.get(brand.name)?.revenue ?? 0,
      since: (brand) => brand.since,
    },
  })

  const categoryColumns = [
    {
      key: 'name',
      header: 'Category',
      sortable: true,
      render: (category) => (
        <span className="block min-w-0">
          <span className="block font-semibold text-ink">{category.name}</span>
          <span className="block text-body-sm text-ink-muted">/{category.slug}</span>
        </span>
      ),
    },
    {
      key: 'description',
      header: 'Description',
      render: (category) => (
        <span className="block max-w-md text-body-sm text-ink-variant">{category.description}</span>
      ),
    },
    {
      key: 'products',
      header: 'Products',
      align: 'right',
      sortable: true,
      render: (category) => {
        const stats = categoryRollup.get(category.name)
        return (
          <span className="block">
            <span className="tabular block font-semibold text-ink">{stats?.products ?? 0}</span>
            {stats?.lowStock ? (
              <span className="block text-body-sm text-error">{stats.lowStock} low</span>
            ) : (
              <span className="block text-body-sm text-ink-muted">{formatNumber(stats?.units ?? 0)} sold this year</span>
            )}
          </span>
        )
      },
    },
    ...(isOwner
      ? [
          {
            key: 'revenue',
            header: 'Revenue',
            align: 'right',
            sortable: true,
            render: (category) => (
              <span className="tabular font-semibold text-ink">
                {formatCompactINR(categoryRollup.get(category.name)?.revenue ?? 0)}
              </span>
            ),
          },
        ]
      : []),
    {
      key: 'shelf',
      header: 'Shelf',
      align: 'right',
      sortable: true,
      render: (category) => <span className="tabular text-ink-variant">{category.shelf}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (category) => <StatusPill status={category.status} />,
    },
    ...(isOwner
      ? [
          {
            key: 'actions',
            header: 'Actions',
            align: 'right',
            render: (category) => (
              <span className="flex items-center justify-end gap-0.5">
                <IconButton
                  icon="edit"
                  label={`Edit ${category.name}`}
                  onClick={() => setEditing({ kind: 'category', record: category })}
                />
                <IconButton
                  icon="trash"
                  label={`Delete ${category.name}`}
                  tone="danger"
                  onClick={() => deleteCategory(category.id)}
                />
              </span>
            ),
          },
        ]
      : []),
  ]

  const brandColumns = [
    {
      key: 'name',
      header: 'Brand',
      sortable: true,
      render: (brand) => (
        <div className="flex items-center gap-3 min-w-0">
          {brand.logo ? (
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-outline-variant bg-brand-paper p-0.5 shadow-sm">
              <img src={brand.logo} alt={brand.name} className="max-h-full max-w-full object-contain" />
            </div>
          ) : (
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-outline-variant bg-surface-low font-serif text-xs font-semibold text-ink-muted">
              {brand.short ? brand.short[0] : (brand.name ? brand.name[0] : 'B')}
            </div>
          )}
          <span className="block min-w-0">
            <span className="block font-semibold text-ink truncate">{brand.name}</span>
            <span className="block text-body-sm text-ink-muted truncate">
              {brand.country} · since {brand.since}
            </span>
          </span>
        </div>
      ),
    },
    {
      key: 'house',
      /* The values are trade names from `data/brands.js`. "House" is the word the
         perfume trade uses for itself; "group" is the word a shopkeeper uses. */
      header: 'Group',
      render: (brand) => <span className="whitespace-nowrap text-ink-variant">{brand.house}</span>,
    },
    {
      key: 'tiers',
      header: 'Types stocked',
      render: (brand) => {
        const tiers = [...(brandRollup.get(brand.name)?.tiers ?? [])]
        if (tiers.length === 0) return <span className="text-ink-muted">—</span>
        return (
          <span className="flex flex-wrap gap-1">
            {tiers.map((tier) => (
              <TierBadge key={tier} tier={tier} />
            ))}
          </span>
        )
      },
    },
    {
      key: 'products',
      header: 'Products',
      align: 'right',
      sortable: true,
      render: (brand) => <span className="tabular font-semibold text-ink">{brandRollup.get(brand.name)?.products ?? 0}</span>,
    },
    ...(isOwner
      ? [
          {
            key: 'revenue',
            header: 'Revenue',
            align: 'right',
            sortable: true,
            render: (brand) => (
              <span className="tabular font-semibold text-ink">
                {formatCompactINR(brandRollup.get(brand.name)?.revenue ?? 0)}
              </span>
            ),
          },
        ]
      : []),
    {
      key: 'status',
      header: 'Status',
      render: (brand) => <StatusPill status={brand.status} />,
    },
    ...(isOwner
      ? [
          {
            key: 'actions',
            header: 'Actions',
            align: 'right',
            render: (brand) => (
              <span className="flex items-center justify-end gap-0.5">
                <IconButton icon="edit" label={`Edit ${brand.name}`} onClick={() => setEditing({ kind: 'brand', record: brand })} />
                <IconButton icon="trash" label={`Delete ${brand.name}`} tone="danger" onClick={() => deleteBrand(brand.id)} />
              </span>
            ),
          },
        ]
      : []),
  ]

  const unassigned = products.filter((product) => !categoryRollup.has(product.category) || !brandRollup.has(product.brand))

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        actions={
          isOwner ? (
            <>
              <Button variant="gold" icon="plus" onClick={() => setEditing({ kind: 'brand', record: null })}>
                Add brand
              </Button>
              <Button variant="outline" icon="plus" onClick={() => setEditing({ kind: 'category', record: null })}>
                Add category
              </Button>
            </>
          ) : null
        }
      />

      {unassigned.length > 0 && (
        <p className="flex items-start gap-2.5 rounded border border-brand-gold/40 bg-brand-gold/10 px-3.5 py-2.5 text-body-sm text-brand-goldInk">
          <Chip tone="gold">Note</Chip>
          {unassigned.length} {unassigned.length === 1 ? 'fragrance sits' : 'fragrances sit'} outside a category or
          brand on this screen — the tables below only count what exists here.
        </p>
      )}

      <Panel
        title="Categories"
        description="How the website groups perfumes. Product counts and sales come from your product list."
        flush
      >
        <Toolbar
          search={shelves.query}
          onSearch={shelves.setQuery}
          placeholder="Search categories…"
          filters={
            <FilterSelect
              label="Filter by status"
              value={categoryStatus}
              onChange={setCategoryStatus}
              options={['All', ...CATEGORY_STATUSES].map((value) => ({
                value,
                label: value === 'All' ? 'Any status' : value,
              }))}
            />
          }
          actions={<span className="text-body-sm text-ink-muted">{shelves.total} categories</span>}
        />
        <DataTable
          columns={categoryColumns}
          rows={shelves.visible}
          sort={shelves.sort}
          onSortChange={shelves.setSort}
          empty={<EmptyState icon="layers" title="No categories" description="Add one to group your perfumes." />}
        />
        <Pagination
          page={shelves.page}
          pageSize={shelves.pageSize}
          total={shelves.total}
          onPageChange={shelves.setPage}
          onPageSizeChange={shelves.setPageSize}
        />
      </Panel>

      <Panel
        title="Brands"
        description="Who makes the fragrances you stock, whether you buy them in or blend them yourself."
        flush
      >
        <Toolbar
          search={maisons.query}
          onSearch={maisons.setQuery}
          placeholder="Search brands…"
          filters={
            <>
              <FilterSelect
                label="Filter by group"
                value={house}
                onChange={setHouse}
                options={['All', ...BRAND_HOUSES].map((value) => ({ value, label: value === 'All' ? 'Any group' : value }))}
              />
              <FilterSelect
                label="Filter by status"
                value={brandStatus}
                onChange={setBrandStatus}
                options={['All', ...BRAND_STATUSES].map((value) => ({
                  value,
                  label: value === 'All' ? 'Any status' : value,
                }))}
              />
            </>
          }
          actions={<span className="text-body-sm text-ink-muted">{maisons.total} brands</span>}
        />
        <DataTable
          columns={brandColumns}
          rows={maisons.visible}
          sort={maisons.sort}
          onSortChange={maisons.setSort}
          empty={<EmptyState icon="tree" title="No brands yet" description="Add the first brand you stock." />}
        />
        <Pagination
          page={maisons.page}
          pageSize={maisons.pageSize}
          total={maisons.total}
          onPageChange={maisons.setPage}
          onPageSizeChange={maisons.setPageSize}
        />
      </Panel>

      <TaxonomyModal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        kind={editing?.kind ?? 'category'}
        record={editing?.record ?? null}
      />
    </div>
  )
}

export default CategoriesBrandsPage
