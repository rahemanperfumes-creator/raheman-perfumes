import { Schema, model } from 'mongoose'
import { baseOptions } from './options.js'

/**
 * The house's audit trail, and the admin dashboard's activity feed.
 *
 * Append-only, and deliberately **not** derived from the other collections. Most
 * of what appears here could in principle be reconstructed — an order's status
 * history, a run of ledger rows — but the feed also carries things nothing else
 * records ("blocked Sameer Joshi after two chargebacks", "flagged Eros Flame as
 * depleted"), and an audit log that can only report what is still reconstructable
 * is not an audit log.
 *
 * The field names mirror `admin/src/data/activity.js` exactly, including `tone`
 * as a display vocabulary and `actor` as a **string** — the fixture shows
 * 'Atelier Lead' and 'Superadmin', which are roles rather than people, so a ref
 * to a user would be a lie. `actorUser` keeps the real link where there is one.
 */
export const ACTIVITY_TONES = ['stock', 'order', 'alert', 'price', 'customer']

const activitySchema = new Schema(
  {
    at: { type: Date, required: true, default: () => new Date(), index: true },
    actor: { type: String, default: 'System' },
    actorUser: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    tone: { type: String, enum: ACTIVITY_TONES, default: 'order' },
    /** The sentence shown in the feed, e.g. "marked order RP2039 as packed". */
    text: { type: String, required: true },
    /** Whatever the sentence is about — an order number, SKU, batch or id. */
    target: { type: String, default: '' },
  },
  baseOptions,
)

activitySchema.index({ at: -1 })

export const Activity = model('Activity', activitySchema)
export default Activity
