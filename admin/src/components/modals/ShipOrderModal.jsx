import { useEffect, useState } from 'react'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { Input, Select, FieldGroup } from '@/components/ui/Form'
import { Icon } from '@/components/ui/Icon'
import { StatusPill } from '@/components/ui/Badge'
import { formatPrice } from '@/lib/format'
import { useAdminStore } from '@/store/adminStore'

const POPULAR_COURIERS = [
  'Blue Dart',
  'Delhivery',
  'DTDC',
  'India Post (Speed Post)',
  'FedEx',
  'Ekart Logistics',
  'Shadowfax',
  'Xpressbees',
  'Amazon Shipping',
  'Professional Couriers',
  'Other (Custom Courier)',
]

export function ShipOrderModal({ open, onClose, order = null }) {
  const shipOrder = useAdminStore((state) => state.shipOrder)
  const updateOrderTracking = useAdminStore((state) => state.updateOrderTracking)

  const [courierSelect, setCourierSelect] = useState('Blue Dart')
  const [customCourier, setCustomCourier] = useState('')
  const [awb, setAwb] = useState('')
  const [transitNote, setTransitNote] = useState('Air Express')
  const [expectedDelivery, setExpectedDelivery] = useState('')
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)

  const isAlreadyShipped = order && ['Shipped', 'Delivered'].includes(order.status)

  useEffect(() => {
    if (!open || !order) return

    const existingCourier = order.courier || order.tracking?.courier || ''
    const existingAwb = order.awb || order.trackingId || order.tracking?.awb || ''
    const existingNote = order.tracking?.transitNote || 'Air Express'
    const existingDate = order.tracking?.expectedDelivery
      ? new Date(order.tracking.expectedDelivery).toISOString().slice(0, 10)
      : ''

    if (existingCourier) {
      if (POPULAR_COURIERS.includes(existingCourier)) {
        setCourierSelect(existingCourier)
        setCustomCourier('')
      } else {
        setCourierSelect('Other (Custom Courier)')
        setCustomCourier(existingCourier)
      }
    } else {
      setCourierSelect('Blue Dart')
      setCustomCourier('')
    }

    setAwb(existingAwb)
    setTransitNote(existingNote)
    setExpectedDelivery(existingDate)
    setErrors({})
    setSubmitting(false)
  }, [open, order])

  if (!order) return null

  const resolvedCourier = courierSelect === 'Other (Custom Courier)' ? customCourier.trim() : courierSelect

  const handleSubmit = async (e) => {
    e?.preventDefault()
    const errs = {}

    if (!resolvedCourier) {
      errs.courier = 'Please select or enter the courier service name.'
    }
    if (!awb.trim()) {
      errs.awb = 'Tracking / AWB reference number is compulsory.'
    }

    if (Object.keys(errs).length > 0) {
      setErrors(errs)
      return
    }

    setSubmitting(true)
    const trackingPayload = {
      courier: resolvedCourier,
      awb: awb.trim(),
      transitNote: transitNote.trim(),
      expectedDelivery: expectedDelivery ? new Date(expectedDelivery) : undefined,
    }

    try {
      if (isAlreadyShipped) {
        await updateOrderTracking(order.id, trackingPayload)
      } else {
        await shipOrder(order.id, trackingPayload)
      }
      onClose()
    } catch (err) {
      setErrors({ awb: err.message || 'Failed to update shipping details.' })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isAlreadyShipped ? `Edit Shipping Details · ${order.id}` : `Ship Order · ${order.id}`}
      description="Enter the courier partner and tracking reference number. These details will be shown to the customer on their website tracking page."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="gold" icon="truck" loading={submitting} disabled={submitting} onClick={handleSubmit}>
            {isAlreadyShipped ? 'Update Shipping Info' : 'Confirm & Mark Shipped'}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        {/* Order & Consignee Summary */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded border border-outline-variant/60 bg-surface-low/60 p-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-serif text-title-md font-semibold text-ink">{order.id}</span>
              <StatusPill status={order.status} />
            </div>
            <p className="mt-1 text-body-sm font-medium text-ink">
              Customer: <span className="font-semibold">{order.customer || 'Guest Shopper'}</span>
              {order.city ? ` · ${order.city}` : ''}
            </p>
            {order.phone && <p className="text-body-xs text-ink-muted">Phone: {order.phone}</p>}
          </div>
          <div className="text-right">
            <p className="text-label-sm font-bold uppercase text-ink-muted">Order Total</p>
            <p className="font-serif text-title-md font-semibold text-ink">{formatPrice(order.amount)}</p>
            <p className="text-body-xs text-ink-muted">{order.itemCount} items</p>
          </div>
        </div>

        {/* Shipping Form Fields */}
        <FieldGroup title="Courier & Tracking Reference (AWB)" columns={2}>
          <Select
            label="Courier Service"
            required
            value={courierSelect}
            onChange={(e) => {
              setCourierSelect(e.target.value)
              if (errors.courier) setErrors((prev) => ({ ...prev, courier: '' }))
            }}
            options={POPULAR_COURIERS}
            error={errors.courier}
          />

          {courierSelect === 'Other (Custom Courier)' ? (
            <Input
              label="Custom Courier Name"
              required
              placeholder="e.g. Local Express, Shree Maruti, etc."
              value={customCourier}
              onChange={(e) => {
                setCustomCourier(e.target.value)
                if (errors.courier) setErrors((prev) => ({ ...prev, courier: '' }))
              }}
              error={errors.courier}
              data-autofocus
            />
          ) : (
            <div className="hidden sm:block" />
          )}

          <Input
            label="Tracking / AWB / Reference No."
            required
            placeholder="e.g. 14389274921 or DEL98765432"
            value={awb}
            onChange={(e) => {
              setAwb(e.target.value)
              if (errors.awb) setErrors((prev) => ({ ...prev, awb: '' }))
            }}
            error={errors.awb}
            hint="Visible to the customer for live order tracking."
            containerClassName="sm:col-span-2"
            data-autofocus={courierSelect !== 'Other (Custom Courier)'}
          />

          <Input
            label="Transit / Dispatch Method"
            placeholder="e.g. Air Express, Safe Fragrance Pack"
            value={transitNote}
            onChange={(e) => setTransitNote(e.target.value)}
            hint="Shown on the customer's timeline."
          />

          <Input
            label="Expected Delivery Date"
            type="date"
            value={expectedDelivery}
            onChange={(e) => setExpectedDelivery(e.target.value)}
            hint="Optional estimated date of arrival."
          />
        </FieldGroup>

        {/* Quick info note */}
        <div className="flex items-start gap-2.5 rounded border border-brand-gold/35 bg-brand-gold/10 p-3 text-body-sm text-ink-variant">
          <Icon name="truck" className="mt-0.5 h-4 w-4 shrink-0 text-brand-goldInk" />
          <span>
            Once marked as Shipped, the customer will see <strong>{resolvedCourier || 'selected courier'}</strong> and
            tracking reference <strong>{awb || 'AWB number'}</strong> on their order tracking page.
          </span>
        </div>

        {/* Modal Action Buttons (Always visible right below the form) */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-outline-variant/60">
          <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" variant="gold" icon="truck" loading={submitting} disabled={submitting}>
            {isAlreadyShipped ? 'Save & Update Shipping Info' : 'Save & Confirm Shipped'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

export default ShipOrderModal

