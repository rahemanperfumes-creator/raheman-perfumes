/**
 * Shared customer identity normalization helpers.
 *
 * Used by both counter billing (`services/pos.js`) and repeat customer
 * analytics (`services/repeatAnalysis.js`) so a phone number typed as
 * "+91 98201-12345" and "9820112345" or "Ramesh@Gmail.com" always resolve
 * to the exact same buyer.
 */

export const WALK_IN_EMAIL = 'walk-in@counter.rehmanperfume.in'
export const SYNTHETIC_PHONE_DOMAIN = '@phone.counter.rehmanperfume.in'

export function isSyntheticEmail(email) {
  const clean = String(email ?? '').trim().toLowerCase()
  if (!clean) return true
  return clean === WALK_IN_EMAIL || clean.endsWith(SYNTHETIC_PHONE_DOMAIN) || clean.endsWith('@counter.rehmanperfume.in')
}

export function normalizeEmail(email) {
  const clean = String(email ?? '').trim().toLowerCase()
  if (!clean || !clean.includes('@') || isSyntheticEmail(clean)) return ''
  return clean
}

export function normalizePhone(phone) {
  const digits = String(phone ?? '').replace(/\D/g, '')
  if (digits.length < 7) return ''
  // Normalize Indian 10-digit mobile numbers across 0 / +91 / 91 prefixes.
  return digits.length >= 10 ? digits.slice(-10) : digits
}

export function cleanDisplayName(name) {
  return String(name ?? '').trim().replace(/\s+/g, ' ')
}

export function normalizeName(name) {
  const clean = cleanDisplayName(name).toLowerCase()
  if (!clean || clean === 'walk-in customer' || clean.length < 2) return ''
  return clean
}

export function syntheticPhoneEmail(phoneKey) {
  return `phone-${phoneKey}${SYNTHETIC_PHONE_DOMAIN}`
}

export function realEmailOf(value) {
  if (!value) return ''
  return normalizeEmail(typeof value === 'string' ? value : value.email)
}

