import multer from 'multer'
import { isAvailable as storageAvailable, unavailableReason } from '../lib/storage.js'
import { HttpError, unavailable } from './error.js'

/**
 * File intake for the Cloudinary pipeline.
 *
 * **Memory storage, deliberately.** The bytes are handed straight to
 * `uploader.upload_stream` and never touch the disk, so there is no temp
 * directory to clean up, no half-written file to leak if a request dies, and
 * nothing to purge on a container that has no writable volume.
 *
 * What is accepted, and why: PNG and JPEG because they are what a phone camera
 * and a screenshot produce, WebP and AVIF because they are what a modern export
 * produces, and PDF because certificates and invoices are the one non-image the
 * admin needs to attach. Everything else is refused with a **415** before a byte
 * is buffered — rejecting on `mimetype` is a cheap first gate, though the
 * extension is not proof of content, which is why the media rows record what
 * Cloudinary reports back rather than what the client claimed.
 */

const MAX_FILE_BYTES = 5 * 1024 * 1024
const MAX_FILES = 8

export const ALLOWED_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/avif',
  'application/pdf',
])

/** `image` for anything Cloudinary can transform, `raw` otherwise (PDFs). */
export const resourceTypeFor = (mimetype) => (mimetype.startsWith('image/') ? 'image' : 'raw')

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: MAX_FILES },
  fileFilter(_req, file, cb) {
    if (ALLOWED_MIME.has(file.mimetype)) return cb(null, true)
    return cb(
      new HttpError(415, `“${file.mimetype}” is not an accepted file type. Allowed: PNG, JPEG, WebP, AVIF and PDF.`),
    )
  },
})

/** One file, field name `file`. */
export const uploadSingle = upload.single('file')

/** Up to eight files, field name `files`. */
export const uploadMany = upload.array('files', MAX_FILES)

/**
 * Refuse an upload before multer runs when no storage driver can take it.
 *
 * This used to be a Cloudinary check, and with the placeholder credentials in
 * `.env` it refused **every** upload — which is why a fragrance created in the
 * admin could never be given a photograph. Storage now falls back to the local
 * disk (see `lib/storage.js`), so this passes on any normal machine and only
 * trips when `STORAGE_DRIVER=cloudinary` is asked for without the credentials to
 * back it. Answering 503 with that sentence beats buffering a file and failing
 * inside the SDK.
 */
export function requireUploads(_req, _res, next) {
  if (!storageAvailable()) {
    return next(unavailable(unavailableReason(), { code: 'STORAGE_NOT_CONFIGURED' }))
  }
  return next()
}

/**
 * Translate multer's own failures into the API's error shape.
 *
 * Multer rejects with a bare `MulterError` code, which would otherwise surface
 * as an unhelpful 500 — "File too large" is a 413 and a shopkeeper uploading a
 * 12 MB photograph deserves to be told the limit.
 */
export function uploadErrors(error, req, res, next) {
  if (!(error instanceof multer.MulterError)) return next(error)
  if (error.code === 'LIMIT_FILE_SIZE') {
    return next(new HttpError(413, `That file is larger than the ${MAX_FILE_BYTES / 1024 / 1024} MB limit.`))
  }
  if (error.code === 'LIMIT_FILE_COUNT' || error.code === 'LIMIT_UNEXPECTED_FILE') {
    return next(new HttpError(413, `At most ${MAX_FILES} files can be uploaded at once.`))
  }
  return next(new HttpError(400, error.message))
}

export const UPLOAD_LIMITS = { maxFileBytes: MAX_FILE_BYTES, maxFiles: MAX_FILES }
export default { uploadSingle, uploadMany, requireUploads, uploadErrors }
