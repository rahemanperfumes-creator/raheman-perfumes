import { Coupon } from '../models/index.js'
import { couponDiscount } from '../lib/pricing.js'
import { conflict, notFound } from '../middleware/error.js'
import { adminCoupon, publicCoupon } from '../lib/views.js'

/**
 * Coupons.
 *
 * The storefront's `frontend/src/data/offers.js` stores each discount as a
 * **function** — `pct(10, 999, 500)`, `flat(200, 1499)` — which cannot go in a
 * database. It becomes data here (`type`, `value`, `minOrder`, `cap`) with
 * `couponDiscount()` in `src/lib/pricing.js` as the one implementation of what
 * those fields mean, so the rule the shop publishes and the rule the server
 * charges by are the same code.
 *
 * `validate()` returns the shape the cart already expects from its local
 * `couponService.validate()` — `{ok, message}` or `{ok, coupon}` — so this is a
 * drop-in the moment the cart is rewired, rather than something the client would
 * have to be taught.
 */

/** The codes the offers page advertises — live, public ones only. */
export async function publicList() {
  const coupons = await Coupon.find({ active: true, personalOnly: { $ne: true } }).sort({ minOrder: 1 })
  return coupons.filter((coupon) => coupon.isLive()).map(publicCoupon)
}

/**
 * Check a code against a basket.
 *
 * `subtotal` is the **raw** subtotal, before any discount — the same figure the
 * cart's minimum-order test uses. Returns the discount amount as well as the
 * coupon, so a cart can show "−₹200" without re-running the arithmetic and
 * risking a different answer.
 */
export async function validate(code, subtotal) {
  const normalised = String(code ?? '').trim().toUpperCase()
  if (!normalised) return { ok: false, message: 'Enter a code to apply.' }

  const coupon = await Coupon.findOne({ code: normalised })
  if (!coupon) return { ok: false, message: `“${normalised}” is not a recognised code.` }
  if (!coupon.isLive()) return { ok: false, message: `“${normalised}” is not currently active.` }

  const base = Number(subtotal) || 0
  if (base < (coupon.minOrder ?? 0)) {
    return { ok: false, message: `This code needs a minimum order of ₹${coupon.minOrder}.` }
  }

  const discount = couponDiscount(coupon, base)
  if (discount === 0) return { ok: false, message: `“${normalised}” does not reduce this order.` }

  return { ok: true, coupon: publicCoupon(coupon), discount }
}

/* ──────────────────────────────────────────────────────────── admin ──── */

export async function adminList() {
  const coupons = await Coupon.find().sort({ active: -1, createdAt: -1 })
  return coupons.map(adminCoupon)
}

/**
 * Create a coupon.
 *
 * The `type`/`value` pair is checked here rather than in a schema, because the
 * two are only meaningful together: a percentage above 100 would discount more
 * than the order is worth, and a `flat` value with a `cap` is a contradiction
 * the admin form should not have allowed. `couponDiscount()` clamps anyway — this
 * refuses the row so the problem is visible rather than silently absorbed.
 */
export async function create(input) {
  const code = String(input.code ?? '').trim().toUpperCase()
  if (!code) throw conflict('A coupon needs a code.')
  if (await Coupon.findOne({ code })) throw conflict(`“${code}” already exists.`)

  if (input.value <= 0 || input.value > 100) {
    throw conflict('A percentage discount must be above 0 and no more than 100.')
  }

  return Coupon.create({ ...input, type: 'percent', code })
}

/** Update a coupon. The code itself is immutable — shoppers have it written down. */
export async function update(id, input) {
  const coupon = await Coupon.findById(id)
  if (!coupon) throw notFound('That coupon does not exist.')

  for (const field of ['label', 'headline', 'description', 'terms', 'value', 'minOrder', 'cap', 'scope', 'active', 'startsAt', 'endsAt', 'usageLimit']) {
    if (input[field] !== undefined) coupon[field] = input[field]
  }
  coupon.type = 'percent'

  if (coupon.value <= 0 || coupon.value > 100) {
    throw conflict('A percentage discount must be above 0 and no more than 100.')
  }

  await coupon.save()
  return coupon
}

export async function remove(id) {
  const coupon = await Coupon.findById(id)
  if (!coupon) throw notFound('That coupon does not exist.')
  await coupon.deleteOne()
  return coupon
}

/** Turn a code on or off without deleting it. */
export async function setActive(id, active) {
  const coupon = await Coupon.findById(id)
  if (!coupon) throw notFound('That coupon does not exist.')
  coupon.active = Boolean(active)
  await coupon.save()
  return coupon
}

/**
 * Issue a personal single-use loyalty / repeat-customer coupon in the DB so it
 * can actually be redeemed at checkout or verified at the shop counter.
 */
export async function issuePersonalReward({ discountPercent, minOrder = 0, validityDays = 30, email = '', label = 'Repeat Customer Benefit', headline = '', description = '' }) {
  const pct = Math.max(1, Math.min(80, Math.round(Number(discountPercent) || 0)))
  const days = Math.max(1, Math.min(365, Math.round(Number(validityDays) || 30)))
  const cleanEmail = String(email ?? '').trim().toLowerCase()
  const prefix = (cleanEmail.split('@')[0] || 'VIP').replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, 4) || 'VIP'

  let code = ''
  for (let i = 0; i < 6; i += 1) {
    const suffix = Math.random().toString(36).slice(2, 6).toUpperCase()
    const candidate = `RPT-${prefix}${pct}-${suffix}`
    if (!(await Coupon.findOne({ code: candidate }).lean())) {
      code = candidate
      break
    }
  }
  if (!code) code = `RPT-${Date.now().toString(36).toUpperCase().slice(-6)}`

  const now = new Date()
  const endsAt = new Date(now.getTime() + days * 24 * 60 * 60 * 1000)

  return Coupon.create({
    code,
    label,
    headline: headline || `${pct}% Repeat Customer Benefit`,
    description: description || `Exclusive ${pct}% discount sent to ${cleanEmail || 'repeat customer'}.`,
    terms: `Valid once for ${pct}% off on orders of ₹${Number(minOrder) || 0} or more, for ${days} days.`,
    type: 'percent',
    value: pct,
    minOrder: Math.max(0, Number(minOrder) || 0),
    cap: null,
    active: true,
    personalOnly: true,
    issuedToEmail: cleanEmail,
    startsAt: now,
    endsAt,
    usageLimit: 1,
    scope: { tiers: [], excludeTiers: [], categories: [] },
  })
}

export default { publicList, validate, adminList, create, update, remove, setActive, issuePersonalReward }
