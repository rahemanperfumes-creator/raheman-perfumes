import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Button, IconButton } from '@/components/ui/Button'
import { StatusPill } from '@/components/ui/Badge'
import { DataTable, BulkBar } from '@/components/ui/DataTable'
import { Toolbar, FilterSelect, PillTabs, Pagination } from '@/components/ui/Toolbar'
import { EmptyState } from '@/components/ui/Feedback'
import { ProductThumb } from '@/components/ui/ProductThumb'
import { OrderDetailDrawer } from '@/components/modals/OrderDetailDrawer'
import { ShipOrderModal } from '@/components/modals/ShipOrderModal'
import useDataTable from '@/hooks/useDataTable'
import useDocumentTitle from '@/hooks/useDocumentTitle'
import { PageHeader } from '@/components/ui/PageHeader'
import { orderStatusCounts } from '@/lib/derive'
import { formatPrice, formatDate, initials } from '@/lib/format'
import { ORDER_FLOW, ORDER_STATUSES, PAYMENT_STATUSES } from '@/data/orders'
import { useAdminStore } from '@/store/adminStore'
import { useSessionStore } from '@/store/sessionStore'

/**
 * The order book.
 *
 * Status tabs carry live counts, and every status change writes through the
 * store, so the tabs, the dashboard tiles and the activity feed all move
 * together. Advancement is one step at a time — Pending → Packed → Shipped →
 * Delivered — because a jump straight to Delivered would skip the tracking
 * number the customer is waiting on.
 */
export function OrdersPage() {
  useDocumentTitle('Orders')

  const isOwner = useSessionStore((state) => state.user?.role === 'owner')
  const orders = useAdminStore((state) => state.orders)
  const advanceOrder = useAdminStore((state) => state.advanceOrder)
  const updateOrderStatus = useAdminStore((state) => state.updateOrderStatus)

  const [status, setStatus] = useState('All')
  const [payment, setPayment] = useState('All')
  const [channel, setChannel] = useState('All')
  const [openOrderId, setOpenOrderId] = useState(null)
  const [shippingOrder, setShippingOrder] = useState(null)
  const [searchParams, setSearchParams] = useSearchParams()

  const counts = useMemo(() => orderStatusCounts(orders), [orders])
  const channels = useMemo(
    () => [...new Set(orders.map((order) => (order.channel === 'Storefront' ? 'Website' : order.channel || 'Website')))].sort(),
    [orders],
  )

  const scoped = useMemo(
    () =>
      orders.filter((order) => {
        const ordChannel = order.channel === 'Storefront' ? 'Website' : order.channel || 'Website'
        return (
          (status === 'All' || order.status === status) &&
          (payment === 'All' || order.payment === payment) &&
          (channel === 'All' || ordChannel === channel || order.channel === channel)
        )
      }),
    [orders, status, payment, channel],
  )

  const table = useDataTable({
    rows: scoped,
    pageSize: 10,
    matches: (order, query) =>
      [order.id, order.customer, order.city, order.paymentMethod, order.trackingId ?? '']
        .join(' ')
        .toLowerCase()
        .includes(query),
    compare: {
      id: (order) => order.id,
      customer: (order) => order.customer,
      amount: (order) => order.amount,
      status: (order) => ORDER_FLOW.indexOf(order.status),
      date: (order) => order.placedAt,
    },
  })

  /** Deep link from the command palette: `?focus=RP2041` opens that order. */
  const focusId = searchParams.get('focus')
  useEffect(() => {
    if (!focusId) return
    if (orders.some((order) => order.id === focusId)) setOpenOrderId(focusId)
    setSearchParams({}, { replace: true })
  }, [focusId, orders, setSearchParams])

  const exportCsv = () => {
    const header = ['Order', 'Date', 'Customer', 'City', 'Items', 'Subtotal', 'Shipping', 'Amount', 'Payment', 'Method', 'Status', 'Channel', 'Tracking']
    const lines = table.filtered.map((order) => [
      order.id,
      order.date,
      order.customer,
      order.city,
      order.itemCount,
      order.subtotal,
      order.shipping,
      order.amount,
      order.payment,
      order.paymentMethod,
      order.status,
      order.channel === 'Storefront' ? 'Website' : order.channel || 'Website',
      order.trackingId ?? '',
    ])
    const csv = [header, ...lines]
      .map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `rehman-orders-${new Date().toISOString().slice(0, 10)}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const columns = [
    {
      key: 'id',
      header: 'Order',
      sortable: true,
      render: (order) => (
        <span className="block">
          <span className="tabular block font-semibold text-ink">{order.id}</span>
          <span className="block text-body-sm text-ink-muted">
            {order.channel === 'Storefront' ? 'Website' : order.channel || 'Website'}
          </span>
        </span>
      ),
    },
    {
      key: 'customer',
      header: 'Customer',
      sortable: true,
      render: (order) => (
        <span className="flex items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface text-[10px] font-bold text-ink-variant">
            {initials(order.customer)}
          </span>
          <span className="min-w-0">
            <span className="block truncate font-medium text-ink">{order.customer}</span>
            <span className="block text-body-sm text-ink-muted">{order.city}</span>
          </span>
        </span>
      ),
    },
    {
      key: 'items',
      header: 'Items',
      render: (order) => (
        <span className="flex items-center gap-2.5">
          {/* The line's own frozen shot — the order book and the storefront's
              account page must show the same bottle for the same sale. */}
          <ProductThumb image={order.items[0].image} className="h-9 w-9" />
          <span className="block max-w-[16rem]">
            <span className="block truncate text-ink-variant">{order.items[0].name}</span>
            <span className="block text-body-sm text-ink-muted">
              {order.itemCount} {order.itemCount === 1 ? 'unit' : 'units'}
              {order.items.length > 1 ? ` · +${order.items.length - 1} more` : ''}
            </span>
          </span>
        </span>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      sortable: true,
      render: (order) => (
        <span className="block">
          <span className="tabular block font-semibold text-ink">{formatPrice(order.amount)}</span>
          <span className="block text-body-sm text-ink-muted">
            {order.shipping === 0 ? 'free shipping' : `+${formatPrice(order.shipping)} ship`}
          </span>
        </span>
      ),
    },
    {
      key: 'payment',
      header: 'Payment',
      render: (order) => (
        <span className="block">
          <StatusPill status={order.payment} />
          <span className="mt-0.5 block text-body-sm text-ink-muted">{order.paymentMethod}</span>
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      render: (order) => {
        const courier = order.courier || order.tracking?.courier
        const refNum = order.awb || order.trackingId || order.tracking?.awb
        return (
          <div>
            <StatusPill status={order.status} />
            {(courier || refNum) && (
              <span className="mt-1 flex items-center gap-1 text-[11px] font-medium text-ink-muted">
                {courier && <span className="max-w-[120px] truncate font-semibold text-ink-variant">{courier}</span>}
                {refNum && <span className="font-mono text-ink-muted">{courier ? `· ${refNum}` : refNum}</span>}
              </span>
            )}
          </div>
        )
      },
    },
    {
      key: 'date',
      header: 'Placed',
      align: 'right',
      sortable: true,
      render: (order) => <span className="tabular whitespace-nowrap text-ink-muted">{formatDate(order.date)}</span>,
    },
    {
      key: 'actions',
      header: 'Action',
      align: 'right',
      render: (order) => {
        const index = ORDER_FLOW.indexOf(order.status)
        const next = index >= 0 && index < ORDER_FLOW.length - 1 ? ORDER_FLOW[index + 1] : null
        return (
          <span className="flex items-center justify-end gap-1" onClick={(event) => event.stopPropagation()}>
            {next && (
              <Button
                variant={next === 'Shipped' ? 'gold' : 'outline'}
                size="sm"
                icon={next === 'Shipped' ? 'truck' : undefined}
                iconRight={next === 'Shipped' ? undefined : 'arrow-right'}
                onClick={() => {
                  if (next === 'Shipped') {
                    setShippingOrder(order)
                  } else {
                    advanceOrder(order.id)
                  }
                }}
              >
                {next}
              </Button>
            )}
            <IconButton icon="eye" label={`Open ${order.id}`} onClick={() => setOpenOrderId(order.id)} />
          </span>
        )
      },
    },
  ]

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        actions={
          <>
            {/* "Dispatch desk" was the name of a shelf in a warehouse nobody here
                works in. It goes to the stock screen, so it says stock. */}
            <Button variant="outline" icon="warehouse" to="/inventory">
              Stock
            </Button>
            {isOwner && (
              <Button variant="ghost" size="sm" icon="download" onClick={exportCsv}>
                Export CSV
              </Button>
            )}
          </>
        }
      />

      <div className="card-admin-flush">
        <div className="border-b border-outline-variant/50 px-4 pt-3">
          <PillTabs
            value={status}
            onChange={(value) => {
              setStatus(value)
              table.setPage(1)
            }}
            tabs={['All', ...ORDER_STATUSES].map((value) => ({ value, label: value, count: counts[value] ?? 0 }))}
          />
        </div>

        <Toolbar
          search={table.query}
          onSearch={table.setQuery}
          placeholder="Search by order number, customer, city or tracking number…"
          filters={
            <>
              <FilterSelect
                label="Filter by payment"
                value={payment}
                onChange={setPayment}
                options={['All', ...PAYMENT_STATUSES].map((value) => ({
                  value,
                  label: value === 'All' ? 'Any payment' : value,
                }))}
              />
              <FilterSelect
                label="Filter by channel"
                value={channel}
                onChange={setChannel}
                options={['All', ...channels].map((value) => ({
                  value,
                  label: value === 'All' ? 'Any channel' : value,
                }))}
              />
            </>
          }
          actions={<span className="text-body-sm text-ink-muted">{table.total} shown</span>}
        />

        <BulkBar count={table.selectedIds.length} onClear={table.clearSelection}>
          <Button variant="outline" size="sm" onClick={() => table.selectedIds.forEach((id) => advanceOrder(id))}>
            Advance one step
          </Button>
          {isOwner && (
            <Button
              variant="danger"
              size="sm"
              icon="close"
              onClick={() => table.selectedIds.forEach((id) => updateOrderStatus(id, 'Cancelled'))}
            >
              Cancel selected
            </Button>
          )}
        </BulkBar>

        <DataTable
          columns={columns}
          rows={table.visible}
          selectable
          selectedIds={table.selectedIds}
          onSelectedChange={table.setSelectedIds}
          sort={table.sort}
          onSortChange={table.setSort}
          onRowClick={(order) => setOpenOrderId(order.id)}
          empty={
            <EmptyState
              icon="bag"
              title="No orders match"
              description="Nothing in the book fits this combination of tab, payment and search."
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

      <OrderDetailDrawer open={Boolean(openOrderId)} onClose={() => setOpenOrderId(null)} orderId={openOrderId} />
      <ShipOrderModal open={Boolean(shippingOrder)} onClose={() => setShippingOrder(null)} order={shippingOrder} />
    </div>
  )
}

export default OrdersPage
