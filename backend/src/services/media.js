import { Media } from '../models/index.js'
import { FOLDERS } from '../config/cloudinary.js'
import { badRequest, notFound, unavailable } from '../middleware/error.js'
import { resourceTypeFor } from '../middleware/upload.js'
import { publicMedia } from '../lib/views.js'
import * as storage from '../lib/storage.js'

/**
 * Uploads: bytes to storage, the facts about them to MongoDB.
 *
 * This is the split the whole media design rests on. The storage driver holds
 * the file and knows nothing about what it means; the `media` row holds the alt
 * text, the owning document, the dimensions and the uploader, and knows nothing
 * about the bytes. A product references a media row rather than a URL, so the
 * image can be found again, re-described, or destroyed with the document it
 * belongs to.
 *
 * Which driver — Cloudinary or the local disk — is `lib/storage.js`'s decision,
 * not this file's. Everything here works against the `{publicId, secureUrl,
 * …}` shape both of them return.
 *
 * The buffer never touches the disk on the Cloudinary path (`multer` is
 * configured with memory storage), and the local driver writes it once, under
 * `UPLOADS_DIR`.
 */

/**
 * Push a buffer to Cloudinary and record what comes back.
 *
 * The row records **Cloudinary's** answer, not the client's claims. A file
 * arriving named `.png` may be a JPEG, and a browser may report any MIME type it
 * likes; the format, dimensions and byte count are taken from the upload
 * response so the database describes the asset that actually exists.
 *
 * @param {{buffer: Buffer, originalname: string, mimetype: string}} file
 * @param {object} options
 * @param {'product'|'review'|'content'|'store'|'brand'} options.ownerType
 * @param {any} [options.ownerId]
 * @param {string} [options.alt]
 * @param {string} [options.caption]
 * @param {any} [options.uploadedBy]
 * @param {string} [options.folder] one of `FOLDERS`
 */
export async function upload(file, options = {}) {
  if (!file?.buffer?.length) throw badRequest('No file was received.')
  if (!storage.isAvailable()) {
    throw unavailable(storage.unavailableReason(), { code: 'STORAGE_NOT_CONFIGURED' })
  }

  const resourceType = resourceTypeFor(file.mimetype)
  const folder = options.folder ?? FOLDERS[options.ownerType] ?? FOLDERS.content

  // Which driver runs — Cloudinary or the local disk — is decided inside
  // `storage.put`, and both answer the same shape. That is the whole point of
  // the split: this function no longer knows or cares where the bytes landed.
  const stored = await storage.put(file, { folder, resourceType })

  return Media.create({
    ...stored,
    folder,
    ownerType: options.ownerType ?? 'content',
    ownerId: options.ownerId ?? null,
    alt: options.alt ?? '',
    caption: options.caption ?? '',
    uploadedBy: options.uploadedBy ?? null,
    originalName: file.originalname ?? '',
    mimeType: file.mimetype ?? '',
  })
}

/** Upload several at once, for the admin's multi-file drop zone. */
export async function uploadMany(files, options = {}) {
  const rows = []
  for (const file of files ?? []) rows.push(await upload(file, options))
  return rows
}

/**
 * Destroy an asset and its row.
 *
 * Called when the owning document is deleted, which is what stops the Cloudinary
 * account filling with images nothing points at any more. A failure at
 * Cloudinary is reported but does not stop the row being removed: leaving a row
 * behind for an asset that may or may not still exist is worse than removing it,
 * because the row is what the app believes.
 */
export async function destroy(mediaId) {
  const row = await Media.findById(mediaId)
  if (!row) throw notFound('That file does not exist.')

  try {
    await storage.remove(row)
  } catch (error) {
    console.error(`[media] could not delete ${row.publicId}: ${error.message}`)
  }

  await row.deleteOne()
  return row
}

/** Destroy every asset owned by a document — for a cascade delete. */
export async function destroyOwned(ownerType, ownerId) {
  const rows = await Media.find({ ownerType, ownerId })
  const results = []
  for (const row of rows) results.push(await destroy(row._id))
  return results
}

/** Re-describe an asset without re-uploading it. */
export async function describe(mediaId, patch = {}) {
  const row = await Media.findById(mediaId)
  if (!row) throw notFound('That file does not exist.')
  if (patch.alt !== undefined) row.alt = patch.alt
  if (patch.caption !== undefined) row.caption = patch.caption
  if (patch.ownerType !== undefined) row.ownerType = patch.ownerType
  if (patch.ownerId !== undefined) row.ownerId = patch.ownerId
  await row.save()
  return row
}

/** The admin's media library. */
export async function list({ ownerType, ownerId, limit = 60 } = {}) {
  const query = {}
  if (ownerType) query.ownerType = ownerType
  if (ownerId) query.ownerId = ownerId
  const rows = await Media.find(query).sort({ createdAt: -1 }).limit(Math.min(Number(limit) || 60, 200))
  return rows.map(publicMedia)
}

/** Attach uploads to a document, replacing what was there. */
export async function replaceFor(ownerType, ownerId, mediaIds) {
  await Media.updateMany({ ownerType, ownerId }, { $set: { ownerId: null } })
  if (mediaIds?.length) {
    await Media.updateMany({ _id: { $in: mediaIds } }, { $set: { ownerType, ownerId } })
  }
  return Media.find({ ownerType, ownerId })
}

export default { upload, uploadMany, destroy, destroyOwned, describe, list, replaceFor }
