import { Schema, model } from 'mongoose'
import { baseOptions } from './options.js'

/**
 * Singleton configuration documents, addressed by key.
 *
 * One collection rather than a schema per concern, because these are all the
 * same shape — a named blob the admin edits and the API reads — and adding
 * `giftWrap` or a store phone number should not need a migration.
 *
 *   pricing — the delivery and wrap fees the order path prices with
 *   store   — name, contact address, currency, social links
 *   content — the merchandising blocks the storefront renders (offer hero,
 *             offer terms, content pages), which are editorial copy rather than
 *             rows in a table
 *
 * `pricing` starts from the `.env` defaults and is then the authority: changing a
 * delivery fee is a settings write, not a redeploy.
 */
const settingSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, trim: true },
    value: { type: Schema.Types.Mixed, required: true },
    label: { type: String, default: '' },
  },
  baseOptions,
)

/** Read one setting, or `fallback` when it has never been written. */
settingSchema.statics.get = async function get(key, fallback = null) {
  const doc = await this.findOne({ key })
  return doc ? doc.value : fallback
}

/** Write one setting. Upsert, so the first run of the seed creates it. */
settingSchema.statics.put = async function put(key, value, label = '') {
  const doc = await this.findOneAndUpdate(
    { key },
    { $set: { value, label } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  )
  return doc.value
}

export const Setting = model('Setting', settingSchema)
export default Setting
