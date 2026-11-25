import { useRef } from 'react'
import { Button } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { StatusPill } from '@/components/ui/Badge'
import useServerResource from '@/hooks/useServerResource'
import { formatPrice } from '@/lib/format'
import { printElement } from '@/lib/print'
import { adminApi } from '@/services/adminApi'

/**
 * What prints when nothing has been saved in Settings, or the read fails —
 * the same identity `services/settings.js` falls back to on the server.
 */
const FALLBACK_STORE = {
  name: 'Raheman Perfumes',
  address: '',
  phone: '+91 98201 12345',
}

const stamp = (value) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
}

/**
 * A counter bill, as the customer takes it home.
 *
 * Every figure comes off the order the server returned — the server priced the
 * bill, so the receipt quotes the server rather than the panel's preview. GST is
 * shown as the share of the total it already includes, the way the order
 * snapshot stores it, never added on top.
 */
export function ReceiptModal({ open, onClose, order = null, onNewBill }) {
  const paperRef = useRef(null)
  const settings = useServerResource(() => adminApi.getSettings(), { enabled: open })

  if (!order) return null
  const store = { ...FALLBACK_STORE, ...(settings.data?.store ?? {}) }
  const voided = order.status === 'Cancelled'

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title={`Bill ${order.id}`}
      description={voided ? 'This bill was voided and refunded.' : `${formatPrice(order.amount)} · ${order.paymentMethod}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button variant="outline" icon="print" onClick={() => printElement(paperRef.current, `Bill ${order.id}`)}>
            Print
          </Button>
          {onNewBill && (
            <Button variant="gold" icon="plus" onClick={onNewBill}>
              New bill
            </Button>
          )}
        </>
      }
    >
      <div
        ref={paperRef}
        className="mx-auto w-full max-w-[80mm] bg-white px-1 py-2 font-sans text-[12px] leading-[1.45] text-black"
      >
        <div className="text-center">
          <img
            src="/logo.png"
            alt={store.name}
            className="mx-auto mb-1.5 h-16 w-16 rounded-full object-contain"
          />
          {store.address && <p className="mt-0.5">{store.address}</p>}
          {store.phone && <p>{store.phone}</p>}
        </div>

        <div className="my-2.5 border-t border-dashed border-black/50" />

        <dl className="grid grid-cols-[auto_1fr] gap-x-3">
          <dt>Bill no.</dt>
          <dd className="tabular text-right font-semibold">{order.id}</dd>
          <dt>Date</dt>
          <dd className="text-right">{stamp(order.placedAt)}</dd>
          {order.cashier && (
            <>
              <dt>Cashier</dt>
              <dd className="text-right">{order.cashier}</dd>
            </>
          )}
          <dt>Customer</dt>
          <dd className="text-right">{order.customer || 'Walk-in Customer'}</dd>
          {order.phone && (
            <>
              <dt>Phone</dt>
              <dd className="tabular text-right">{order.phone}</dd>
            </>
          )}
          {order.email && (
            <>
              <dt>Email</dt>
              <dd className="text-right">{order.email}</dd>
            </>
          )}
        </dl>

        <div className="my-2.5 border-t border-dashed border-black/50" />

        <table className="w-full border-collapse">
          <thead>
            <tr className="text-left">
              <th className="pb-1 font-semibold">Item</th>
              <th className="pb-1 text-right font-semibold">Qty</th>
              <th className="pb-1 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((line) => (
              <tr key={`${line.sku}-${line.volume}`} className="align-top">
                <td className="py-0.5 pr-2">
                  {line.name}
                  <span className="block text-[11px] text-black/60">
                    {line.volume} · {formatPrice(line.price)}
                  </span>
                </td>
                <td className="tabular py-0.5 text-right">{line.qty}</td>
                <td className="tabular py-0.5 text-right">{formatPrice(line.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="my-2.5 border-t border-dashed border-black/50" />

        <dl className="grid grid-cols-[1fr_auto] gap-x-3">
          <dt>Subtotal</dt>
          <dd className="tabular text-right">{formatPrice(order.subtotal)}</dd>
          {order.discount > 0 && (
            <>
              <dt>Discount</dt>
              <dd className="tabular text-right">−{formatPrice(order.discount)}</dd>
            </>
          )}
          <dt className="pt-1 text-[14px] font-bold">Total</dt>
          <dd className="tabular pt-1 text-right text-[14px] font-bold">{formatPrice(order.amount)}</dd>
          <dt className="text-black/60">Incl. GST {order.gstRate ?? 18}%</dt>
          <dd className="tabular text-right text-black/60">{formatPrice(order.gst)}</dd>
          <dt>Paid by</dt>
          <dd className="text-right">
            {order.paymentMethod}
            {order.txnRef ? ` · ${order.txnRef}` : ''}
          </dd>
        </dl>

        {voided && (
          <p className="mt-2.5 border border-black py-1 text-center font-bold uppercase tracking-widest">Void — refunded</p>
        )}

        <div className="my-2.5 border-t border-dashed border-black/50" />
        <p className="text-center">Thank you for shopping with us.</p>
        {order.loyalty?.emailTriggered && (
          <p className="mt-1.5 text-center text-[11px] font-semibold">
            Visit #{order.loyalty.visits} Reward: {order.loyalty.discountPercent}% OFF ({order.loyalty.couponCode}) sent to {order.email}
          </p>
        )}
      </div>

      {voided && (
        <div className="mt-3 flex justify-center">
          <StatusPill status="Refunded" />
        </div>
      )}
    </Modal>
  )
}

export default ReceiptModal
