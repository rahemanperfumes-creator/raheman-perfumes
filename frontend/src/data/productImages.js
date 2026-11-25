/**
 * Product photography.
 *
 * The catalogue records predate the studio shots, so every fragrance is mapped
 * onto the flacon images we do have rather than each product carrying its own
 * file. The mapping is derived from the slug, so a product always renders the
 * same bottle across the grid, the cart and the detail page, and any record can
 * be pinned to a specific file later by giving it its own `image`.
 *
 * A shot is `{ src, fit }`. The fit travels with the asset rather than with the
 * slot that renders it, because our two kinds of image need opposite treatment:
 * the flacon plates are square and transparent, so `cover` fills the 4:5 stage
 * by cropping empty margin, while an opaque or landscape asset has to be
 * `contain`ed or the stage slices through its edges.
 */

import { API_ORIGIN } from '@/lib/api'

/** Turn local backend uploads into absolute reachable URLs when running on deployed hosting. */
export function resolveImageUrl(url) {
  if (!url || typeof url !== 'string') return ''
  if (url.startsWith('/api/uploads/')) {
    return API_ORIGIN ? `${API_ORIGIN}${url}` : url
  }
  return url
}

/** The available studio shots. */
export const PRODUCT_IMAGES = {
  placeholder: { src: '/rehman-placeholder-bottle.png', fit: 'contain' },
  amber: { src: '/rehman-amber-bottle-transparent.png', fit: 'cover' },
  noir: { src: '/rehman-bottle-transparent.png', fit: 'cover' },
}

/** Official Rehman Perfume placeholder bottle when admin has not uploaded photography. */
export const PLACEHOLDER_PRODUCT_IMAGE = {
  src: '/rehman-placeholder-bottle.png',
  fit: 'contain',
}

/** Every shot, in gallery order. */
export const PRODUCT_IMAGE_POOL = [PRODUCT_IMAGES.amber, PRODUCT_IMAGES.noir]

/** Accepts a bare path or a full shot, so records can stay terse. */
export function asShot(value) {
  if (!value) return null
  if (typeof value === 'object' && value.src) {
    const src = resolveImageUrl(value.src)
    const isPlaceholder = typeof src === 'string' && src.includes('rehman-placeholder-bottle.png')
    return {
      ...value,
      src,
      fit: value.fit ?? (isPlaceholder ? 'contain' : 'cover'),
    }
  }
  if (typeof value === 'string') {
    const src = resolveImageUrl(value)
    const isPlaceholder = src.includes('rehman-placeholder-bottle.png')
    return {
      src,
      fit: isPlaceholder ? 'contain' : 'cover',
    }
  }
  return value
}

/** Stable hash so a seed always lands on the same shot. */
function hashSeed(seed) {
  let hash = 0
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) % 997
  return hash
}

/**
 * The photographs a record actually carries.
 *
 * Two shapes arrive here and they must not be confused. The bundled fixtures
 * carry no photography at all — hence the pool below — while the API emits
 * `images: [{id, url, alt, caption, …}]`, a list of media rows. Only the `url`
 * is a shot; handing the whole media object to the renderer would give it an
 * object with no `src`.
 */
function galleryOf(record) {
  return (record?.images ?? [])
    .map((entry) => asShot(typeof entry === 'string' ? entry : entry?.url))
    .filter(Boolean)
}

/**
 * A record's photographs as bare URLs — the shape worth storing.
 *
 * `galleryOf` turns them into renderable shots; this keeps only the addresses,
 * for the stores that persist a cart or wishlist line and must not carry media
 * ids, alt text and dimensions along with the picture.
 */
export function imageUrls(record) {
  const gallery = galleryOf(record)
  if (gallery.length > 0) return gallery.map((shot) => shot.src)
  return ['/rehman-placeholder-bottle.png']
}

/**
 * The photo for a catalogue fragrance.
 *
 * If the admin has not added an image to any listed perfume, this returns the
 * official Rehman Perfume bottle placeholder (`/rehman-placeholder-bottle.png`).
 */
export function productImage(record) {
  if (!record) return PLACEHOLDER_PRODUCT_IMAGE

  const override = asShot(record.image)
  if (override) return override

  // A photograph uploaded in the admin wins over everything below it — this is
  // the line that decides whether the shop shows the bottle a shopkeeper
  // actually photographed or the official placeholder.
  const [uploaded] = galleryOf(record)
  if (uploaded) return uploaded

  // If the admin has not added an image to this listed perfume, return the official placeholder!
  return PLACEHOLDER_PRODUCT_IMAGE
}

/**
 * The shot a card reveals on hover, or `null` when no second/hover photograph
 * has been set by the admin.
 */
export function productHoverImage(record) {
  const gallery = galleryOf(record)
  if (gallery.length > 1) return gallery[1]

  return asShot(record?.hoverImage) ?? null
}

/**
 * All shots uploaded for a product, in the exact order uploaded in Admin.
 * Falls back to a single `record.image` override if present, or `[PLACEHOLDER_PRODUCT_IMAGE]`
 * when no custom photography was uploaded.
 */
export function productGallery(record) {
  if (!record) return [PLACEHOLDER_PRODUCT_IMAGE]
  const uploaded = galleryOf(record)
  if (uploaded.length > 0) return uploaded
  const override = asShot(record.image)
  if (override) return [override]
  return [PLACEHOLDER_PRODUCT_IMAGE]
}

/**
 * The nth shot of a product's gallery, or `null` when fewer than `index + 1`
 * photographs exist (never duplicates earlier images across empty slots).
 */
export function productImageView(record, index = 0) {
  const gallery = productGallery(record)
  if (gallery.length > 0) return gallery[index] ?? null
  return index === 0 ? productImage(record) : null
}
