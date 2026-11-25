import { Button } from '@/components/ui/Button'
import { Barcode } from '@/components/ui/Barcode'
import { Modal } from '@/components/ui/Modal'
import { Icon } from '@/components/ui/Icon'
import { TIER_CODE } from '@/data/products'
import { formatPrice } from '@/lib/format'

/**
 * A printable shelf label for one fragrance.
 *
 * The barcode is **not typed anywhere in the panel** — it is derived from the SKU
 * by the backend when the fragrance is created (`barcodeOf` in
 * `backend/src/models/Product.js`) and is fixed from then on. This modal is a
 * *view* of that code: it prints it, and deliberately offers no way to edit it,
 * because a label that disagreed with the catalogue would be worse than no label.
 *
 * Two details that matter for a label rather than a screen:
 *
 *  - The symbol is rendered on white with black bars regardless of the panel's
 *    theme. A barcode inverted by dark mode is one a scanner refuses, and the
 *    failure looks like a broken scanner rather than a broken label.
 *  - The SKU, name and price are the caption. `humanReadable` from the API is the
 *    same string as the value, so the line under the bars can be checked against
 *    it by eye — which is how a mislabelled bottle gets caught.
 */
export function BarcodeLabelModal({ open, onClose, product }) {
  if (!product) return null

  const barcode = product.barcode ?? null
  const value = barcode?.value ?? null

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Shelf label"
      description={`${product.name} · ${product.sku}`}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button variant="gold" icon="print" onClick={() => window.print()}>
            Print
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col items-center gap-3 rounded border border-outline-variant bg-white p-5 text-black">
          <div className="text-center">
            <p className="font-serif text-headline-sm font-semibold leading-tight">{product.name}</p>
            <p className="mt-0.5 text-body-sm text-neutral-600">{product.brand}</p>
          </div>

          <div className="w-full">
            <Barcode value={value ?? ''} height={64} />
          </div>

          <div className="flex w-full items-baseline justify-between border-t border-neutral-200 pt-2.5">
            <span className="tabular text-body-sm font-semibold">{product.sku}</span>
            <span className="text-body-sm text-neutral-600">{product.category}</span>
            <span className="tabular text-body-md font-semibold">{formatPrice(product.price)}</span>
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-body-sm">
          <dt className="text-ink-muted">Symbology</dt>
          <dd className="text-right font-medium text-ink">{barcode?.symbology ?? 'Code 128'}</dd>
          <dt className="text-ink-muted">Encoded value</dt>
          <dd className="tabular text-right font-medium text-ink">{value ?? '—'}</dd>
          <dt className="text-ink-muted">Type prefix</dt>
          <dd className="text-right font-medium text-ink">{TIER_CODE[product.tier] ?? 'GEN'}</dd>
        </dl>

        <p className="flex items-start gap-2.5 rounded border border-outline-variant/60 bg-surface-low/60 px-3.5 py-2.5 text-body-sm text-ink-variant">
          <Icon name="lock" className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" />
          <span>
            Staff-only, made from the SKU. It cannot be edited here.
          </span>
        </p>
      </div>
    </Modal>
  )
}

export default BarcodeLabelModal
