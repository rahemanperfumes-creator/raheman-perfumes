import { Customer, Order, Product, Review } from '../models/index.js'
import { lowStock } from './inventory.js'
import { countsByStatus } from './orders.js'
import { recent } from './activity.js'
import { isoDay } from '../lib/format.js'

/**
 * The dashboard's numbers.
 *
 * Every figure here is **aggregated on read** rather than kept in a totals row.
 * A stored daily rollup is faster and wrong the first time an order is
 * cancelled, and the admin panel already reports its own figures — so the
 * question this file answers is "what do the rows actually say", with no second
 * copy to drift.
 *
 * Two conventions worth stating, because both are places a dashboard quietly
 * lies:
 *
 *   • **Cancelled orders are excluded from revenue.** They are counted in
 *     `orders.byStatus` so the tab still shows them, but their money never
 *     enters a revenue total.
 *   • **The revenue series is bucketed in IST.** An order placed at 02:00 IST is
 *     that day's business. Grouping by a UTC date would file it under yesterday
 *     and make a shop's morning look like the night before.
 */

/** The headline tiles. */
export async function summary() {
  const [revenue, orders, customers, reviews, low] = await Promise.all([
    Order.aggregate([
      { $match: { status: { $ne: 'Cancelled' } } },
      {
        $group: {
          _id: null,
          revenue: { $sum: '$pricing.total' },
          discount: { $sum: '$pricing.discount' },
          units: { $sum: { $sum: '$items.qty' } },
          count: { $sum: 1 },
        },
      },
    ]),
    countsByStatus(),
    Customer.countDocuments(),
    Review.countDocuments({ status: 'Pending' }),
    lowStock(),
  ])

  const totals = revenue[0] ?? { revenue: 0, discount: 0, units: 0, count: 0 }

  return {
    revenue: totals.revenue,
    discount: totals.discount,
    units: totals.units,
    orders: { total: Object.values(orders).reduce((sum, count) => sum + count, 0), byStatus: orders },
    averageOrder: totals.count ? Math.round(totals.revenue / totals.count) : 0,
    customers,
    pendingReviews: reviews,
    lowStock: low.length,
  }
}

/**
 * Revenue per day, newest last, for the dashboard chart.
 *
 * @param {number} days how far back to look
 */
export async function revenueSeries({ days = 30 } = {}) {
  const span = Math.min(Math.max(Number(days) || 30, 1), 365)
  const since = new Date(Date.now() - span * 24 * 60 * 60 * 1000)

  const rows = await Order.aggregate([
    { $match: { status: { $ne: 'Cancelled' }, placedAt: { $gte: since } } },
    {
      $group: {
        _id: '$placedAt',
        revenue: { $sum: '$pricing.total' },
        orders: { $sum: 1 },
      },
    },
  ])

  // Bucketed in JS rather than with `$dateToString`, so the IST offset is the
  // same one `isoDay()` uses everywhere else in the API. A `$dateToString` with
  // a timezone would be a second definition of "what day is this" waiting to
  // disagree with the first.
  const buckets = new Map()
  for (let offset = span - 1; offset >= 0; offset -= 1) {
    const day = isoDay(new Date(Date.now() - offset * 24 * 60 * 60 * 1000))
    buckets.set(day, { date: day, revenue: 0, orders: 0 })
  }
  for (const row of rows) {
    const day = isoDay(row._id)
    const bucket = buckets.get(day)
    if (bucket) {
      bucket.revenue += row.revenue
      bucket.orders += row.orders
    }
  }

  return [...buckets.values()]
}

/** The best-selling fragrances by revenue. */
export async function topProducts({ limit = 10 } = {}) {
  const rows = await Order.aggregate([
    { $match: { status: { $ne: 'Cancelled' } } },
    { $unwind: '$items' },
    {
      $group: {
        _id: '$items.product',
        name: { $first: '$items.name' },
        sku: { $first: '$items.sku' },
        slug: { $first: '$items.slug' },
        units: { $sum: '$items.qty' },
        revenue: { $sum: '$items.lineTotal' },
      },
    },
    { $sort: { revenue: -1 } },
    { $limit: Math.min(Number(limit) || 10, 50) },
  ])
  return rows.map((row) => ({ ...row, id: row._id ? String(row._id) : null, _id: undefined }))
}

/** Revenue split by the shelf each fragrance sits on. */
export async function byCategory() {
  const rows = await Order.aggregate([
    { $match: { status: { $ne: 'Cancelled' } } },
    { $unwind: '$items' },
    { $lookup: { from: 'products', localField: 'items.product', foreignField: '_id', as: 'product' } },
    { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'categories', localField: 'product.category', foreignField: '_id', as: 'category' } },
    { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } },
    {
      $group: {
        _id: '$category.name',
        units: { $sum: '$items.qty' },
        revenue: { $sum: '$items.lineTotal' },
      },
    },
    { $sort: { revenue: -1 } },
  ])
  return rows.map((row) => ({ category: row._id ?? 'Unfiled', units: row.units, revenue: row.revenue }))
}

/** How each tier is performing — the admin's provenance breakdown. */
export async function byTier() {
  const rows = await Order.aggregate([
    { $match: { status: { $ne: 'Cancelled' } } },
    { $unwind: '$items' },
    { $lookup: { from: 'products', localField: 'items.product', foreignField: '_id', as: 'product' } },
    { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
    { $group: { _id: '$product.tier', units: { $sum: '$items.qty' }, revenue: { $sum: '$items.lineTotal' } } },
    { $sort: { revenue: -1 } },
  ])
  return rows.map((row) => ({ tier: row._id ?? 'Unknown', units: row.units, revenue: row.revenue }))
}

/** The fragrances closest to running out, worst first. */
export const inventoryAlerts = () => lowStock()

/** The most recent movement on the shop, for the dashboard's feed. */
export const feed = ({ limit = 20 } = {}) => recent({ limit })

/** Everything the dashboard needs in one request. */
export async function dashboard() {
  const [tiles, series, best, alerts, activity] = await Promise.all([
    summary(),
    revenueSeries({ days: 30 }),
    topProducts({ limit: 5 }),
    inventoryAlerts(),
    feed({ limit: 12 }),
  ])
  return { summary: tiles, revenueSeries: series, topProducts: best, lowStock: alerts, activity }
}

/** Catalogue health, for the admin's inventory screen header. */
export async function inventorySummary() {
  const [totals, alerts] = await Promise.all([
    Product.aggregate([
      { $match: { status: 'Active' } },
      {
        $group: {
          _id: null,
          products: { $sum: 1 },
          units: { $sum: '$stock' },
          /** What the shelf is worth at cost, not at retail. */
          costValue: { $sum: { $multiply: ['$stock', '$cost'] } },
          retailValue: { $sum: { $multiply: ['$stock', '$listPrice'] } },
        },
      },
    ]),
    lowStock(),
  ])

  const row = totals[0] ?? { products: 0, units: 0, costValue: 0, retailValue: 0 }
  return { ...row, lowStock: alerts, lowStockCount: alerts.length }
}

export default { summary, revenueSeries, topProducts, byCategory, byTier, inventoryAlerts, feed, dashboard, inventorySummary }
