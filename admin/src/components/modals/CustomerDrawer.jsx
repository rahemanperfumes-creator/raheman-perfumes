import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Drawer } from '@/components/ui/Modal'
import { Icon } from '@/components/ui/Icon'
import { StatusPill, Chip } from '@/components/ui/Badge'
import { Textarea, DetailRow } from '@/components/ui/Form'
import { formatPrice, formatDate, formatRelative, initials, formatNumber } from '@/lib/format'
import { ordersForCustomer } from '@/lib/derive'
import { customerBand } from '@/data/customers'
import { useAdminStore } from '@/store/adminStore'
import { useSessionStore } from '@/store/sessionStore'

/**
 * One customer, in full: lifetime value, the order history the order book knows
 * about, their addresses, and the staff-only note.
 *
 * Like the order drawer, this reads the customer out of the store by id so a
 * block or a saved note is reflected immediately. The lifetime figures come
 * from the customer record while the order list is filtered from the order
 * book — the book only holds the recent window, so the two are deliberately
 * different numbers.
 */
export function CustomerDrawer({ open, onClose, customerId = null }) {
  const isOwner = useSessionStore((state) => state.user?.role === 'owner')
  const customer = useAdminStore((state) => state.customers.find((c) => c.id === customerId) ?? null)
  const orders = useAdminStore((state) => state.orders)
  const setCustomerStatus = useAdminStore((state) => state.setCustomerStatus)
  const setCustomerNote = useAdminStore((state) => state.setCustomerNote)

  const [note, setNote] = useState('')

  useEffect(() => {
    if (open && customer) setNote(customer.notes ?? '')
  }, [open, customer])

  if (!open || !customer) return null

  const history = ordersForCustomer(orders, customer.name)
  const blocked = customer.status === 'Blocked'
  const noteChanged = note !== (customer.notes ?? '')

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={customer.name}
      subtitle={`${customer.id} · joined ${formatDate(customer.joined)}`}
      width="max-w-xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          {isOwner &&
            (blocked ? (
              <Button variant="outline" icon="check" onClick={() => setCustomerStatus(customer.id, 'Active')}>
                Reinstate
              </Button>
            ) : (
              <Button variant="danger" icon="lock" onClick={() => setCustomerStatus(customer.id, 'Blocked')}>
                Block customer
              </Button>
            ))}
        </>
      }
    >
      <div className="flex flex-col gap-6">
        <div className="flex items-center gap-4">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-shell-obsidian font-serif text-headline-sm font-semibold text-brand-gold">
            {initials(customer.name)}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill status={customer.status} />
              <Chip tone="gold">{customer.loyaltyTier}</Chip>
            </div>
            <p className="mt-1.5 text-body-sm text-ink-variant">
              {customer.email} · {customer.phone}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: 'Total spent', value: formatPrice(customer.totalSpent) },
            { label: 'Orders placed', value: formatNumber(customer.orders) },
            { label: 'Reward points', value: formatNumber(customer.loyaltyPoints) },
            { label: 'Customer level', value: customerBand(customer) },
          ].map((stat) => (
            <div key={stat.label} className="rounded border border-outline-variant/60 bg-surface-low/50 px-3 py-2.5">
              <p className="text-label-sm font-bold uppercase tracking-wider text-ink-muted">{stat.label}</p>
              <p className="tabular mt-1 text-body-md font-semibold text-ink">{stat.value}</p>
            </div>
          ))}
        </div>

        <section>
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <h3 className="text-label-md font-bold uppercase text-ink-variant">Order history</h3>
            <span className="text-body-sm text-ink-muted">
              Showing {history.length} of {customer.orders} lifetime orders
            </span>
          </div>
          {history.length === 0 ? (
            <p className="rounded border border-outline-variant/60 bg-surface-low/40 px-3.5 py-3 text-body-sm text-ink-muted">
              This customer's {customer.orders} older orders are not in the recent list shown here.
            </p>
          ) : (
            <ul className="divide-y divide-outline-variant/40 rounded border border-outline-variant/60">
              {history.map((order) => (
                <li key={order.id} className="flex items-center gap-3 px-3.5 py-2.5">
                  <span className="tabular w-20 shrink-0 text-body-sm font-semibold text-ink">{order.id}</span>
                  <span className="min-w-0 flex-1 truncate text-body-sm text-ink-muted">
                    {order.itemCount} {order.itemCount === 1 ? 'item' : 'items'} · {formatRelative(order.placedAt)}
                  </span>
                  <StatusPill status={order.status} dot={false} />
                  <span className="tabular w-20 shrink-0 text-right text-body-sm font-semibold text-ink">
                    {formatPrice(order.amount)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h3 className="mb-2 text-label-md font-bold uppercase text-ink-variant">Addresses</h3>
          <ul className="grid gap-3 sm:grid-cols-2">
            {customer.addresses.map((address) => (
              <li key={address.tag} className="rounded border border-outline-variant/60 px-3.5 py-3">
                <div className="flex items-center gap-2">
                  <Icon name="route" className="h-3.5 w-3.5 text-ink-muted" />
                  <span className="text-body-sm font-semibold text-ink">{address.tag}</span>
                  {address.isDefault && <Chip>Default</Chip>}
                </div>
                <p className="mt-1.5 text-body-sm text-ink-variant">
                  {address.line1}
                  {address.line2 ? `, ${address.line2}` : ''}
                  <br />
                  {address.city}, {address.state} {address.pincode}
                </p>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded border border-outline-variant/60 px-3.5 py-1">
          <dl className="divide-y divide-outline-variant/40">
            <DetailRow label="City">{customer.city}</DetailRow>
            <DetailRow label="Last order">{formatDate(customer.lastOrder)}</DetailRow>
            <DetailRow label="Customer since">{formatDate(customer.joined)}</DetailRow>
            <DetailRow label="Customer ID">
              <span className="tabular">{customer.id}</span>
            </DetailRow>
          </dl>
        </section>

        <section>
          <h3 className="mb-2 text-label-md font-bold uppercase text-ink-variant">Staff note</h3>
          <Textarea
            rows={3}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Allergies, scent likes, delivery notes — anything staff should know."
            hint="Visible to staff only. Never shown on the website."
          />
          <div className="mt-2 flex justify-end">
            <Button
              variant="outline"
              size="sm"
              icon="check"
              disabled={!noteChanged}
              onClick={() => setCustomerNote(customer.id, note)}
            >
              Save note
            </Button>
          </div>
        </section>
      </div>
    </Drawer>
  )
}

export default CustomerDrawer
