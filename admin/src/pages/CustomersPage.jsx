import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Button, IconButton } from '@/components/ui/Button'
import { StatusPill } from '@/components/ui/Badge'
import { DataTable, BulkBar } from '@/components/ui/DataTable'
import { Toolbar, FilterSelect, Pagination } from '@/components/ui/Toolbar'
import { EmptyState } from '@/components/ui/Feedback'
import { StatCard } from '@/components/ui/StatCard'
import { CustomerDrawer } from '@/components/modals/CustomerDrawer'
import useDataTable from '@/hooks/useDataTable'
import useDocumentTitle from '@/hooks/useDocumentTitle'
import { PageHeader } from '@/components/ui/PageHeader'
import { formatPrice, formatDate, formatCompactINR, formatNumber, initials } from '@/lib/format'
import { CUSTOMER_STATUSES, customerBand } from '@/data/customers'
import { useAdminStore } from '@/store/adminStore'
import { useSessionStore } from '@/store/sessionStore'

const BANDS = ['Platinum', 'Gold', 'Silver', 'Bronze']

/**
 * The customer book.
 *
 * Lifetime figures come from the customer record, not from a sum over the order
 * book — the book only holds the recent window, while a patron's history
 * reaches back years. The drawer says so explicitly rather than showing a total
 * that quietly disagrees with its own order list.
 */
export function CustomersPage() {
  useDocumentTitle('Online Customers')

  const isOwner = useSessionStore((state) => state.user?.role === 'owner')
  const navigate = useNavigate()
  const rawCustomers = useAdminStore((state) => state.customers)
  const setCustomerStatus = useAdminStore((state) => state.setCustomerStatus)

  // Strictly filter for Online Customers — exclude physical shop counter / walk-in records and dummy staff
  const customers = useMemo(() => {
    return rawCustomers.filter((c) => {
      if (c.isWalkIn) return false
      const email = String(c.email || '').toLowerCase()
      const name = String(c.name || '').toLowerCase()
      if (
        email === 'walk-in@counter.rehmanperfume.in' ||
        email.includes('@counter.rehmanperfume.in') ||
        email.includes('@phone.counter.')
      ) {
        return false
      }
      if (name.includes('walk-in customer') || name === 'walk-in') return false
      // Exclude staff users with 0 orders from the online customer directory
      if (c.staff && (c.orders === 0 || !c.orders)) return false
      return true
    })
  }, [rawCustomers])

  const [status, setStatus] = useState('All')
  const [band, setBand] = useState('All')
  const [city, setCity] = useState('All')
  const [openCustomerId, setOpenCustomerId] = useState(null)
  const [searchParams, setSearchParams] = useSearchParams()

  const cities = useMemo(() => [...new Set(customers.map((customer) => customer.city))].sort(), [customers])

  const scoped = useMemo(
    () =>
      customers.filter(
        (customer) =>
          (status === 'All' || customer.status === status) &&
          (band === 'All' || customerBand(customer) === band) &&
          (city === 'All' || customer.city === city),
      ),
    [customers, status, band, city],
  )

  const table = useDataTable({
    rows: scoped,
    pageSize: 10,
    initialSort: { key: 'totalSpent', dir: 'desc' },
    matches: (customer, query) =>
      [customer.name, customer.email, customer.phone, customer.city, customer.loyaltyTier]
        .join(' ')
        .toLowerCase()
        .includes(query),
    compare: {
      name: (customer) => customer.name,
      orders: (customer) => customer.orders,
      totalSpent: (customer) => customer.totalSpent,
      lastOrder: (customer) => customer.lastOrder,
      city: (customer) => customer.city,
    },
  })

  /** Deep link from the command palette: `?focus=cust-1042` opens that patron. */
  const focusId = searchParams.get('focus')
  useEffect(() => {
    if (!focusId) return
    if (customers.some((customer) => customer.id === focusId)) setOpenCustomerId(focusId)
    setSearchParams({}, { replace: true })
  }, [focusId, customers, setSearchParams])

  const lifetime = customers.reduce((sum, customer) => sum + customer.totalSpent, 0)
  const vip = customers.filter((customer) => customer.status === 'VIP').length
  const blocked = customers.filter((customer) => customer.status === 'Blocked').length

  const exportCsv = () => {
    const header = ['ID', 'Name', 'Email', 'Phone', 'City', 'Status', 'Loyalty tier', 'Points', 'Orders', 'Lifetime spend', 'Band', 'Last order', 'Joined']
    const lines = table.filtered.map((customer) => [
      customer.id,
      customer.name,
      customer.email,
      customer.phone,
      customer.city,
      customer.status,
      customer.loyaltyTier,
      customer.loyaltyPoints,
      customer.orders,
      customer.totalSpent,
      customerBand(customer),
      customer.lastOrder,
      customer.joined,
    ])
    const csv = [header, ...lines]
      .map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `rehman-customers-${new Date().toISOString().slice(0, 10)}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const columns = [
    {
      key: 'name',
      header: 'Customer',
      sortable: true,
      render: (customer) => (
        <span className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-shell-obsidian text-[11px] font-bold text-brand-gold">
            {initials(customer.name)}
          </span>
          <span className="min-w-0">
            <span className="flex items-center gap-1.5">
              <span className="truncate font-semibold text-ink">{customer.name}</span>
              {/* A staff login carries a patron profile so it can check out and
                  take counter bills — say so, instead of letting the row look
                  like a shopper who happens to share a name with the owner. */}
              {customer.staff && (
                <span className="shrink-0 rounded-full border border-brand-gold/50 bg-brand-gold/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-goldInk">
                  Staff
                </span>
              )}
            </span>
            <span className="tabular block text-body-sm text-ink-muted">{customer.id}</span>
          </span>
        </span>
      ),
    },
    {
      key: 'contact',
      header: 'Contact',
      render: (customer) => (
        <span className="block">
          <span className="block truncate text-ink-variant">{customer.email}</span>
          <span className="tabular block text-body-sm text-ink-muted">{customer.phone}</span>
        </span>
      ),
    },
    {
      key: 'city',
      header: 'City',
      sortable: true,
      render: (customer) => (
        <span className="block">
          <span className="block text-ink-variant">{customer.city}</span>
          <span className="block text-body-sm text-ink-muted">{customer.loyaltyTier}</span>
        </span>
      ),
    },
    {
      key: 'orders',
      header: 'Orders',
      align: 'right',
      sortable: true,
      render: (customer) => <span className="tabular font-semibold text-ink">{customer.orders}</span>,
    },
    {
      key: 'totalSpent',
      header: 'Total spent',
      align: 'right',
      sortable: true,
      render: (customer) => (
        <span className="block">
          <span className="tabular block font-semibold text-ink">{formatPrice(customer.totalSpent)}</span>
          <span className="block text-body-sm text-ink-muted">{customerBand(customer)} band</span>
        </span>
      ),
    },
    {
      key: 'lastOrder',
      header: 'Last order',
      align: 'right',
      sortable: true,
      render: (customer) => (
        <span className="tabular whitespace-nowrap text-ink-muted">{formatDate(customer.lastOrder)}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (customer) => <StatusPill status={customer.status} />,
    },
    {
      key: 'actions',
      header: 'Action',
      align: 'right',
      render: (customer) => (
        <span className="flex items-center justify-end gap-0.5" onClick={(event) => event.stopPropagation()}>
          <IconButton icon="eye" label={`Open ${customer.name}`} onClick={() => setOpenCustomerId(customer.id)} />
          {isOwner &&
            (customer.status === 'Blocked' ? (
              <IconButton
                icon="check"
                label={`Reinstate ${customer.name}`}
                tone="gold"
                onClick={() => setCustomerStatus(customer.id, 'Active')}
              />
            ) : customer.staff ? (
              /* The server refuses to block a staff-owned profile — it would sign
                 that account out of the panel mid-shift while restricting
                 nothing, since staff sign-in never consults the patron status. */
              <IconButton icon="lock" label="Staff account — cannot be blocked" disabled />
            ) : (
              <IconButton
                icon="lock"
                label={`Block ${customer.name}`}
                tone="danger"
                onClick={() => setCustomerStatus(customer.id, 'Blocked')}
              />
            ))}
        </span>
      ),
    },
  ]

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Online Customers"
        description="Registered website patrons and online customer accounts. In-store counter walk-in bills are tracked in Counter Sale & Repeat Analysis."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" icon="history" onClick={() => navigate('/repeat-customers')}>
              Repeat Analysis &amp; Benefits
            </Button>
            {isOwner && (
              <Button variant="ghost" size="sm" icon="download" onClick={exportCsv}>
                Export CSV
              </Button>
            )}
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total online spend"
          value={formatCompactINR(lifetime)}
          hint="across online customers"
          icon="trending-up"
        />
        <StatCard
          label="Average spend"
          value={formatPrice(customers.length ? lifetime / customers.length : 0)}
          hint="average per online customer"
          icon="users"
          tone="active"
        />
        <StatCard label="VIP customers" value={formatNumber(vip)} hint="marked for offers first" icon="crown" tone="gold" />
        <StatCard
          label="Blocked"
          value={formatNumber(blocked)}
          hint="cannot place new orders"
          icon="lock"
          tone={blocked ? 'halted' : 'done'}
        />
      </div>

      <div className="card-admin-flush">
        <Toolbar
          search={table.query}
          onSearch={table.setQuery}
          placeholder="Search by name, email or phone…"
          filters={
            <>
              <FilterSelect
                label="Filter by status"
                value={status}
                onChange={setStatus}
                options={['All', ...CUSTOMER_STATUSES].map((value) => ({
                  value,
                  label: value === 'All' ? 'Any status' : value,
                }))}
              />
              <FilterSelect
                label="Filter by customer level"
                value={band}
                onChange={setBand}
                options={['All', ...BANDS].map((value) => ({ value, label: value === 'All' ? 'All levels' : value }))}
              />
              <FilterSelect
                label="Filter by city"
                value={city}
                onChange={setCity}
                options={['All', ...cities].map((value) => ({ value, label: value === 'All' ? 'Everywhere' : value }))}
              />
            </>
          }
          actions={<span className="text-body-sm text-ink-muted">{table.total} shown</span>}
        />

        {isOwner && (
          <BulkBar count={table.selectedIds.length} onClear={table.clearSelection}>
            <Button variant="outline" size="sm" onClick={() => table.selectedIds.forEach((id) => setCustomerStatus(id, 'VIP'))}>
              Mark VIP
            </Button>
            <Button
              variant="danger"
              size="sm"
              icon="lock"
              onClick={() => table.selectedIds.forEach((id) => setCustomerStatus(id, 'Blocked'))}
            >
              Block selected
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
          onRowClick={(customer) => setOpenCustomerId(customer.id)}
          empty={
            <EmptyState
              icon="users"
              title="No customers match"
              description="Try a different level, city or status — or clear the search."
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

      <CustomerDrawer
        open={Boolean(openCustomerId)}
        onClose={() => setOpenCustomerId(null)}
        customerId={openCustomerId}
      />
    </div>
  )
}

export default CustomersPage
