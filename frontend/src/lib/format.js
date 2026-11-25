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

/** Milliseconds -> "02 : 14 : 37" for the flash-sale countdown. */
export function formatCountdown(ms) {
  const total = Math.max(0, Math.floor(ms / 1000))
  const hours = String(Math.floor(total / 3600)).padStart(2, '0')
  const minutes = String(Math.floor((total % 3600) / 60)).padStart(2, '0')
  const seconds = String(total % 60).padStart(2, '0')
  return { hours, minutes, seconds, total }
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

/** Free shipping threshold used across cart + checkout summaries. */
export const FREE_SHIPPING_THRESHOLD = 999
export const STANDARD_SHIPPING_FEE = 15
export const GIFT_WRAP_FEE = 149
/** Loyalty: 1 point per order above ₹799; 10 points unlock Free 5ml Attar reward. */
export const LOYALTY_ORDER_THRESHOLD = 799
export const LOYALTY_POINTS_PER_ORDER = 1
export const LOYALTY_REWARD_POINTS_COST = 10
export const LOYALTY_POINTS_PER_RUPEE = 0
