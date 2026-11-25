import { Schema, model } from 'mongoose'
import { baseOptions } from './options.js'

/**
 * A promotional coupon.
 *
 * This model exists because of one problem: `frontend/src/data/offers.js` stores
 * each coupon's discount as a **function** —
 *
 *     discount: pct(10, 999, 500)     // (subtotal) => …
 *     discount: flat(200, 1499)
 *
 * — and a function cannot go in a database. It is stored as data instead: the
 * `type`, `value`, `minOrder` and `cap` that the closure was built from, with
 * `couponDiscount()` in `src/lib/pricing.js` as the single implementation of what
 * those fields mean. The translation is exact:
 *
 *     pct(10, 999, 500)  →  { type: 'percent', value: 10, minOrder: 999, cap: 500 }
 *     flat(200, 1499)    →  { type: 'flat',    value: 200, minOrder: 1499, cap: null }
 *     pct(30, 2500, 2500) →  { type: 'percent', value: 30, minOrder: 2500, cap: 2500 }
 *
 * The upshot is that pricing authority moves from the browser to the server: a
 * coupon becomes an editable row the admin can change without a deploy, and the
 * storefront's own `couponService.validate()` stops being the last word.
 *
 * `scope` is unused by the current seed but present because the fixture's terms
 * already promise it — FRAGRANCE15 "excludes Original branded flacons and Pure
 * Attars" is a real rule the code never implemented, and this is the field it
 * would need.
 */
export const COUPON_TYPES = ['percent']

const couponSchema = new Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    label: { type: String, default: '' },
    headline: { type: String, default: '' },
    description: { type: String, default: '' },
    terms: { type: String, default: '' },

    type: { type: String, enum: COUPON_TYPES, required: true },
    /** Percent points for `percent`, rupees for `flat`. */
    value: { type: Number, required: true, min: 0 },
    /** The raw subtotal must reach this before the code applies at all. */
    minOrder: { type: Number, default: 0, min: 0 },
    /** Ceiling on a percentage discount, in rupees. Null means uncapped. */
    cap: { type: Number, default: null },

    /** Which products the code may be spent on. Empty means the whole catalogue. */
    scope: {
      tiers: { type: [String], default: [] },
      excludeTiers: { type: [String], default: [] },
      categories: { type: [Schema.Types.ObjectId], ref: 'Category', default: [] },
    },

    active: { type: Boolean, default: true, index: true },
    personalOnly: { type: Boolean, default: false, index: true },
    issuedToEmail: { type: String, default: '', lowercase: true, trim: true },
    startsAt: { type: Date, default: null },
    endsAt: { type: Date, default: null },
    usageLimit: { type: Number, default: null },
    usedCount: { type: Number, default: 0, min: 0 },
    legacyId: { type: String, default: null },
  },
  baseOptions,
)

/** Is the code live right now — active, inside its window, and not used up? */
couponSchema.methods.isLive = function isLive(now = new Date()) {
  if (!this.active) return false
  if (this.startsAt && now < this.startsAt) return false
  if (this.endsAt && now > this.endsAt) return false
  if (this.usageLimit != null && this.usedCount >= this.usageLimit) return false
  return true
}

export const Coupon = model('Coupon', couponSchema)
export default Coupon
