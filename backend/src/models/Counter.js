import { Schema, model } from 'mongoose'
import { baseOptions } from './options.js'

/**
 * Atomic sequences, for values that must be unique and human-readable: order
 * numbers (`RP2042`) and SKUs (`RP-ORG-1061`).
 *
 * A `findOneAndUpdate({$inc: {seq: 1}})` is the only way to hand out the next
 * number without two concurrent orders colliding on the same one — reading a max
 * and adding one, which is how the frontend fixtures do it, cannot be made safe
 * under concurrency. The `upsert` means the first call creates the counter rather
 * than failing.
 */
const counterSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    seq: { type: Number, required: true, default: 0 },
  },
  baseOptions,
)

/**
 * Reserve the next value for `key`, consuming it.
 *
 * @param {string} key e.g. `order` or `sku:ORG`
 * @returns {Promise<number>}
 */
counterSchema.statics.next = async function next(key) {
  const doc = await this.findOneAndUpdate(
    { key },
    { $inc: { seq: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  )
  return doc.seq
}

/**
 * Raise a counter to at least `value`, without ever lowering it.
 *
 * Used by the seed to move a fresh counter past the numbers the fixtures already
 * used. `$max` is what makes that safe to run repeatedly: seeding twice cannot
 * rewind a sequence and hand out a number that is already on an order.
 */
counterSchema.statics.raiseTo = async function raiseTo(key, value) {
  const doc = await this.findOneAndUpdate(
    { key },
    { $max: { seq: Number(value) || 0 } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  )
  return doc.seq
}

/** Read a counter without consuming a value. */
counterSchema.statics.peek = async function peek(key) {
  const doc = await this.findOne({ key })
  return doc?.seq ?? 0
}

export const Counter = model('Counter', counterSchema)
export default Counter
