import mongoose from 'mongoose'
import { Product, StockLedger } from '../models/index.js'
import { conflict, notFound } from '../middleware/error.js'
import { logStock } from './activity.js'
import { cache } from '../lib/cache.js'

/**
 * Stock movement, and the ledger that explains it.
 *
 * Every change to a shelf's count goes through this file, because the number and
 * the reason for it have to move together. `product.stock` is the current count;
 * `stockledger` is how it got there. Writing one without the other leaves either
 * a count nobody can account for or a history that contradicts the shelf, so
 * both are written inside a single transaction and neither survives without the
 * other.
 *
 * **This is why a replica set is required.** MongoDB only offers multi-document
 * transactions on a replica set. Atlas always is one; a bare local `mongod` is
 * not, which is what the note in `.env.example` is about, and
 * `mongodb-memory-server` is started as one so the smoke test exercises the real
 * path rather than a degraded one.
 *
 * Concurrency, since this is the part that is easy to get wrong: two staff
 * members restocking the same fragrance at once both read the same `previous`.
 * Under snapshot isolation MongoDB aborts one of them with a write conflict, and
 * `withTransaction` retries it against the new state — so the second attempt
 * reads the first one's `next` as its own `previous`, and the ledger stays a
 * single coherent chain rather than two rows that both claim to start at 10.
 */

/**
 * The transactional core: move stock and record why.
 *
 * @param {object} input
 * @param {any} input.productId
 * @param {number} [input.change]  a delta, e.g. `+24` or `-3`
 * @param {number} [input.next]    an absolute count, for a stock-take correction
 * @param {string} [input.reason]
 * @param {string} [input.reasonNote]
 * @param {string} [input.batch]
 * @param {any} [input.order]
 * @param {any} [input.actor]
 * @param {string} [input.idempotencyKey]
 * @param {boolean} [input.respectReserve] hold the shelf at or above the
 *   product's `shopReserve` — true for anything sold online, false for the
 *   counter and for staff adjustments, which may draw on the whole shelf
 * @param {import('mongoose').ClientSession} session
 */
async function applyAdjustment(input, session) {
  const product = await Product.findById(input.productId).session(session)
  if (!product) throw notFound('That fragrance does not exist.')

  const previous = product.stock ?? 0
  const change = input.next !== undefined ? Number(input.next) - previous : Number(input.change) || 0
  const next = previous + change

  /*
   * A movement of nothing is not a movement. The ledger is the story of the
   * shelf; a row reading `20 → 20` is that story with a lie inside it, so the
   * adjustment is refused outright rather than recorded. (This also catches a
   * counted number equal to the current shelf — "there are actually 20" when
   * the shelf already says 20.)
   */
  if (change === 0) throw conflict('That adjustment would not change anything.')

  if (next < 0) {
    throw conflict(`Only ${previous} in stock, so it cannot be reduced by ${Math.abs(change)}.`)
  }

  const reserve = input.respectReserve ? (product.shopReserve ?? 0) : 0
  let actualNext = next

  if (change < 0) {
    const minRequired = reserve + Math.abs(change)
    if (previous < minRequired) {
      const available = Math.max(0, previous - reserve)
      throw conflict(
        available > 0
          ? `${product.name} has only ${available} available online — you asked for ${Math.abs(change)}.`
          : `${product.name} is sold out online.`,
      )
    }

    // Atomic conditional decrement in MongoDB WiredTiger:
    // Guarantees zero flash-sale overselling by atomically requiring stock >= minRequired
    const updated = await Product.findOneAndUpdate(
      { _id: product._id, stock: { $gte: minRequired } },
      { $inc: { stock: change } },
      { new: true, session },
    )

    if (!updated) {
      const current = await Product.findById(product._id).session(session)
      const currentAvailable = Math.max(0, (current?.stock ?? 0) - reserve)
      throw conflict(
        currentAvailable > 0
          ? `${product.name} has only ${currentAvailable} available online — you asked for ${Math.abs(change)}.`
          : `${product.name} is sold out online.`,
      )
    }

    actualNext = updated.stock
    product.stock = updated.stock
  } else {
    // Restock or absolute count adjustment
    const updated = await Product.findOneAndUpdate(
      { _id: product._id },
      input.next !== undefined ? { $set: { stock: Number(input.next) } } : { $inc: { stock: change } },
      { new: true, session },
    )
    actualNext = updated.stock
    product.stock = updated.stock
  }

  // Invalidate product cache tags so storefronts immediately see accurate stock
  try {
    cache.del(`product:id:${product._id}`)
    cache.del(`product:slug:${product.slug}`)
    cache.invalidateTags(['products', 'catalogue'])
  } catch {
    // Non-fatal cache eviction failure
  }

  const [row] = await StockLedger.create(
    [
      {
        product: product._id,
        previous,
        change,
        next: actualNext,
        reason: input.reason ?? 'Manual adjustment',
        reasonNote: input.reasonNote ?? '',
        batch: input.batch ?? product.batch ?? '',
        order: input.order ?? null,
        actor: input.actor ?? null,
        at: new Date(),
        /*
         * Left out entirely when there is no key, rather than written as `null`.
         * The unique index on this field is sparse, which skips a *missing*
         * field but not an explicit null — so `null` here would make the second
         * keyless adjustment a duplicate-key error. See the model for the long
         * version.
         */
        ...(input.idempotencyKey ? { idempotencyKey: input.idempotencyKey } : {}),
      },
    ],
    { session },
  )

  return { product, row }
}

/**
 * Adjust stock in its own transaction.
 *
 * The idempotency key is what makes a retry safe. An admin who double-taps
 * Restock, or a browser that resends a request after a timeout, carries the same
 * key; the unique sparse index on `stockLedger.idempotencyKey` refuses the
 * second row, which aborts the transaction and leaves the shelf exactly as the
 * first attempt left it. The caller gets the original movement back with
 * `duplicate: true` rather than an error, because from their point of view the
 * restock did happen.
 */
export async function adjustStock(input) {
  const session = await mongoose.startSession()
  try {
    let result = null
    await session.withTransaction(async () => {
      result = await applyAdjustment(input, session)
    })
    await logStock(
      `Stock ${result.row.change >= 0 ? 'increased' : 'reduced'} by ${Math.abs(result.row.change)} for ${result.product.name} — ${result.row.reason}.`,
      { actor: input.actorLabel ?? 'Inventory', target: result.product.sku },
    )
    return { ...result, duplicate: false }
  } catch (error) {
    if (error?.code === 11000 && input.idempotencyKey) {
      // Already applied. Return the movement that did it, not a failure.
      const row = await StockLedger.findOne({ idempotencyKey: input.idempotencyKey }).populate('product')
      if (row) return { product: row.product, row, duplicate: true }
    }
    throw error
  } finally {
    await session.endSession()
  }
}

/**
 * Take stock for an order, inside the caller's transaction.
 *
 * Used by the order service, which needs the deduction to commit with the order
 * itself — an order that exists while its stock never left the shelf is how a
 * shop oversells. Deliberately no retry wrapper here: the caller's transaction is
 * the unit of retry.
 *
 * Lines are summed per fragrance first. Stock is counted per fragrance, not per
 * size, so a bill with a 50ml and a 100ml of the same scent is one movement of
 * two — and two movements would also share one idempotency key, which the
 * unique index refuses.
 *
 * Only a counter bill (`channel: 'Shop'`) may sell into the shop reserve.
 */
export async function deductForOrder(lines, order, session, actor = null) {
  const counter = order.channel === 'Shop'
  const totals = new Map()
  for (const line of lines) {
    if (!line.product) continue
    const key = String(line.product)
    totals.set(key, (totals.get(key) ?? 0) + Math.abs(line.qty))
  }

  const applied = []
  for (const [productId, qty] of totals) {
    const { row } = await applyAdjustment(
      {
        productId,
        change: -qty,
        reason: counter ? 'Shop sale' : 'Order placed',
        reasonNote: `${counter ? 'Shop bill' : 'Order'} ${order.number}`,
        order: order._id,
        actor,
        respectReserve: !counter,
        idempotencyKey: `order:${order.number}:${productId}`,
      },
      session,
    )
    applied.push(row)
  }
  return applied
}

/** What a deduction is reversed with — a voided bill reads differently in the ledger. */
const REVERSAL = { 'Order placed': 'Order cancelled', 'Shop sale': 'Shop sale voided' }

/**
 * Put stock back, inside the caller's transaction.
 *
 * A cancelled order returns what it took. It reads the ledger rather than the
 * order's lines, so it restores exactly what was deducted — including the case
 * where the shelf was edited by hand in between and the two would no longer
 * agree on quantities.
 */
export async function restoreForOrder(order, session, actor = null) {
  const rows = await StockLedger.find({ order: order._id, reason: { $in: Object.keys(REVERSAL) } }).session(session)
  const restored = []

  for (const row of rows) {
    const already = await StockLedger.findOne({
      order: order._id,
      reason: { $in: Object.values(REVERSAL) },
      product: row.product,
    }).session(session)
    if (already) continue

    const { row: reversal } = await applyAdjustment(
      {
        productId: row.product,
        change: Math.abs(row.change),
        reason: REVERSAL[row.reason],
        reasonNote: `${row.reason === 'Shop sale' ? 'Shop bill' : 'Order'} ${order.number} ${row.reason === 'Shop sale' ? 'voided' : 'cancelled'}`,
        order: order._id,
        actor,
        idempotencyKey: `cancel:${order.number}:${String(row.product)}`,
      },
      session,
    )
    restored.push(reversal)
  }

  return restored
}

/**
 * Set how many units the counter keeps back from the storefront.
 *
 * No ledger row: nothing left the shelf. The reserve only moves the line
 * between what the shop may sell and what the website may, so it is an audit
 * entry in the activity feed rather than a stock movement.
 *
 * A reserve above the current count is allowed and simply means the fragrance
 * is sold out online until the next delivery — a shop holding its last bottles
 * for walk-in customers is a reasonable thing to want.
 */
export async function setShopReserve(productId, shopReserve, { actorLabel = 'Inventory' } = {}) {
  const product = await Product.findById(productId)
  if (!product) throw notFound('That fragrance does not exist.')

  const previous = product.shopReserve ?? 0
  product.shopReserve = Math.max(0, Math.floor(Number(shopReserve) || 0))
  await product.save()

  if (previous !== product.shopReserve) {
    await logStock(
      `Shop reserve for ${product.name} set to ${product.shopReserve} (was ${previous}) — ${product.onlineStock} of ${product.stock} now available online.`,
      { actor: actorLabel, target: product.sku },
    )
  }
  return product
}

/**
 * The ledger, newest first.
 *
 * `productId` narrows it to one fragrance's history, which is what the Inventory
 * drawer shows; without it the admin gets the whole movement log.
 */
export async function listLedger({ limit = 50, productId = null } = {}) {
  const query = productId ? { product: productId } : {}
  return StockLedger.find(query)
    .sort({ at: -1 })
    .limit(Math.min(Number(limit) || 50, 200))
    .populate('product', 'name sku')
}

/** Every movement that touched one order, for the order drawer's history. */
export const ledgerForOrder = (orderId) => StockLedger.find({ order: orderId }).sort({ at: 1 }).populate('product', 'name sku')

/** Fragrances at or below their safe limit — the dashboard's low-stock list. */
export async function lowStock() {
  return Product.aggregate([
    { $match: { status: 'Active', $expr: { $lte: ['$stock', '$safeLimit'] } } },
    { $sort: { stock: 1 } },
    { $limit: 50 },
    { $project: { name: 1, sku: 1, stock: 1, safeLimit: 1, tier: 1 } },
  ])
}

export default { adjustStock, deductForOrder, restoreForOrder, setShopReserve, listLedger, ledgerForOrder, lowStock }
