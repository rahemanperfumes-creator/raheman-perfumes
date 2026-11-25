import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input, Select, FieldGroup } from '@/components/ui/Form'
import { Modal } from '@/components/ui/Modal'
import { Icon } from '@/components/ui/Icon'
import { StatusPill } from '@/components/ui/Badge'
import { ADJUSTMENT_REASONS, AUTHORISERS } from '@/data/inventory'
import { stockState } from '@/data/products'
import { useAdminStore } from '@/store/adminStore'

/**
 * Record a stock movement.
 *
 * Every change goes through the ledger, so the shelf can never move without a
 * reason being written beside it. Two shapes of answer: a signed movement
 * (received / drawn down) or a counted number — "on hand = 20" — which the
 * server turns into the difference from the current shelf as a stock-take
 * correction. That is what makes the exact figure storable without a second,
 * ledger-free door to `product.stock`.
 */
export function StockAdjustModal({ open, onClose, product = null }) {
  const adjustStock = useAdminStore((state) => state.adjustStock)

  const [direction, setDirection] = useState('in')
  const [quantity, setQuantity] = useState('')
  const [reason, setReason] = useState(ADJUSTMENT_REASONS[0])
  const [by, setBy] = useState(AUTHORISERS[0])
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)

  useEffect(() => {
    if (!open) return
    setDirection('in')
    setQuantity('')
    setReason(ADJUSTMENT_REASONS[0])
    setBy(AUTHORISERS[0])
    setError('')
    setSaving(false)
    savingRef.current = false
  }, [open])

  if (!product) return null

  const amount = direction === 'count' ? Math.max(0, Number(quantity) || 0) : Math.abs(Number(quantity) || 0)
  // A count is not a movement — it is where the shelf should stand — so the
  // movement is whatever it takes to get there from here.
  const delta = direction === 'count' ? amount - product.stock : direction === 'in' ? amount : -amount
  const next = Math.max(0, product.stock + delta)
  // `stockState` is the catalogue's own rule, so the preview cannot promise a
  // healthier state than the inventory screen will show a second later.
  const stateAfter = stockState({ stock: next, safeLimit: product.safeLimit })

  const onSave = async () => {
    if (savingRef.current) return
    if (direction === 'count') {
      if (quantity === '' || !Number.isFinite(Number(quantity)) || Number(quantity) < 0) {
        setError('Enter the counted number of units.')
        return
      }
      if (amount === product.stock) {
        setError(`The shelf already holds ${product.stock} units — there is nothing to correct.`)
        return
      }
    } else if (amount <= 0) {
      setError('Enter how many units moved.')
      return
    }
    if (direction === 'out' && amount > product.stock) {
      setError(`Only ${product.stock} units are on hand — you cannot draw down more than that.`)
      return
    }
    savingRef.current = true
    setSaving(true)
    try {
      const landed = await adjustStock(
        direction === 'count'
          ? { productId: product.id, next: amount, reason, by }
          : { productId: product.id, change: delta, reason, by },
      )
      if (landed !== null) onClose()
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Adjust stock"
      description={`${product.name} · ${product.sku}`}
      footer={
        <>
          <Button variant="ghost" disabled={saving} onClick={onClose}>
            Cancel
          </Button>
          <Button variant="gold" icon="check" loading={saving} disabled={saving} onClick={onSave}>
            Save stock change
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-4 rounded border border-outline-variant/60 bg-surface-low/60 px-4 py-3">
          <div>
            <p className="text-label-sm font-bold uppercase tracking-wider text-ink-muted">In stock now</p>
            <p className="tabular font-serif text-headline-md font-semibold text-ink">{product.stock}</p>
            <p className="text-body-sm text-ink-muted">Low stock limit {product.safeLimit} units</p>
          </div>
          <Icon name="arrow-right" className="h-5 w-5 shrink-0 text-ink-muted" />
          <div className="text-right">
            <p className="text-label-sm font-bold uppercase tracking-wider text-ink-muted">New stock</p>
            <p className="tabular font-serif text-headline-md font-semibold text-ink">{next}</p>
            <StatusPill status={stateAfter} className="mt-1" />
          </div>
        </div>

        <FieldGroup title="Stock Change" columns={2}>
          <div>
            <span className="field-label">Type</span>
            <div className="flex gap-2">
              {[
                { value: 'in', label: 'Added', icon: 'plus' },
                { value: 'out', label: 'Removed', icon: 'minus' },
                { value: 'count', label: 'Exact count', icon: 'check' },
              ].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    setDirection(option.value)
                    // A count is a stock-take, and the ledger should say so
                    // unless the operator picks a sharper word.
                    if (option.value === 'count') setReason('Stock count correction')
                    setError('')
                  }}
                  className={
                    direction === option.value
                      ? 'btn btn-md flex-1 border border-shell-obsidian bg-shell-obsidian text-surface-low'
                      : 'btn btn-md flex-1 border border-outline-variant bg-brand-paper text-ink-variant hover:border-brand-gold'
                  }
                >
                  <Icon name={option.icon} className="h-4 w-4" />
                  {option.label}
                </button>
              ))}
            </div>
          </div>

          <Input
            label={direction === 'count' ? 'Counted units' : 'Units'}
            required
            type="number"
            min="0"
            value={quantity}
            onChange={(event) => {
              setQuantity(event.target.value)
              setError('')
            }}
            error={error}
            suffix="units"
            data-autofocus
          />

          <Select
            label="Reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            options={ADJUSTMENT_REASONS}
            hint="Saved beside the number, so a count is never changed without a reason."
          />
          <Select
            label="Approved by"
            value={by}
            onChange={(event) => setBy(event.target.value)}
            options={AUTHORISERS}
          />
        </FieldGroup>

        {((direction === 'out' && amount > 0) || (direction === 'count' && quantity !== '' && delta < 0)) &&
          next <= product.safeLimit && (
          <p className="flex items-start gap-2 rounded border border-brand-gold/40 bg-brand-gold/10 px-3.5 py-2.5 text-body-sm text-brand-goldInk">
            <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />
            This leaves {next} units, at or below the low stock limit of {product.safeLimit}. The perfume will show up in
            the low-stock list until restocked.
          </p>
        )}
      </div>
    </Modal>
  )
}

export default StockAdjustModal
