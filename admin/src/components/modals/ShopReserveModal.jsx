import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Form'
import { Modal } from '@/components/ui/Modal'
import { Icon } from '@/components/ui/Icon'
import { useAdminStore } from '@/store/adminStore'

/**
 * Keep some of a fragrance for the shop counter.
 *
 * There is one shelf. The reserve is a floor the website may not sell below:
 * with 20 on hand and 4 kept for the shop, the counter can still sell all 20
 * while an online shopper is offered 16. Nothing moves on the shelf when this
 * is saved, which is why it is its own form rather than a kind of stock
 * adjustment — and why it writes no ledger row.
 */
export function ShopReserveModal({ open, onClose, product = null }) {
  const setShopReserve = useAdminStore((state) => state.setShopReserve)
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)

  useEffect(() => {
    if (!open || !product) return
    setValue(String(product.shopReserve ?? 0))
    setError('')
    setSaving(false)
    savingRef.current = false
  }, [open, product])

  if (!product) return null

  const reserve = Math.max(0, Math.floor(Number(value) || 0))
  const online = Math.max(0, product.stock - reserve)

  const onSave = async () => {
    if (savingRef.current) return
    if (value === '' || Number(value) < 0 || !Number.isFinite(Number(value))) {
      setError('Enter how many units to keep for the shop — 0 for none.')
      return
    }
    savingRef.current = true
    setSaving(true)
    try {
      const saved = await setShopReserve(product.id, reserve)
      if (saved !== null) onClose()
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title="Keep for Shop Counter"
      description={`${product.name} · ${product.sku}`}
      footer={
        <>
          <Button variant="ghost" disabled={saving} onClick={onClose}>
            Cancel
          </Button>
          <Button variant="gold" icon="check" loading={saving} disabled={saving} onClick={onSave}>
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded border border-outline-variant/60 bg-surface-low/60 px-4 py-3">
            <p className="text-label-sm font-bold uppercase tracking-wider text-ink-muted">Shop counter sees</p>
            <p className="tabular font-serif text-headline-md font-semibold text-ink">{product.stock}</p>
            <p className="text-body-sm text-ink-muted">the whole shelf</p>
          </div>
          <div className="rounded border border-outline-variant/60 bg-surface-low/60 px-4 py-3">
            <p className="text-label-sm font-bold uppercase tracking-wider text-ink-muted">Website shows</p>
            <p className="tabular font-serif text-headline-md font-semibold text-ink">{online}</p>
            <p className="text-body-sm text-ink-muted">{online === 0 ? 'sold out online' : `“${online} left”`}</p>
          </div>
        </div>

        <Input
          label="Keep for the shop"
          type="number"
          min="0"
          value={value}
          onChange={(event) => {
            setValue(event.target.value)
            setError('')
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') onSave()
          }}
          error={error}
          suffix="units"
          hint="Online buyers cannot order these. Only shop counter billing can use them."
          data-autofocus
        />

        {reserve > product.stock && (
          <p className="flex items-start gap-2 rounded border border-brand-gold/40 bg-brand-gold/10 px-3.5 py-2.5 text-body-sm text-brand-goldInk">
            <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />
            That is more than the {product.stock} you have, so the website will show it as sold out.
          </p>
        )}
      </div>
    </Modal>
  )
}

export default ShopReserveModal
