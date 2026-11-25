import { Counter, Order } from '../models/index.js'

/**
 * Human order numbers, e.g. `RP0001`, `RP0002`.
 *
 * Sequence is strictly coordinated with the database so orders follow the
 * chronological and numeric sequence of orders stored in MongoDB.
 */

export const ORDER_COUNTER_KEY = 'order'

/** Turn a sequence number into an order number. */
export const formatOrderNumber = (sequence) => `RP${String(sequence).padStart(4, '0')}`

/** Reserve the next order number based on the database sequence. */
export async function nextOrderNumber() {
  try {
    const latestOrder = await Order.findOne({}, { number: 1 }).sort({ number: -1, placedAt: -1 }).lean()
    const highestExisting = latestOrder ? (parseOrderNumber(latestOrder.number) || 0) : 0
    if (highestExisting > 0) {
      await Counter.raiseTo(ORDER_COUNTER_KEY, highestExisting)
    }
  } catch {
    // Fall back to counter if query fails
  }

  const sequence = await Counter.next(ORDER_COUNTER_KEY)
  return formatOrderNumber(sequence)
}

/** Pull the sequence back out of an order number, or `null` if it is not one. */
export function parseOrderNumber(number) {
  const match = /^RP(\d+)$/.exec(String(number ?? '').toUpperCase())
  return match ? Number(match[1]) : null
}

export default { nextOrderNumber, formatOrderNumber, parseOrderNumber, ORDER_COUNTER_KEY }
