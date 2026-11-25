/**
 * Formatting and the shared pricing constants.
 *
 * `slugify` is copied **character for character** from
 * `frontend/src/lib/format.js`, and the pricing constants are the same values.
 * A slug or a threshold that differs between the client and the API is a bug
 * that only surfaces as a broken link or an order total that disagrees with the
 * cart, so these are mirrored rather than re-derived.
 *
 * Note the product slug rule: the storefront slugs the **name alone**
 * (`slugify('Sauvage Dior')` → `sauvage-dior`), while `admin/src/data/products.js`
 * slugs `name + brand` (`sauvage-dior-dior-parfums`). The storefront's form wins,
 * because those are the URLs already published.
 */

/** Turn "Ocean Noir Eau de Parfum" into "ocean-noir-eau-de-parfum". */
export function slugify(text) {
  return String(text)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

/** Clamp a number into a range. */
export const clamp = (value, min, max) => Math.min(Math.max(value, min), max)

/**
 * Indian Rupee formatter — the store sells in ₹. Mirrored from the storefront's
 * `formatPrice`, because `frontend/src/data/offers.js` imports it and the seed
 * loads that module directly.
 */
export function formatPrice(value, { compact = false } = {}) {
  const amount = Number(value) || 0
  if (compact && amount >= 100000) {
    return `₹${(amount / 100000).toFixed(amount % 100000 === 0 ? 0 : 1)}L`
  }
  if (compact && amount >= 1000) {
    return `₹${(amount / 1000).toFixed(amount % 1000 === 0 ? 0 : 1)}k`
  }
  return `₹${amount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`
}

/**
 * Round to whole rupees.
 *
 * The shop quotes whole rupees everywhere and never charges paise, so a coupon
 * that works out to 199.5 is 200 rather than something the total has to carry.
 * Rounding happens in one named place so the browser's total and the server's
 * total cannot disagree by a paisa and fail a comparison.
 */
export const rupees = (value) => Math.round(Number(value) || 0)

/**
 * Pricing constants, mirroring `frontend/src/lib/format.js` exactly.
 *
 * The two apps disagreed about the free-shipping threshold — the storefront's
 * cart used ₹999 while `admin/src/data/orders.js` used ₹2,999 — and ₹999 is the
 * one that is both implemented in the cart and published to shoppers in
 * `OFFER_TERMS.dispatch`. These are the environment defaults; the `settings`
 * collection is the authority once seeded, so the admin can change a fee without
 * a deploy.
 */
export const FREE_SHIPPING_THRESHOLD = 999
export const STANDARD_SHIPPING_FEE = 15
export const GIFT_WRAP_FEE = 149

/** Loyalty: 1 point per order above ₹799; 10 points unlock Free 5ml Attar reward. */
export const LOYALTY_ORDER_THRESHOLD = 799
export const LOYALTY_POINTS_PER_ORDER = 1
export const LOYALTY_REWARD_POINTS_COST = 10
export const LOYALTY_POINTS_PER_RUPEE = 0

/**
 * Dates, in the shop's own timezone.
 *
 * The store is India-only and the fixtures are written in IST
 * (`'2026-09-20T14:32:00+05:30'`), so a date field has to be formatted in IST
 * rather than sliced out of a UTC ISO string. `new Date('2026-09-20T14:32:00+05:30')
 * .toISOString().slice(0,10)` is `'2026-09-20'`, but an order placed at 02:00 IST
 * would report the *previous* day — an off-by-one that only shows up on early
 * morning orders and is miserable to track down.
 *
 * IST is UTC+05:30 with no daylight saving, ever, so a fixed offset is exact and
 * far cheaper than an `Intl` round-trip on every row of a list.
 */
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000

const asDate = (value) => (value instanceof Date ? value : new Date(value))

/** `2026-09-20` — the `date` field on an order. */
export function isoDay(value) {
  // `new Date(null)` is the epoch, not an invalid date — without this guard a
  // patron who has never ordered reports their last order as 01 Jan 1970.
  if (value === null || value === undefined || value === '') return null
  const date = asDate(value)
  if (Number.isNaN(date.getTime())) return null
  return new Date(date.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10)
}

/** `Sunday, Sep 20, 2026 at 14:32 IST` — the tracking page's headline. */
export function istLabel(value) {
  const date = asDate(value)
  if (Number.isNaN(date.getTime())) return ''
  const shifted = new Date(date.getTime() + IST_OFFSET_MS)
  const weekday = shifted.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' })
  const month = shifted.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })
  const day = shifted.getUTCDate()
  const year = shifted.getUTCFullYear()
  const hours = String(shifted.getUTCHours()).padStart(2, '0')
  const minutes = String(shifted.getUTCMinutes()).padStart(2, '0')
  return `${weekday}, ${month} ${day}, ${year} at ${hours}:${minutes} IST`
}

/** `Sep 21, 2026 • 17:40 IST` — a timeline entry's timestamp. */
export function istStamp(value) {
  const date = asDate(value)
  if (Number.isNaN(date.getTime())) return ''
  const shifted = new Date(date.getTime() + IST_OFFSET_MS)
  const month = shifted.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })
  const hours = String(shifted.getUTCHours()).padStart(2, '0')
  const minutes = String(shifted.getUTCMinutes()).padStart(2, '0')
  return `${month} ${shifted.getUTCDate()}, ${shifted.getUTCFullYear()} • ${hours}:${minutes} IST`
}
