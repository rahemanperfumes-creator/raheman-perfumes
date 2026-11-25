import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import config from '../config/env.js'
import { cloudinary, isConfigured } from '../config/cloudinary.js'

/**
 * Where uploaded bytes actually go.
 *
 * The media design splits the file from the facts about it — bytes in storage,
 * alt text and ownership in MongoDB — and this module is the first half of that
 * split. Until now there was only one answer to "where", Cloudinary, which meant
 * a shop with no Cloudinary account could not attach a photograph to anything:
 * every upload route answered 503 before a byte was read.
 *
 * Two drivers, chosen automatically:
 *
 *   • **cloudinary** — when real credentials are present. The production answer:
 *     a CDN, on-the-fly transforms, and bytes that survive a redeploy.
 *   • **local** — the fallback. Bytes land under `UPLOADS_DIR` (default
 *     `backend/uploads`) and are served back from `/api/uploads`, so the whole
 *     upload flow works on a laptop with nothing external configured.
 *
 * `STORAGE_DRIVER` can force either one; `auto` is the default and means
 * "Cloudinary if it is configured, local otherwise".
 *
 * **What the caller sees is identical either way.** Both drivers answer a
 * `{publicId, secureUrl, format, resourceType, bytes, width, height}` shape, which
 * is exactly what `services/media.js` writes into the `media` row. Nothing
 * downstream knows or cares which one ran — which is the property that makes
 * swapping to Cloudinary later a `.env` change rather than a code change.
 */

/** The URL prefix the local driver's files are served from. See `app.js`. */
export const LOCAL_URL_PREFIX = '/api/uploads'

/**
 * Which driver is active.
 *
 * An explicit `STORAGE_DRIVER=cloudinary` is honoured even without credentials,
 * so a misconfigured production box fails loudly at upload time instead of
 * silently writing to a disk that a container will throw away.
 */
export function activeDriver() {
  const requested = config.storageDriver
  if (requested === 'cloudinary' || requested === 'local') return requested
  return isConfigured() ? 'cloudinary' : 'local'
}

/**
 * Can an upload be served right now?
 *
 * Always true for local — it needs nothing but a writable directory — and true
 * for Cloudinary only with real credentials. This is what the upload routes
 * consult before doing any work, so the failure is one clear sentence rather
 * than an SDK authentication error surfacing from deep inside a stream.
 */
export function isAvailable() {
  return activeDriver() === 'local' ? true : isConfigured()
}

/** Why uploads are unavailable, for the 503's own text. */
export function unavailableReason() {
  return 'STORAGE_DRIVER is set to cloudinary but CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET are not set.'
}

/** A filesystem-safe folder, with any traversal attempt flattened away. */
function safeFolder(folder) {
  return String(folder ?? '')
    .split(/[\\/]+/)
    .filter((segment) => segment && segment !== '.' && segment !== '..')
    .map((segment) => segment.replace(/[^A-Za-z0-9._-]/g, '-'))
    .join('/')
}

/**
 * The extension to write, preferring the original name and falling back to the
 * MIME type.
 *
 * The client's filename is not proof of anything — a `.png` can hold a JPEG —
 * but it is what a person will look for on disk, and the reported `format` comes
 * from this same value so the row and the file always agree.
 */
const EXTENSION_BY_MIME = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'application/pdf': 'pdf',
}

function extensionFor(file) {
  const fromName = /\.([A-Za-z0-9]{1,5})$/.exec(file.originalname ?? '')?.[1]
  if (fromName) return fromName.toLowerCase()
  return EXTENSION_BY_MIME[file.mimetype] ?? 'bin'
}

/** Absolute path for a public id, refusing anything that escapes the root. */
function resolveWithinRoot(publicId) {
  const root = path.resolve(config.uploadsDir)
  const target = path.resolve(root, String(publicId ?? ''))
  const relative = path.relative(root, target)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Refusing to touch ${publicId} — outside the uploads directory.`)
  }
  return target
}

/* ─────────────────────────────────────────────────────────── local driver ──── */

async function putLocal(file, { folder }) {
  const extension = extensionFor(file)
  const name = `${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}.${extension}`
  // `publicId` carries the extension here, unlike Cloudinary's. It is an opaque
  // handle whose only job is to let `remove()` find the bytes again, and on a
  // filesystem the extension is part of the path.
  const publicId = [safeFolder(folder), name].filter(Boolean).join('/')

  const absolute = resolveWithinRoot(publicId)
  await fs.mkdir(path.dirname(absolute), { recursive: true })
  await fs.writeFile(absolute, file.buffer)

  return {
    publicId,
    secureUrl: `${LOCAL_URL_PREFIX}/${publicId.split('/').map(encodeURIComponent).join('/')}`,
    format: extension,
    resourceType: file.mimetype?.startsWith('image/') ? 'image' : 'raw',
    bytes: file.buffer.length,
    // No image parser on this path, so dimensions stay unknown. `publicMedia`
    // and every consumer already tolerate a null width and height.
    width: null,
    height: null,
  }
}

async function removeLocal(publicId) {
  await fs.rm(resolveWithinRoot(publicId), { force: true })
}

/* ────────────────────────────────────────────────────── cloudinary driver ──── */

async function putCloudinary(file, { folder, resourceType }) {
  const result = await new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder,
        resource_type: resourceType,
        // A stable, readable public id, so an asset can be found by name in the
        // Cloudinary console as well as by its row here. Cloudinary appends a
        // suffix if it collides.
        use_filename: true,
        unique_filename: true,
        overwrite: false,
      },
      (error, response) => (error ? reject(error) : resolve(response)),
    )
    stream.end(file.buffer)
  })

  return {
    publicId: result.public_id,
    secureUrl: result.secure_url,
    format: result.format ?? '',
    resourceType: result.resource_type === 'raw' ? 'raw' : 'image',
    bytes: result.bytes ?? file.buffer.length,
    width: result.width ?? null,
    height: result.height ?? null,
  }
}

/* ────────────────────────────────────────────────────────────── the API ──── */

/**
 * Store one file and report what was stored.
 *
 * The caller passes the folder and the resource type in; the driver decides how
 * to honour them. Anything the driver cannot determine — Cloudinary's transforms
 * aside, a local file's pixel dimensions — comes back `null` rather than
 * invented.
 *
 * @param {{buffer: Buffer, originalname: string, mimetype: string}} file
 * @param {{folder: string, resourceType: 'image'|'raw'}} options
 */
export async function put(file, { folder, resourceType }) {
  if (activeDriver() === 'cloudinary') return putCloudinary(file, { folder, resourceType })
  return putLocal(file, { folder })
}

/**
 * Delete the bytes behind a media row.
 *
 * A row that cannot be found again is a leak rather than an error, so the local
 * driver removes with `force` and the caller treats a failure here as worth
 * logging but not worth refusing the row's deletion over. See `media.destroy`.
 */
export async function remove(row) {
  if (activeDriver() === 'cloudinary') {
    await cloudinary.uploader.destroy(row.publicId, {
      resource_type: row.resourceType === 'raw' ? 'raw' : 'image',
      invalidate: true,
    })
    return
  }
  await removeLocal(row.publicId)
}

export default { put, remove, activeDriver, isAvailable, unavailableReason, LOCAL_URL_PREFIX }
