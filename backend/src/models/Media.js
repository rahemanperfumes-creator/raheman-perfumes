import { Schema, model } from 'mongoose'
import { baseOptions, ref } from './options.js'

/**
 * A file that lives in Cloudinary, and everything about it that belongs in
 * MongoDB.
 *
 * The split is the whole point: Cloudinary holds the **bytes**, this collection
 * holds every **fact** — who uploaded it, what it belongs to, its dimensions and
 * size, the alt text. Documents reference a media row (`product.images`,
 * `review.photos`) rather than a bare URL, so an asset can be described,
 * re-tagged or found again without scraping URLs out of unrelated tables.
 *
 * `publicId` is the handle Cloudinary needs to transform or destroy the asset,
 * which is why it is stored rather than derived from `secureUrl` — a URL can be
 * restructured by Cloudinary, the public id cannot.
 */
export const MEDIA_OWNERS = ['product', 'review', 'content', 'store', 'brand']
export const MEDIA_RESOURCES = ['image', 'raw']

const mediaSchema = new Schema(
  {
    publicId: { type: String, required: true, unique: true },
    secureUrl: { type: String, required: true },
    /** Cloudinary's delivery type — `upload` for everything this app writes. */
    format: { type: String, default: '' },
    resourceType: { type: String, enum: MEDIA_RESOURCES, default: 'image' },
    bytes: { type: Number, default: 0 },
    width: { type: Number, default: null },
    height: { type: Number, default: null },
    folder: { type: String, default: '' },
    /** What owns this file, so an orphan can be found and destroyed. */
    ownerType: { type: String, enum: MEDIA_OWNERS, default: 'content', index: true },
    ownerId: { type: Schema.Types.ObjectId, default: null, index: true },
    alt: { type: String, default: '' },
    caption: { type: String, default: '' },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    /** The original filename, for the admin's media list. */
    originalName: { type: String, default: '' },
    /** Where the original MIME type sat, since Cloudinary reports a format. */
    mimeType: { type: String, default: '' },
  },
  baseOptions,
)

mediaSchema.index({ ownerType: 1, ownerId: 1, createdAt: -1 })

export const Media = model('Media', mediaSchema)
export default Media
