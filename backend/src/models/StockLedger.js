import { Schema, model } from 'mongoose'
import { baseOptions, ref } from './options.js'

/**
 * Every movement of stock, and why.
 *
 * Append-only: a row is never edited or deleted. The shelf's current count is
 * `product.stock`, and this is the history that explains how it got there, so an
 * adjustment writes both — inside one transaction, or the two disagree and
 * neither can be trusted.
 *
 * `previous` and `next` are stored rather than derived from the running total,
 * because the point of an audit row is to say what the count was *at that
 * moment* — a later correction must not rewrite history.
 *
 * `idempotencyKey` is what makes a retried adjustment safe: an admin who
 * double-taps Restock, or a request the client resends after a timeout, carries
 * the same key and the unique index refuses the second row.
 */
export const STOCK_REASONS = [
  'Stock received',
  'Stock count correction',
  'Damaged or expired',
  'Order placed',
  'Order cancelled',
  'Shop sale',
  'Shop sale voided',
  'Return to stock',
  'New Batch Made',
  'Manual adjustment',
]

const stockLedgerSchema = new Schema(
  {
    product: ref('Product'),
    previous: { type: Number, required: true },
    change: { type: Number, required: true },
    next: { type: Number, required: true, min: 0 },
    reason: { type: String, enum: STOCK_REASONS, default: 'Manual adjustment' },
    reasonNote: { type: String, default: '' },
    batch: { type: String, default: '' },
    /** The order that caused the movement, when one did. */
    order: ref('Order', { required: false, default: null }),
    actor: ref('User', { required: false, default: null }),
    at: { type: Date, required: true, default: () => new Date() },
    /**
     * Sparse so the many rows without a key do not collide on null.
     *
     * Deliberately no `default: null`, and the difference is not cosmetic: a
     * sparse index skips documents that are *missing* the field, but an explicit
     * `null` is a value like any other and is indexed normally. With a null
     * default, every keyless row carried one and the unique constraint refused
     * the **second** ordinary adjustment — an admin's plain "stock count
     * correction" failing with a duplicate-key error. The field is left absent
     * when there is no key; see `applyAdjustment` in `services/inventory.js`.
     */
    idempotencyKey: { type: String },
  },
  baseOptions,
)

stockLedgerSchema.index({ product: 1, at: -1 })
stockLedgerSchema.index({ at: -1 })
stockLedgerSchema.index({ idempotencyKey: 1 }, { unique: true, sparse: true })

export const StockLedger = model('StockLedger', stockLedgerSchema)
export default StockLedger
