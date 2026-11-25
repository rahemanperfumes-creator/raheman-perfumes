/**
 * Formatters.
 *
 * The money and date helpers are shared with the storefront
 * (`frontend/src/lib/format.js`) so a rupee reads the same in both apps. The
 * storefront's cart-specific constants are deliberately not carried over — the
 * admin has no cart — and the two admin-only helpers are appended at the end.
 */

/** Indian Rupee formatter — the store sells in ₹. */
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

/** Percentage saved between an MRP and a selling price. */
export function discountPercent(mrp, price) {
  if (!mrp || mrp <= price) return 0
  return Math.round(((mrp - price) / mrp) * 100)
}

/** 3499 -> "3,499" */
export function formatNumber(value) {
  return (Number(value) || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })
}

/** ISO date -> "12 Sep 2026" */
export function formatDate(value, opts = { day: '2-digit', month: 'short', year: 'numeric' }) {
  if (!value) return '—'
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('en-IN', opts)
}

/** ISO date -> "12 Sep, 4:30 PM" */
export function formatDateTime(value) {
  if (!value) return '—'
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return `${date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}, ${date.toLocaleTimeString(
    'en-IN',
    { hour: 'numeric', minute: '2-digit', hour12: true },
  )}`
}

/** "3 days ago" / "in 2 hours" — relative time for activity feeds. */
export function formatRelative(value, now = Date.now()) {
  if (!value) return '—'
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  const diff = date.getTime() - now
  const units = [
    ['year', 31536000000],
    ['month', 2592000000],
    ['day', 86400000],
    ['hour', 3600000],
    ['minute', 60000],
  ]
  const formatter = new Intl.RelativeTimeFormat('en-IN', { numeric: 'auto' })
  for (const [unit, ms] of units) {
    if (Math.abs(diff) >= ms) return formatter.format(Math.round(diff / ms), unit)
  }
  return 'just now'
}

/** Turn "Ocean Noir Eau de Parfum" into "ocean-noir-eau-de-parfum". */
export function slugify(text) {
  return String(text)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

/** Initials for the avatar chip — "Rehman Khan" -> "RK". */
export function initials(name = '') {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('')
}

/** 4.5 -> "4.5", 4 -> "4.0" */
export function formatRating(value) {
  return (Number(value) || 0).toFixed(1)
}

/** Clamp a number into a range. */
export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

/* --- Admin-only ---------------------------------------------------------- */

/**
 * Compact rupee for stat tiles and axes: 124500 -> "₹1.24L", 45000 -> "₹45k",
 * 12500000 -> "₹1.25Cr". Uses the lakh/crore scale rather than k/M because that
 * is how the figure is read out loud here.
 */
export function formatCompactINR(value) {
  const amount = Number(value) || 0
  const abs = Math.abs(amount)
  const sign = amount < 0 ? '-' : ''
  const trim = (n) => Number(n.toFixed(n < 10 ? 2 : 1))
  if (abs >= 1e7) return `${sign}₹${trim(abs / 1e7)}Cr`
  if (abs >= 1e5) return `${sign}₹${trim(abs / 1e5)}L`
  if (abs >= 1e3) return `${sign}₹${trim(abs / 1e3)}k`
  return `${sign}₹${Math.round(abs)}`
}

/** Signed percentage for a delta chip: 18.4 -> "+18.4%", -6 -> "-6%". */
export function formatDelta(value) {
  const amount = Number(value) || 0
  const rounded = Number(amount.toFixed(1))
  return `${rounded > 0 ? '+' : ''}${rounded}%`
}

/** Gross margin as a percentage of the selling price. */
export function marginPercent(cost, price) {
  if (!price || price <= 0) return 0
  return Math.round(((price - (Number(cost) || 0)) / price) * 100)
}
