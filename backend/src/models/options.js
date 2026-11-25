import { Schema, model } from 'mongoose'

/**
 * Shared schema options.
 *
 * `toJSON` maps `_id` to `id` and drops `__v`, so a document sent straight out
 * of a controller is still shaped like the rest of the API rather than leaking
 * Mongo's `_id`/`__v` pair. The serializers in `src/lib/views.js` do the
 * deliberate shaping; this is only the safety net for the places that do not
 * need one (a setting, an audit entry).
 */
export const baseOptions = {
  timestamps: true,
  toJSON: {
    versionKey: false,
    transform(_doc, ret) {
      if (ret._id != null) {
        ret.id = String(ret._id)
        delete ret._id
      }
      return ret
    },
  },
}

/** An ObjectId reference, spelled once so the intent is visible at each use. */
export const ref = (model, { required = true } = {}) => ({
  type: Schema.Types.ObjectId,
  ref: model,
  required,
  index: true,
})

export default baseOptions
