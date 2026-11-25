import mongoose from 'mongoose'
import { Product, Setting } from '../models/index.js'
import { onlineStockOf } from '../models/Product.js'
import config from '../config/env.js'
import { GIFT_WRAP_FEE } from '../lib/format.js'
import { badRequest } from '../middleware/error.js'

/**
 * The settings the rest of the API reads.
 *
 * The point of this file is the **default chain**: `.env` supplies the starting
 * values, the `settings` collection overrides them once the seed has run, and
 * every reader goes through `getPricing()` so there is one answer to "what does
 * delivery cost". Changing the fee is then an admin write rather than a
 * redeploy, which is what the collection is for.
 *
 * Note what is not here: anything derived. The delivery fee is a decision, so it
 * is stored; whether a given basket qualifies for free delivery is arithmetic,
 * so it is not.
 */

export const SETTING_KEYS = {
  pricing: 'pricing',
  store: 'store',
  content: 'content',
  showcase: 'showcase',
  loyalty: 'loyalty',
  email: 'email',
}

/** Default repeat customer benefit tiers & email rules. */
export const DEFAULT_LOYALTY = {
  autoSendEmail: true,
  validityDays: 30,
  minOrderAmount: 0,
  tiers: [
    { id: 'repeat-2', label: 'Repeat Buyer (2nd+ Visit)', minVisits: 2, discountPercent: 5 },
    { id: 'regular-3', label: 'Regular Buyer (3rd+ Visit)', minVisits: 3, discountPercent: 10 },
    { id: 'vip-5', label: 'VIP Regular (5th+ Visit)', minVisits: 5, discountPercent: 15 },
  ],
}

export const DEFAULT_EMAIL = {
  host: process.env.SMTP_HOST?.trim() || '',
  port: Number(process.env.SMTP_PORT) || 587,
  user: process.env.SMTP_USER?.trim() || '',
  pass: process.env.SMTP_PASS?.trim() || '',
  fromName: process.env.SMTP_FROM_NAME?.trim() || 'Rehman Perfume',
  fromEmail: process.env.SMTP_FROM_EMAIL?.trim() || process.env.SMTP_USER?.trim() || '',
}

/** Default access controls and curated product showcase lists. */
export const DEFAULT_SHOWCASE = {
  codEnabled: true,
  showBestsellers: true,
  showHomeDeals: true,
  showOffersProducts: true,
  showCouponsSection: true,
  showMultiBottleOffers: false,
  showCombos: true,
  showCelebrities: true,
  showCarPerfumes: true,
  offerProductIds: [],
  bestsellerProductIds: [],
  homeDealProductIds: [],
  comboProductIds: [],
  celebrityProductIds: [],
  carPerfumeProductIds: [],
}

function normalizeIdList(values) {
  if (!Array.isArray(values)) return []
  const seen = new Set()
  const out = []
  for (const item of values) {
    const id = String(item ?? '').trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

/** What pricing falls back to before anything has been written. */
export const DEFAULT_PRICING = {
  shippingFee: config.pricing.shippingFee,
  freeShippingOver: config.pricing.freeShippingOver,
  giftWrapFee: GIFT_WRAP_FEE,
  gstRate: 18,
  comboDiscountPercent: 0,
  currency: 'INR',
}

/**
 * Default store identity when none has been configured in admin settings.
 * Address and city stay blank until explicitly set by the store owner.
 */
export const DEFAULT_STORE = {
  name: 'Rehman Perfume House',
  legalName: 'Rehman Perfume House',
  tagline: 'Original perfumes, pure attars & hand-blended scents',
  email: 'rahemanperfumes@gmail.com',
  phone: '+91 75044 68885',
  address: '',
  city: '',
  currency: 'INR',
  instagram: '@rehmanperfume',
  hours: 'Monday to Saturday, 10:00–19:00 IST',
}

/**
 * The rule `priceOrder()` prices with.
 *
 * Deliberately narrow — four numbers — because this is the object that gets
 * snapshotted onto every order. A wider object would put store copy into the
 * order history and make the snapshot heavier than the thing it records.
 */
export async function getPricing() {
  const stored = await Setting.get(SETTING_KEYS.pricing, null)
  return { ...DEFAULT_PRICING, ...(stored ?? {}) }
}

export async function getStore() {
  const stored = await Setting.get(SETTING_KEYS.store, null)
  return { ...DEFAULT_STORE, ...(stored ?? {}) }
}

export async function getContent() {
  return (await Setting.get(SETTING_KEYS.content, null)) ?? {}
}

export async function getShowcase() {
  const stored = (await Setting.get(SETTING_KEYS.showcase, null)) ?? {}
  return {
    codEnabled: typeof stored.codEnabled === 'boolean' ? stored.codEnabled : DEFAULT_SHOWCASE.codEnabled,
    showBestsellers: typeof stored.showBestsellers === 'boolean' ? stored.showBestsellers : DEFAULT_SHOWCASE.showBestsellers,
    showHomeDeals: typeof stored.showHomeDeals === 'boolean' ? stored.showHomeDeals : DEFAULT_SHOWCASE.showHomeDeals,
    showOffersProducts:
      typeof stored.showOffersProducts === 'boolean' ? stored.showOffersProducts : DEFAULT_SHOWCASE.showOffersProducts,
    showCouponsSection:
      typeof stored.showCouponsSection === 'boolean' ? stored.showCouponsSection : DEFAULT_SHOWCASE.showCouponsSection,
    showMultiBottleOffers:
      typeof stored.showMultiBottleOffers === 'boolean'
        ? stored.showMultiBottleOffers
        : DEFAULT_SHOWCASE.showMultiBottleOffers,
    showCombos: typeof stored.showCombos === 'boolean' ? stored.showCombos : DEFAULT_SHOWCASE.showCombos,
    showCelebrities:
      typeof stored.showCelebrities === 'boolean' ? stored.showCelebrities : DEFAULT_SHOWCASE.showCelebrities,
    showCarPerfumes:
      typeof stored.showCarPerfumes === 'boolean' ? stored.showCarPerfumes : DEFAULT_SHOWCASE.showCarPerfumes,
    offerProductIds: normalizeIdList(stored.offerProductIds),
    bestsellerProductIds: normalizeIdList(stored.bestsellerProductIds),
    homeDealProductIds: normalizeIdList(stored.homeDealProductIds),
    comboProductIds: normalizeIdList(stored.comboProductIds),
    celebrityProductIds: normalizeIdList(stored.celebrityProductIds),
    carPerfumeProductIds: normalizeIdList(stored.carPerfumeProductIds),
  }
}

/**
 * Storefront-facing showcase rules: removes inactive or out-of-stock items
 * from Offers Page (`offerProductIds`) and Home Deals (`homeDealProductIds`)
 * without erasing the owner's saved list (so restocked items automatically return).
 */
export async function getPublicShowcase() {
  const showcase = await getShowcase()
  const offerAndDealIds = [...new Set([...showcase.offerProductIds, ...showcase.homeDealProductIds])].filter((id) =>
    mongoose.isValidObjectId(id),
  )

  const bestsellerDocs = await Product.find(
    { status: 'Active', $or: [{ bestseller: true }, { badges: 'Bestseller' }] },
    '_id',
  ).lean()
  const autoBestsellerIds = bestsellerDocs.map((doc) => String(doc._id))
  const mergedBestsellerIds = [
    ...showcase.bestsellerProductIds,
    ...autoBestsellerIds.filter((id) => !showcase.bestsellerProductIds.includes(id)),
  ]

  if (offerAndDealIds.length === 0) {
    return {
      ...showcase,
      bestsellerProductIds: mergedBestsellerIds,
      comboProductIds: showcase.comboProductIds,
      celebrityProductIds: showcase.celebrityProductIds,
      carPerfumeProductIds: showcase.carPerfumeProductIds,
    }
  }

  const docs = await Product.find(
    { _id: { $in: offerAndDealIds }, status: 'Active' },
    'stock shopReserve status',
  ).lean()

  const inStockSet = new Set(docs.filter((doc) => onlineStockOf(doc) > 0).map((doc) => String(doc._id)))

  return {
    ...showcase,
    bestsellerProductIds: mergedBestsellerIds,
    comboProductIds: showcase.comboProductIds,
    celebrityProductIds: showcase.celebrityProductIds,
    carPerfumeProductIds: showcase.carPerfumeProductIds,
    offerProductIds: showcase.offerProductIds.filter((id) => inStockSet.has(id)),
    homeDealProductIds: showcase.homeDealProductIds.filter((id) => inStockSet.has(id)),
  }
}

function normalizeTiers(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return DEFAULT_LOYALTY.tiers
  return raw
    .map((tier, idx) => ({
      id: String(tier?.id || `tier-${idx + 1}`).trim(),
      label: String(tier?.label || `Tier ${idx + 1}`).trim(),
      minVisits: Math.max(2, Math.min(100, Math.round(Number(tier?.minVisits) || 2))),
      discountPercent: Math.max(1, Math.min(80, Math.round(Number(tier?.discountPercent) || 5))),
    }))
    .sort((a, b) => a.minVisits - b.minVisits)
}

export async function getLoyaltyRules() {
  const stored = (await Setting.get(SETTING_KEYS.loyalty, null)) ?? {}
  return {
    autoSendEmail: typeof stored.autoSendEmail === 'boolean' ? stored.autoSendEmail : DEFAULT_LOYALTY.autoSendEmail,
    validityDays: Math.max(1, Math.min(365, Number(stored.validityDays) || DEFAULT_LOYALTY.validityDays)),
    minOrderAmount: Math.max(0, Number(stored.minOrderAmount ?? DEFAULT_LOYALTY.minOrderAmount) || 0),
    tiers: normalizeTiers(stored.tiers),
  }
}

export async function updateLoyaltyRules(patch = {}) {
  const current = await getLoyaltyRules()
  const next = {
    autoSendEmail: typeof patch.autoSendEmail === 'boolean' ? patch.autoSendEmail : current.autoSendEmail,
    validityDays:
      patch.validityDays !== undefined
        ? Math.max(1, Math.min(365, Math.round(Number(patch.validityDays) || 30)))
        : current.validityDays,
    minOrderAmount:
      patch.minOrderAmount !== undefined
        ? Math.max(0, Math.round(Number(patch.minOrderAmount) || 0))
        : current.minOrderAmount,
    tiers: patch.tiers !== undefined ? normalizeTiers(patch.tiers) : current.tiers,
  }
  await Setting.put(SETTING_KEYS.loyalty, next, 'Repeat customer loyalty tiers & email benefit rules')
  return next
}

export async function getEmailSettings() {
  const stored = (await Setting.get(SETTING_KEYS.email, null)) ?? {}
  return {
    host: String(stored.host ?? DEFAULT_EMAIL.host).trim(),
    port: Number(stored.port ?? DEFAULT_EMAIL.port) || 587,
    user: String(stored.user ?? DEFAULT_EMAIL.user).trim(),
    pass: String(stored.pass ?? DEFAULT_EMAIL.pass),
    fromName: String(stored.fromName ?? DEFAULT_EMAIL.fromName).trim() || 'Rehman Perfume',
    fromEmail: String(stored.fromEmail ?? DEFAULT_EMAIL.fromEmail).trim(),
  }
}

export async function publicEmailSettings() {
  const cfg = await getEmailSettings()
  const smtpConfigured = Boolean(cfg.host && cfg.user && cfg.pass)
  const brevoSender =
    config.brevo.senderEmail && config.brevo.senderEmail !== 'your-verified-sender@example.com'
      ? config.brevo.senderEmail
      : ''
  return {
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    fromName: cfg.fromName,
    fromEmail: cfg.fromEmail,
    hasPassword: Boolean(cfg.pass),
    smtpConfigured,
    brevoConfigured: config.brevoConfigured,
    brevoSenderEmail: brevoSender,
    provider: config.brevoConfigured ? 'brevo' : smtpConfigured ? 'smtp' : 'none',
    configured: Boolean(config.brevoConfigured || smtpConfigured),
  }
}

export async function updateEmailSettings(patch = {}) {
  const current = await getEmailSettings()
  const next = {
    host: typeof patch.host === 'string' ? patch.host.trim() : current.host,
    port: patch.port !== undefined ? Math.max(1, Math.min(65535, Number(patch.port) || 587)) : current.port,
    user: typeof patch.user === 'string' ? patch.user.trim() : current.user,
    // Keep existing password if blank or masked so saving host/from does not wipe it.
    pass:
      typeof patch.pass === 'string' && patch.pass.trim() && patch.pass !== '••••••••'
        ? patch.pass.trim()
        : patch.clearPassword
          ? ''
          : current.pass,
    fromName: typeof patch.fromName === 'string' ? patch.fromName.trim() : current.fromName,
    fromEmail: typeof patch.fromEmail === 'string' ? patch.fromEmail.trim() : current.fromEmail,
  }
  await Setting.put(SETTING_KEYS.email, next, 'Outbound SMTP email configuration')
  return publicEmailSettings()
}

/**
 * Update the pricing rule.
 *
 * Validated as numbers at or above zero rather than trusted, because these feed
 * straight into arithmetic on someone's money — a fee of `"79"` would silently
 * concatenate against a subtotal in a string-concatenating bug, and a negative
 * fee would credit the customer. `zod` checks the shape at the route; this
 * checks that the values are usable.
 */
export async function updatePricing(patch = {}) {
  const current = await getPricing()
  const next = { ...current }

  for (const key of ['shippingFee', 'freeShippingOver', 'giftWrapFee', 'gstRate', 'comboDiscountPercent']) {
    if (patch[key] === undefined) continue
    const value = Number(patch[key])
    if (!Number.isFinite(value) || value < 0) {
      throw badRequest(`${key} must be a number at or above zero.`)
    }
    if (key === 'comboDiscountPercent' && value > 80) {
      throw badRequest('comboDiscountPercent cannot exceed 80%.')
    }
    next[key] = value
  }
  if (typeof patch.currency === 'string' && patch.currency.trim()) {
    next.currency = patch.currency.trim().toUpperCase()
  }

  await Setting.put(SETTING_KEYS.pricing, next, 'Delivery, gift wrap and tax')
  return next
}

/** Update the store identity block. Unknown keys are ignored. */
export async function updateStore(patch = {}) {
  const current = await getStore()
  const next = { ...current }
  for (const key of Object.keys(DEFAULT_STORE)) {
    if (typeof patch[key] === 'string') next[key] = patch[key]
  }
  await Setting.put(SETTING_KEYS.store, next, 'Store identity and contact')
  return next
}

/** Replace the editorial content block wholesale — it is free-form copy. */
export async function updateContent(value) {
  if (!value || typeof value !== 'object') throw badRequest('Content must be an object.')
  await Setting.put(SETTING_KEYS.content, value, 'Editorial blocks')
  return value
}

/** Update website access toggles (like COD) and manually curated showcase product lists. */
export async function updateShowcase(patch = {}) {
  if (!patch || typeof patch !== 'object') throw badRequest('Showcase settings must be an object.')
  const current = await getShowcase()
  const next = { ...current }

  for (const key of [
    'codEnabled',
    'showBestsellers',
    'showHomeDeals',
    'showOffersProducts',
    'showCouponsSection',
    'showMultiBottleOffers',
    'showCombos',
    'showCelebrities',
    'showCarPerfumes',
  ]) {
    if (typeof patch[key] === 'boolean') next[key] = patch[key]
  }

  for (const key of ['offerProductIds', 'bestsellerProductIds', 'homeDealProductIds', 'comboProductIds', 'celebrityProductIds', 'carPerfumeProductIds']) {
    if (Array.isArray(patch[key])) next[key] = normalizeIdList(patch[key])
  }

  await Setting.put(SETTING_KEYS.showcase, next, 'Website display, COD & showcase products')
  return next
}

/** Everything the admin's Settings & Display screens show, in one read. */
export async function allSettings() {
  const [pricing, store, content, showcase, loyalty, email] = await Promise.all([
    getPricing(),
    getStore(),
    getContent(),
    getShowcase(),
    getLoyaltyRules(),
    publicEmailSettings(),
  ])
  return { pricing, store, content, showcase, loyalty, email }
}

export default {
  getPricing,
  getStore,
  getContent,
  getShowcase,
  getPublicShowcase,
  getLoyaltyRules,
  getEmailSettings,
  publicEmailSettings,
  updatePricing,
  updateStore,
  updateContent,
  updateShowcase,
  updateLoyaltyRules,
  updateEmailSettings,
  allSettings,
}
