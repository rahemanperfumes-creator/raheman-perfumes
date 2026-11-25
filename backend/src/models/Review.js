import { Schema, model } from 'mongoose'
import { baseOptions, ref } from './options.js'

/**
 * A review, and the photographs a shopper attached to it.
 *
 * The storefront's `frontend/src/data/reviews.js` records `photos` as a
 * **number** — how many photographs a review has, with no files behind it — and
 * the PDP renders that count. Here it is split in two: `photos` holds real media
 * references and `photoCount` carries the fixture's number, so the count the
 * storefront already displays stays correct, and a genuine upload adds to it
 * instead of replacing it. The public serializer emits the sum as a number, in
 * the shape the storefront expects.
 *
 * `status` is what makes the admin's Reviews screen meaningful: nothing a shopper
 * submits is published until someone clears it.
 */
export const REVIEW_STATUSES = ['Published', 'Pending', 'Rejected']

const reviewSchema = new Schema(
  {
    product: ref('Product'),
    /** Null when a review was written by a guest, or migrated without a patron. */
    customer: ref('Customer', { required: false, default: null }),

    name: { type: String, required: true, trim: true },
    city: { type: String, default: '' },
    rating: { type: Number, required: true, min: 1, max: 5 },
    title: { type: String, default: '' },
    body: { type: String, default: '' },
    date: { type: Date, required: true, default: () => new Date() },

    /** The house has confirmed this patron actually bought the fragrance. */
    verified: { type: Boolean, default: false },
    helpful: { type: Number, default: 0, min: 0 },

    /** Real uploads. See the note at the top about `photoCount`. */
    photos: { type: [ref('Media', { required: false })], default: [] },
    photoCount: { type: Number, default: 0, min: 0 },

    status: { type: String, enum: REVIEW_STATUSES, default: 'Published', index: true },
    legacyId: { type: String, default: null },
  },
  baseOptions,
)

reviewSchema.index({ product: 1, status: 1, date: -1 })
reviewSchema.index({ product: 1, rating: 1 })

export const Review = model('Review', reviewSchema)
export default Review
