import { Router } from 'express'
import { z } from 'zod'
import validate from '../middleware/validate.js'
import { asyncHandler } from '../middleware/asyncHandler.js'
import { optionalAuth } from '../middleware/auth.js'
import { cacheResponse } from '../lib/cache.js'
import * as products from '../services/products.js'
import * as taxonomy from '../services/taxonomy.js'
import * as coupons from '../services/coupons.js'
import * as orders from '../services/orders.js'
import * as settings from '../services/settings.js'
import config from '../config/env.js'
import { isConfigured } from '../config/cloudinary.js'
import { sendLoggedEmail, buildContactMessageEmail } from '../services/mailer.js'

/**
 * The public API — everything the storefront reads, and nothing it should not.
 *
 * The paths and shapes here are not invented: both `frontend/src/services/
 * productService.js` and `frontend/src/lib/api.js` already call them, so this
 * router is what makes the storefront stop falling back to its bundled
 * catalogue. Two details are load-bearing:
 *
 *   • **`/products/search` is declared before `/products/:slug`.** Express
 *     matches in registration order, so the reverse would capture `search` as a
 *     slug and every search would 404.
 *   • **`/products/:slug` answers `null`, not 404, for an unknown slug.** The
 *     client's `withFallback` treats any non-2xx as "the backend is down" and
 *     silently serves its fixtures — so a 404 for a genuinely missing fragrance
 *     would make the page show a *different*, bundled fragrance instead of
 *     nothing. `null` is the honest answer and is what the client's own
 *     `getProduct()` returns.
 */

const router = Router()

/** Liveness. The admin's `backendReachable()` probes this. */
router.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'rehman-perfume-api',
    env: config.nodeEnv,
    cloudinary: isConfigured() ? 'configured' : 'not-configured',
    uptime: Math.round(process.uptime()),
  })
})

/* ─────────────────────────────────────────────────────────── catalogue ──── */

/**
 * A query-string boolean.
 *
 * `z.coerce.boolean()` is deliberately **not** used: it is JavaScript truthiness,
 * so the string `"false"` coerces to `true` and `?inStock=false` would filter for
 * in-stock items only. These spellings are the ones a URL actually carries.
 */
const queryBool = z
  .enum(['true', 'false', '1', '0', ''])
  .transform((value) => value === 'true' || value === '1')
  .optional()

const listQuery = z
  .object({
    collection: z.string().trim().optional(),
    tier: z.string().trim().optional(),
    gender: z.string().trim().optional(),
    family: z.string().trim().optional(),
    concentration: z.string().trim().optional(),
    brand: z.string().trim().optional(),
    category: z.string().trim().optional(),
    sort: z.string().trim().optional(),
    limit: z.coerce.number().int().positive().max(200).optional(),
    maxPrice: z.coerce.number().nonnegative().optional(),
    minPrice: z.coerce.number().nonnegative().optional(),
    inStock: queryBool,
    featured: queryBool,
    bestseller: queryBool,
  })
  .strip()

router.get(
  '/products',
  cacheResponse({ ttl: 60, tags: ['catalogue', 'products'] }),
  validate('query', listQuery),
  asyncHandler(async (req, res) => {
    res.json(await products.list(req.validatedQuery))
  }),
)

/**
 * Search. Declared **before** `/products/:slug` — see the note at the top.
 * Returns a bare array, as `searchCatalogue()` does.
 */
router.get(
  '/products/search',
  cacheResponse({ ttl: 60, tags: ['catalogue', 'products'] }),
  validate('query', z.object({ q: z.string().trim().default(''), limit: z.coerce.number().int().positive().max(50).optional() }).strip()),
  asyncHandler(async (req, res) => {
    res.json(await products.search(req.validatedQuery.q, { limit: req.validatedQuery.limit ?? 20 }))
  }),
)

/** Draft products surfaced in the homepage "Coming Soon" shelf. Declared before `/products/:slug`. */
router.get(
  '/products/coming-soon',
  cacheResponse({ ttl: 60, tags: ['catalogue', 'products'] }),
  validate('query', z.object({ limit: z.coerce.number().int().positive().max(100).optional() }).strip()),
  asyncHandler(async (req, res) => {
    res.json(await products.comingSoon(req.validatedQuery.limit ?? 50))
  }),
)

/** A whole product page in one round trip: `{product, reviews}`. */
router.get(
  '/products/:slug/bundle',
  cacheResponse({ ttl: 60, tags: ['catalogue', 'products'] }),
  asyncHandler(async (req, res) => {
    res.json(await products.bundle(req.params.slug))
  }),
)

/** Products sharing a collection, for the shelf rails. */
router.get(
  '/products/:slug/related',
  cacheResponse({ ttl: 60, tags: ['catalogue', 'products'] }),
  asyncHandler(async (req, res) => {
    const limit = Math.min(Math.max(1, Math.floor(Number(req.query.limit) || 4)), 24)
    res.json(await products.related(req.params.slug, { limit }))
  }),
)

/** One product by slug — `null` when there is no such fragrance. */
router.get(
  '/products/:slug',
  cacheResponse({ ttl: 60, tags: ['catalogue', 'products'] }),
  asyncHandler(async (req, res) => {
    res.json(await products.bySlug(req.params.slug))
  }),
)

router.get(
  '/categories',
  cacheResponse({ ttl: 300, tags: ['catalogue', 'taxonomy'] }),
  asyncHandler(async (_req, res) => {
    res.json(await taxonomy.publicCategories())
  }),
)

router.get(
  '/brands',
  cacheResponse({ ttl: 300, tags: ['catalogue', 'taxonomy'] }),
  asyncHandler(async (_req, res) => {
    res.json(await taxonomy.publicBrands())
  }),
)

/** Active shipping, tax rules, and COD availability. */
router.get(
  '/pricing',
  asyncHandler(async (_req, res) => {
    const [pricing, showcase] = await Promise.all([settings.getPricing(), settings.getShowcase()])
    res.json({ ...pricing, codEnabled: showcase.codEnabled })
  }),
)

/** Public display flags and admin-picked product lists for Homepage & Offers page. */
router.get(
  '/showcase',
  asyncHandler(async (_req, res) => {
    res.json(await settings.getPublicShowcase())
  }),
)

/* ───────────────────────────────────────────────────────────── coupons ──── */

/** The codes the offers page advertises. */
router.get(
  '/coupons',
  asyncHandler(async (_req, res) => {
    res.json(await coupons.publicList())
  }),
)

/**
 * Check a code against a basket.
 *
 * Returns `{ok, message}` or `{ok, coupon, discount}` — the exact shape the
 * cart's local `couponService.validate()` already returns, so this is a drop-in
 * rather than something the client would have to be taught.
 */
router.post(
  '/coupons/validate',
  validate('body', z.object({ code: z.string().trim().default(''), subtotal: z.coerce.number().nonnegative().default(0) }).strip()),
  asyncHandler(async (req, res) => {
    res.json(await coupons.validate(req.body.code, req.body.subtotal))
  }),
)

/* ──────────────────────────────────────────────────────────── tracking ──── */

/**
 * The public tracking page.
 *
 * `null` rather than a 404 for an unknown number: the tracking page's own
 * fixture lookup returns undefined for a miss, and an error status would make
 * the client fall back and render a *fictional* parcel for a mistyped number.
 */
router.get(
  '/orders/track/:number',
  optionalAuth,
  asyncHandler(async (req, res) => {
    res.json(
      await orders.tracking(req.params.number, {
        user: req.auth?.user,
        customer: req.auth?.customer,
        phone: req.query.phone,
      }),
    )
  }),
)

/**
 * Submit customer contact message.
 * Relays the customer's message directly to the store administrator via Brevo.
 */
router.post(
  '/contact',
  validate(
    'body',
    z.object({
      name: z.string().trim().min(1, 'Name is required'),
      email: z.string().trim().email('Valid email is required'),
      phone: z.string().trim().optional().default(''),
      order: z.string().trim().optional().default(''),
      topic: z.string().trim().default('General enquiry'),
      message: z.string().trim().min(5, 'Message must be at least 5 characters'),
    }),
  ),
  asyncHandler(async (req, res) => {
    const { name, email, phone, order, topic, message } = req.body
    const emailData = await buildContactMessageEmail({ name, email, phone, order, topic, message })

    const adminEmail = config.brevo.adminNotificationEmail || config.brevo.senderEmail || 'rahemanperfumes@gmail.com'

    const result = await sendLoggedEmail({
      to: adminEmail,
      recipientName: 'Rehman Perfume Admin',
      replyTo: email,
      replyToName: name,
      kind: 'contact-message',
      subject: emailData.subject,
      html: emailData.html,
      text: emailData.text,
      sentBy: `Contact Form (${name})`,
    })

    res.json({
      ok: true,
      delivered: result.status === 'sent',
      message: 'Your message has been received! Our support team will get back to you shortly.',
    })
  }),
)

export default router
