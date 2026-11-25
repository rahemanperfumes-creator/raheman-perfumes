import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Drawer } from '@/components/ui/Modal'
import { Icon } from '@/components/ui/Icon'
import { StatusPill } from '@/components/ui/Badge'
import { DetailRow } from '@/components/ui/Form'
import { ProductThumb } from '@/components/ui/ProductThumb'
import { ReceiptModal } from '@/components/modals/ReceiptModal'
import { ShipOrderModal } from '@/components/modals/ShipOrderModal'
import { useServerAction } from '@/hooks/useServerResource'
import { formatPrice, formatDateTime, formatRelative } from '@/lib/format'
import { ORDER_FLOW } from '@/data/orders'
import { adminApi } from '@/services/adminApi'
import { useAdminStore } from '@/store/adminStore'
import { useSessionStore } from '@/store/sessionStore'

/**
 * One order, in full.
 *
 * Reads the order out of the store by id rather than taking a snapshot, so the
 * fulfilment stepper moves the moment the status changes — no second source of
 * truth to keep in step, and no stale drawer left open behind a table that has
 * already moved on.
 *
 * A **counter bill** (`channel: 'Shop'`) has no fulfilment to move along — it
 * was handed over at the till — so its footer offers the receipt and a void
 * instead. A void is the server's: it returns the stock and refunds the bill in
 * one transaction, so there is no local fallback for it.
 */
export function OrderDetailDrawer({ open, onClose, orderId = null }) {
  const order = useAdminStore((state) => state.orders.find((o) => o.id === orderId) ?? null)
  const advanceOrder = useAdminStore((state) => state.advanceOrder)
  const updateOrderStatus = useAdminStore((state) => state.updateOrderStatus)
  const landOrder = useAdminStore((state) => state.landOrder)
  const landProducts = useAdminStore((state) => state.landProducts)
  const role = useSessionStore((state) => state.user?.role)
  const { run, busy } = useServerAction()
  const [confirmVoid, setConfirmVoid] = useState(false)
  const [showReceipt, setShowReceipt] = useState(false)
  const [showShipModal, setShowShipModal] = useState(false)

  useEffect(() => {
    setConfirmVoid(false)
    setShowReceipt(false)
    setShowShipModal(false)
  }, [orderId, open])

  if (!open || !order) return null

  const stepIndex = ORDER_FLOW.indexOf(order.status)
  const cancelled = order.status === 'Cancelled'
  const nextStep = stepIndex >= 0 && stepIndex < ORDER_FLOW.length - 1 ? ORDER_FLOW[stepIndex + 1] : null
  const counter = order.channel === 'Shop'
  const isOwner = role === 'owner'
  const canVoid = counter && !cancelled && isOwner

  const voidBill = async () => {
    const result = await run(() => adminApi.voidBill(order.id, 'Voided from the order book'), {
      success: `Bill ${order.id} voided — stock returned`,
    })
    if (!result) return
    landOrder(result.data.order)
    landProducts(result.data.products ?? [])
    setConfirmVoid(false)
  }

  const counterFooter = confirmVoid ? (
    <>
      <span className="mr-auto text-body-sm text-ink-variant">Refund {formatPrice(order.amount)} and return the stock?</span>
      <Button variant="ghost" onClick={() => setConfirmVoid(false)}>
        Keep
      </Button>
      <Button variant="danger" icon="trash" loading={busy} onClick={voidBill}>
        Void bill
      </Button>
    </>
  ) : (
    <>
      <Button variant="ghost" onClick={onClose}>
        Close
      </Button>
      {canVoid && (
        <Button variant="outline" icon="trash" onClick={() => setConfirmVoid(true)}>
          Void bill
        </Button>
      )}
      <Button variant="gold" icon="print" onClick={() => setShowReceipt(true)}>
        Receipt
      </Button>
    </>
  )

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={order.id}
      subtitle={
        counter
          ? `Shop bill · ${order.customer}${order.cashier ? ` · rung up by ${order.cashier}` : ''} · ${formatRelative(order.placedAt)}`
          : `${order.customer} · ${order.city} · placed ${formatRelative(order.placedAt)}`
      }
      width="max-w-xl"
      footer={
        counter ? (
          counterFooter
        ) : (
        <>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          {cancelled ? (
            isOwner && (
              <Button variant="outline" icon="refresh" onClick={() => updateOrderStatus(order.id, 'Pending')}>
                Reopen as pending
              </Button>
            )
          ) : (
            <>
              {isOwner && (
                <Button variant="outline" icon="close" onClick={() => updateOrderStatus(order.id, 'Cancelled')}>
                  Cancel order
                </Button>
              )}
              {['Shipped', 'Delivered'].includes(order.status) && (
                <Button variant="outline" icon="truck" onClick={() => setShowShipModal(true)}>
                  Edit shipping
                </Button>
              )}
              {nextStep === 'Shipped' ? (
                <Button variant="gold" icon="truck" onClick={() => setShowShipModal(true)}>
                  Mark shipped
                </Button>
              ) : nextStep ? (
                <Button variant="gold" iconRight="arrow-right" onClick={() => advanceOrder(order.id)}>
                  Mark {nextStep.toLowerCase()}
                </Button>
              ) : null}
            </>
          )}
        </>
        )
      }
    >
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill status={order.status} />
          <StatusPill status={order.payment} />
          <span className="ml-auto text-body-sm text-ink-muted">{formatDateTime(order.placedAt)}</span>
        </div>

        {/* Fulfilment stepper */}
        {cancelled && counter ? (
          <div className="flex items-start gap-2.5 rounded border border-state-halted/25 bg-state-haltedSurface px-3.5 py-3 text-body-sm text-state-halted">
            <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />
            <span>This shop bill was voided. The payment is marked refunded and its bottles went back on the shelf.</span>
          </div>
        ) : counter ? (
          <div className="flex items-start gap-2.5 rounded border border-state-done/25 bg-state-doneSurface px-3.5 py-3 text-body-sm text-state-done">
            <Icon name="receipt" className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Sold at the shop counter and handed over on the spot{order.cashier ? ` by ${order.cashier}` : ''} — there is
              nothing to pack or ship.
            </span>
          </div>
        ) : cancelled ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-start gap-2.5 rounded border border-state-halted/25 bg-state-haltedSurface px-3.5 py-3 text-body-sm text-state-halted">
              <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                This order was cancelled{order.payment === 'Refunded' ? ' and the payment refunded' : ''}.
              </span>
            </div>
            {order.refund?.status && order.refund.status !== 'None' && (
              <div className="rounded border border-brand-gold/40 bg-brand-gold/10 px-3.5 py-3 text-body-sm text-ink-variant">
                <p className="font-semibold text-ink">
                  Manual Refund: {order.refund.status} ({formatPrice(order.refund.amount || order.amount)})
                </p>
                {isOwner && order.refund.upiId && (
                  <p className="mt-1">
                    Customer UPI ID: <strong className="font-mono">{order.refund.upiId}</strong>
                  </p>
                )}
                {order.refund.referenceNote && (
                  <p className="mt-0.5 text-[12px] text-ink-muted">Ref: {order.refund.referenceNote}</p>
                )}
              </div>
            )}
          </div>
        ) : (
          <ol className="flex items-center">
            {ORDER_FLOW.map((step, index) => {
              const done = index < stepIndex
              const current = index === stepIndex
              return (
                <li key={step} className="flex flex-1 items-center last:flex-none">
                  <div className="flex flex-col items-center gap-1.5">
                    <span
                      className={
                        done
                          ? 'flex h-7 w-7 items-center justify-center rounded-full bg-state-done text-white'
                          : current
                            ? 'flex h-7 w-7 items-center justify-center rounded-full bg-brand-gold text-brand-goldInk ring-2 ring-brand-gold/40'
                            : 'flex h-7 w-7 items-center justify-center rounded-full bg-surface text-ink-muted'
                      }
                    >
                      <Icon name={done ? 'check' : 'clock'} className="h-3.5 w-3.5" />
                    </span>
                    <span
                      className={
                        current
                          ? 'text-label-sm font-bold uppercase tracking-wider text-ink'
                          : 'text-label-sm uppercase tracking-wider text-ink-muted'
                      }
                    >
                      {step}
                    </span>
                  </div>
                  {index < ORDER_FLOW.length - 1 && (
                    <span
                      className={
                        done ? 'mx-2 mb-5 h-px flex-1 bg-state-done/50' : 'mx-2 mb-5 h-px flex-1 bg-outline-variant'
                      }
                      aria-hidden="true"
                    />
                  )}
                </li>
              )
            })}
          </ol>
        )}

        <section>
          <h3 className="mb-2 text-label-md font-bold uppercase text-ink-variant">Line items</h3>
          <ul className="divide-y divide-outline-variant/40 rounded border border-outline-variant/60">
            {order.items.map((line) => (
              <li key={`${line.sku}-${line.volume}`} className="flex items-center gap-3 px-3.5 py-2.5">
                {/* The photograph frozen onto the line when it was sold; the
                    package glyph only stands in for a fragrance since deleted. */}
                <ProductThumb image={line.image} className="h-9 w-9" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-body-sm font-semibold text-ink">{line.name}</span>
                  <span className="block text-body-sm text-ink-muted">
                    {line.sku} · {line.volume}
                  </span>
                </span>
                <span className="tabular shrink-0 text-right text-body-sm text-ink-variant">
                  {line.qty} × {formatPrice(line.price)}
                  <span className="block font-semibold text-ink">{formatPrice(line.total)}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded border border-outline-variant/60 bg-surface-low/50 px-3.5 py-1">
          <dl className="divide-y divide-outline-variant/40">
            <DetailRow label="Subtotal">{formatPrice(order.subtotal)}</DetailRow>
            {order.discount > 0 && <DetailRow label="Discount">−{formatPrice(order.discount)}</DetailRow>}
            {!counter && (
              <DetailRow label="Shipping">
                {order.shipping === 0 ? <span className="text-state-done">Free</span> : formatPrice(order.shipping)}
              </DetailRow>
            )}
            <DetailRow label="Total">
              <span className="font-serif text-headline-sm font-semibold">{formatPrice(order.amount)}</span>
            </DetailRow>
          </dl>
        </section>

        <section className="rounded border border-outline-variant/60 px-3.5 py-1">
          <dl className="divide-y divide-outline-variant/40">
            <DetailRow label="Payment method">{order.paymentMethod}</DetailRow>
            <DetailRow label="Channel">{order.channel === 'Storefront' ? 'Website' : order.channel || 'Website'}</DetailRow>
            <DetailRow label="Items">{order.itemCount}</DetailRow>
            <DetailRow label="Courier Service">
              {order.courier || order.tracking?.courier ? (
                <span className="font-semibold text-ink">{order.courier || order.tracking?.courier}</span>
              ) : (
                <span className="text-ink-muted">Not assigned yet</span>
              )}
            </DetailRow>
            <DetailRow label="Tracking / AWB">
              {order.awb || order.trackingId || order.tracking?.awb ? (
                <div className="flex items-center gap-2">
                  <span className="tabular font-mono font-semibold text-ink">
                    {order.awb || order.trackingId || order.tracking?.awb}
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowShipModal(true)}
                    className="text-body-xs font-semibold text-brand-goldDark underline hover:text-ink"
                  >
                    Edit
                  </button>
                </div>
              ) : (
                <span className="text-ink-muted">Not assigned yet</span>
              )}
            </DetailRow>
            <DetailRow label="Placed on">{order.date}</DetailRow>
          </dl>
        </section>

        <p className="text-body-sm text-ink-muted">
          Totals are computed from the line items rather than stored, so this page can never disagree with the order's
          own rows. Status changes are written to the activity feed.
        </p>
      </div>

      {counter && <ReceiptModal open={showReceipt} order={order} onClose={() => setShowReceipt(false)} />}
      <ShipOrderModal open={showShipModal} onClose={() => setShowShipModal(false)} order={order} />
    </Drawer>
  )
}

export default OrderDetailDrawer
