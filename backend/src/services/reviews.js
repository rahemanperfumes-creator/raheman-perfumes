import { Order, Product, Review } from '../models/index.js'
import { notFound, unprocessable } from '../middleware/error.js'
import { adminReview, publicReview } from '../lib/views.js'
import { destroyOwned } from './media.js'

/**
 * Reviews.
 *
 * Nothing a shopper submits is published straight away: a row arrives as
 * `Pending` and the admin's Reviews screen is what makes it public. That is the
 * whole reason `status` exists, and it is why `products.reviewStats()` only
 * counts `Published` rows — an unmoderated review must not move a star rating a
 * shopper is looking at.
 *
 * Photographs are the one place a shopper writes to Cloudinary, and they arrive
 * through `/api/uploads/review-images` first and are attached here by id, so the
 * upload can be retried or abandoned without leaving a half-written review
 * behind.
 */

/** The published reviews for a fragrance, newest first. */
export async function forProduct(productIdOrSlug, { limit = 50 } = {}) {
  const product = await resolveProduct(productIdOrSlug)
  if (!product) return []
  const rows = await Review.find({ product: product._id, status: 'Published' })
    .sort({ date: -1, createdAt: -1 })
    .limit(limit)
  return rows.map(publicReview)
}

/** `GET /api/admin/reviews` — the moderation queue. */
export async function adminList({ status, product, limit = 100 } = {}) {
  const query = {}
  if (status && status !== 'all') query.status = status
  if (product) query.product = product

  const rows = await Review.find(query)
    .sort({ status: 1, date: -1 })
    .limit(Math.min(Number(limit) || 100, 300))
    .populate('product', 'name slug')
  return rows.map(adminReview)
}

/**
 * Submit a review.
 *
 * `verified` is **derived, not accepted**: it is set when the reviewer has a
 * delivered order containing this fragrance. Letting the client claim
 * verification would make the badge meaningless, which is exactly what a
 * "Verified purchase" label must not be.
 */
export async function create(input, { customer = null } = {}) {
  const product = await resolveProduct(input.product ?? input.slug)
  if (!product) throw notFound('That fragrance does not exist.')

  const rating = Number(input.rating)
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) throw unprocessable('A rating must be between 1 and 5.')

  const verified = customer ? await hasBought(customer._id, product._id) : false

  return Review.create({
    product: product._id,
    customer: customer?._id ?? null,
    name: input.name || customer?.name || 'Anonymous',
    city: input.city || customer?.city || '',
    rating: Math.round(rating),
    title: input.title ?? '',
    body: input.body ?? '',
    date: new Date(),
    verified,
    photos: input.photoIds ?? [],
    photoCount: Number(input.photoCount) || 0,
    // Anything a shopper sends waits for moderation.
    status: input.status ?? 'Pending',
  })
}

/** Has this patron had this fragrance delivered to them? */
async function hasBought(customerId, productId) {
  const count = await Order.countDocuments({
    customer: customerId,
    status: 'Delivered',
    'items.product': productId,
  })
  return count > 0
}

/** Publish, reject, or return a review to the queue. */
export async function setStatus(id, status, { actor = null } = {}) {
  const review = await Review.findById(id)
  if (!review) throw notFound('That review does not exist.')
  review.status = status
  await review.save()
  return review
}

/** Mark a review as helpful. Increments only — there is no un-vote. */
export async function markHelpful(id) {
  const review = await Review.findByIdAndUpdate(id, { $inc: { helpful: 1 } }, { new: true })
  if (!review) throw notFound('That review does not exist.')
  return review
}

/** Delete a review, taking its photographs with it. */
export async function remove(id) {
  const review = await Review.findById(id)
  if (!review) throw notFound('That review does not exist.')
  await destroyOwned('review', review._id)
  await review.deleteOne()
  return review
}

/** Reported counts for a fragrance, for the admin's product drawer. */
export async function summaryFor(productId) {
  const rows = await Review.aggregate([
    { $match: { product: productId } },
    { $group: { _id: '$status', count: { $sum: 1 }, average: { $avg: '$rating' } } },
  ])
  return Object.fromEntries(rows.map((row) => [row._id, { count: row.count, average: Math.round(row.average * 10) / 10 }]))
}

/** Accept either an ObjectId or a slug, as the two callers each have one. */
async function resolveProduct(value) {
  const text = String(value ?? '')
  if (/^[a-f0-9]{24}$/i.test(text)) return Product.findById(text)
  return Product.findOne({ slug: text.toLowerCase() })
}

export default { forProduct, adminList, create, setStatus, markHelpful, remove, summaryFor }
