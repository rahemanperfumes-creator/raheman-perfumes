import { formatPrice } from '@/lib/format'

/**
 * Offers page copy.
 *
 * Coupons come from the backend (`GET /api/coupons`), and offered products come
 * from Admin -> Website Display (`GET /api/showcase`).
 */

/** Hero banner copy for the offers page. */
export const OFFER_HERO = {
  eyebrow: 'Special Offer',
  title: 'Exclusive Offers on Selected Fragrances',
  subtitle: 'Artisan fragrances compounded with pure French oils at exclusive pricing.',
  spotlight: 'Special Discount Collection',
  spotlightNote: 'Popular amber & oud perfume blends',
  badge: 'Limited Time Offers',
  cta: { label: 'Shop Deals', to: '/offers#vault' },
}

/** Offer category tabs on the offers page. */
export const OFFER_TABS = [
  { id: 'all', label: 'All Offers' },
  { id: 'originals', label: 'Originals' },
  { id: 'inspired', label: 'Inspired' },
  { id: 'mixing', label: 'Mixing Blends' },
  { id: 'attars', label: 'Pure Attars' },
  { id: 'combos', label: 'Combo Sets' },
  { id: 'bakhoor', label: 'Bakhoor' },
  { id: 'car-perfumes', label: 'Car Perfumes' },
]

/** Volume-based savings offers. */
export const VOLUME_TIERS = [
  {
    id: 'tier-1',
    eyebrow: 'Offer 1',
    title: 'Save up to 10% Extra',
    description: 'Up to 10% extra savings at checkout when you buy 2 bottles.',
    threshold: 2,
  },
  {
    id: 'tier-2',
    eyebrow: 'Offer 2 • Popular',
    title: 'Save up to 15% Extra',
    description: 'Up to 15% extra savings plus a free travel pouch on 3 bottles.',
    recommended: true,
    threshold: 3,
  },
  {
    id: 'tier-3',
    eyebrow: 'Offer 3 • Best Value',
    title: 'Save up to 20% Extra',
    description: 'Up to 20% extra savings, 10ml travel spray, and free fast shipping on 4+ bottles.',
    threshold: 4,
  },
]

/** Display headline for any coupon — always phrased cleanly with "Up to" (no flat discounts). */
export function formatCouponTitle(coupon) {
  if (!coupon) return ''
  const custom = String(coupon.label ?? '').trim()
  if (custom) return /up\s*to/i.test(custom) ? custom : `Up to ${custom}`
  return `Save up to ${coupon.value}%`
}

/** Concise cap badge for cart & offers cards, e.g. "Up to 15% off · max ₹500". */
export function formatCouponBadge(coupon) {
  if (!coupon) return ''
  const pct = `Up to ${coupon.value}% off`
  return coupon.cap ? `${pct} · max ${formatPrice(coupon.cap)}` : pct
}

/** Terms accordion on the offers page. */
export const OFFER_TERMS = [
  {
    id: 'applicability',
    title: 'Offer Stock & Availability',
    body: 'Offer prices apply to the listed items while stock lasts. Once promotional stock sells out, the item goes back to its normal price. If something sells out after you order, we will contact you before sending anything else.',
  },
  {
    id: 'stacking',
    title: 'Using Coupons & Minimum Order Rules',
    body: 'You can use one coupon per order. Coupons cannot be combined with each other or with extra multi-bottle discounts unless mentioned on the coupon. Minimum order amount is checked on product total (delivery and gift wrap excluded).',
  },
  {
    id: 'dispatch',
    title: 'Delivery Times & Safe Packing',
    body: 'Standard delivery and complimentary shipping options are calculated live at checkout based on current order thresholds (typically 4–6 working days). Fast air delivery is available at checkout. Every order comes with a tamper-proof seal.',
  },
]

/** Helper for the offers page — is this (server) coupon usable with the given cart? */
export function couponApplies(coupon, subtotal) {
  return Boolean(coupon) && subtotal >= (coupon.minOrder ?? 0)
}

/** Human-readable saving for a live product on a deal rail. */
export function dealSaving(deal) {
  return formatPrice(Math.max(0, (deal.mrp ?? 0) - (deal.price ?? 0)))
}
