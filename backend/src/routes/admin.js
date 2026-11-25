import { Router } from 'express'
import { z } from 'zod'
import validate from '../middleware/validate.js'
import { asyncHandler } from '../middleware/asyncHandler.js'
import { requireOwner, requireStaff } from '../middleware/auth.js'
import { forbidden } from '../middleware/error.js'
import { requireUploads, uploadSingle, uploadMany as uploadManyFiles, uploadErrors, ALLOWED_MIME, UPLOAD_LIMITS } from '../middleware/upload.js'
import { isConfigured as cloudinaryConfigured } from '../config/cloudinary.js'
import { activeDriver as storageDriver } from '../lib/storage.js'
import { cache } from '../lib/cache.js'
import * as products from '../services/products.js'
import * as orders from '../services/orders.js'
import * as customers from '../services/customers.js'
import * as taxonomy from '../services/taxonomy.js'
import * as inventory from '../services/inventory.js'
import * as reviews from '../services/reviews.js'
import * as coupons from '../services/coupons.js'
import * as analytics from '../services/analytics.js'
import * as settings from '../services/settings.js'
import * as media from '../services/media.js'
import * as auth from '../services/auth.js'
import * as pos from '../services/pos.js'
import * as repeatAnalysis from '../services/repeatAnalysis.js'
import { sendLoggedEmail, verifyBrevoAccount } from '../services/mailer.js'
import { recent as activityFeed } from '../services/activity.js'
import { adminBrand, adminOrder, publicActivity, publicLedgerRow, publicMedia, sessionUser } from '../lib/views.js'
import { EmailLog, ORDER_STATUSES, PAYMENT_STATUSES, PRODUCT_STATUSES, SHOP_PAYMENT_METHODS, STOCK_REASONS } from '../models/index.js'

/**
 * The staff API.
 *
 * Two things shape this file.
 *
 * **Envelopes.** The admin's `asList(payload, key)` reads a named key rather than
 * a bare array, so `/admin/products` answers `{products: [...]}` and not `[…]`.
 * A bare array would parse as `undefined` and the panel would show an empty
 * table while the request succeeded — the worst kind of failure to debug.
 *
 * **One guard, not one per route.** `requireStaff` covers everything; writes
 * that are the owner's alone — settings, and the staff list itself — add
 * `requireOwner` on top. A shopper who finds these routes gets a **403**, not a
 * 404: they are signed in and simply not allowed, and hiding the route would
 * make a legitimate permission problem look like a broken link.
 */

const router = Router()
router.use(requireStaff)

/**
 * Strip script/HTML tags from a string to prevent XSS payloads being stored raw.
 * Only matches tags (`<script>...</script>`, `<tag ...>`) so benign math
 * comparisons like `< 50ml` are preserved intact.
 */
const stripHtml = (s) =>
  s.replace(/<script\b[^>]*>[\s\S]*?<\/script>|<\s*\/?\s*[a-zA-Z][^>]*>/gi, '').trim()

/** Zod string helper: trim → strip HTML → then apply further refinements. */
const safeStr = z.string().trim().transform(stripHtml)

/** Pagination and search shared by the list endpoints. */
const listQuery = z
  .object({
    q: z.string().trim().optional(),
    status: z.string().trim().optional(),
    tier: z.string().trim().optional(),
    brand: z.string().trim().optional(),
    customer: z.string().trim().optional(),
    channel: z.string().trim().optional(),
    product: z.string().trim().optional(),
    sort: z.string().trim().optional(),
    from: z.string().trim().optional(),
    to: z.string().trim().optional(),
    limit: z.coerce.number().int().positive().max(1000).optional(),
  })
  .strip()

/* ─────────────────────────────────────────────────────────── products ──── */

router.get(
  '/products',
  validate('query', listQuery),
  asyncHandler(async (req, res) => {
    const list = await products.adminList(req.validatedQuery)
    const hideCost = req.auth.user?.role !== 'owner'
    res.json({ products: hideCost ? list.map((p) => ({ ...p, cost: 0 })) : list })
  }),
)

router.get(
  '/products/:id',
  asyncHandler(async (req, res) => {
    const item = await products.adminOne(req.params.id)
    const product = req.auth.user?.role !== 'owner' ? { ...item, cost: 0 } : item
    res.json({ product })
  }),
)

/**
 * The product write shape.
 *
 * Note what is absent: `slug`. It is derived from the name on create and left
 * alone afterwards, because the storefront's slugs are the shop's published
 * URLs and a rename must not silently break them. An explicit `slug` is accepted
 * on create only.
 */
const productBody = z
  .object({
    name: safeStr.pipe(z.string().min(1, 'A fragrance needs a name.').max(120)),
    slug: safeStr.pipe(z.string().max(140)).optional(),
    sku: z.string().trim().max(40).optional(),
    /**
     * Deliberately absent, and `.strict()` would be the wrong fix here — `.strip()`
     * already drops it, so a body carrying `barcode` is accepted and the field is
     * ignored rather than the write failing. That is the intended reading: the
     * barcode is derived from the SKU by the model, never supplied by a caller, so
     * a panel that echoes a product record straight back does not have to strip
     * the field first. A SKU override on create or update re-derives it.
     */
    brand: z.string().trim().regex(/^[a-f0-9]{24}$/i, 'A brand reference is required.').optional(),
    category: z.string().trim().regex(/^[a-f0-9]{24}$/i, 'A category reference is required.').optional(),
    tier: z.enum(['Original', 'Inspired', 'Mixed', 'Attar', 'Combo', 'Bakhoor', 'Car Perfume']).optional(),
    gender: z.enum(['Men', 'Women', 'Unisex']).optional(),
    family: safeStr.pipe(z.string().max(60)).optional(),
    concentration: safeStr.pipe(z.string().max(60)).optional(),
    tagline: safeStr.pipe(z.string().max(180)).optional(),
    description: safeStr.pipe(z.string().max(4000)).optional(),
    notes: z
      .object({
        top: z.array(z.string()).max(30).optional(),
        heart: z.array(z.string()).max(30).optional(),
        base: z.array(z.string()).max(30).optional(),
      })
      .optional(),
    volumes: z
      .array(
        z.object({
          size: z.string().trim().min(1).max(20),
          price: z.coerce.number().nonnegative(),
          mrp: z.coerce.number().nonnegative().optional(),
          label: z.string().trim().max(40).optional().default(''),
        }),
      )
      .min(1, 'A fragrance needs at least one volume to be sellable.')
      .optional(),
    listPrice: z.coerce.number().nonnegative().optional(),
    listMrp: z.coerce.number().nonnegative().optional(),
    cost: z.coerce.number().nonnegative().optional(),
    stock: z.coerce.number().int().nonnegative().optional(),
    safeLimit: z.coerce.number().int().nonnegative().optional(),
    status: z.enum(PRODUCT_STATUSES).optional(),
    badges: z.array(z.string().max(30)).max(10).optional(),
    longevity: z.string().trim().max(40).optional(),
    projection: z.string().trim().max(40).optional(),
    bestseller: z.boolean().optional(),
    featured: z.boolean().optional(),
    collections: z.array(z.string().max(40)).max(20).optional(),
    occasions: z.array(z.string().max(40)).max(10).optional(),
    images: z.array(z.string()).max(12).optional(),
    batch: z.string().trim().max(40).optional(),
    origin: z.string().trim().max(60).optional(),
    salesYtd: z.coerce.number().int().nonnegative().optional(),
  })
  .strip()

router.post(
  '/products',
  requireOwner,
  validate('body', productBody),
  asyncHandler(async (req, res) => {
    const product = await products.create({ ...req.body, actorLabel: req.auth.user.name })
    cache.invalidateTags(['catalogue', 'products'])
    res.status(201).json({ product: await products.adminOne(product._id) })
  }),
)

router.patch(
  '/products/:id',
  requireOwner,
  validate('body', productBody.partial()),
  asyncHandler(async (req, res) => {
    await products.update(req.params.id, req.body)
    cache.invalidateTags(['catalogue', 'products'])
    res.json({ product: await products.adminOne(req.params.id) })
  }),
)

/** A status change on its own — the catalog table's inline toggle. */
router.patch(
  '/products/:id/status',
  requireOwner,
  validate('body', z.object({ status: z.enum(PRODUCT_STATUSES) }).strip()),
  asyncHandler(async (req, res) => {
    await products.setStatus(req.params.id, req.body.status)
    cache.invalidateTags(['catalogue', 'products'])
    res.json({ product: await products.adminOne(req.params.id) })
  }),
)

/**
 * Remove a fragrance.
 *
 * Archives by default. `?hard=true` deletes, and only when no order line
 * references it — an order from last year has to keep resolving to the name and
 * SKU it was placed against.
 */
router.delete(
  '/products/:id',
  requireOwner,
  asyncHandler(async (req, res) => {
    const hard = req.query.hard === 'true'
    await products.remove(req.params.id, { hard })
    cache.invalidateTags(['catalogue', 'products'])
    res.json({ ok: true, hard })
  }),
)

/* ───────────────────────────────────────────────────────────── orders ──── */

router.get(
  '/orders',
  validate('query', listQuery),
  asyncHandler(async (req, res) => {
    res.json({ orders: await orders.adminList(req.validatedQuery) })
  }),
)

router.get(
  '/orders/:id',
  asyncHandler(async (req, res) => {
    res.json({ order: await orders.adminOne(req.params.id) })
  }),
)

/**
 * Move an order along.
 *
 * The service refuses anything that is not a forward step on `ORDER_FLOW` and
 * answers 409, naming what *is* allowed from here. Cancelling also returns the
 * stock the order took, in the same transaction as the status write.
 */
router.patch(
  '/orders/:id/status',
  validate(
    'body',
    z
      .object({
        status: z.enum(ORDER_STATUSES),
        note: z.string().trim().max(400).optional(),
        courier: z.string().trim().max(80).optional(),
        awb: z.string().trim().max(80).optional(),
        carrier: z.string().trim().max(80).optional(),
        referenceNumber: z.string().trim().max(80).optional(),
        trackingNumber: z.string().trim().max(80).optional(),
        expectedDelivery: z.coerce.date().optional(),
        transitNote: z.string().trim().max(120).optional(),
      })
      .strip(),
  ),
  asyncHandler(async (req, res) => {
    if (req.auth.user?.role !== 'owner' && ['Cancelled', 'Pending'].includes(req.body.status)) {
      throw forbidden('Only the Shop Owner can cancel or reopen orders.')
    }
    const courier = req.body.courier || req.body.carrier || ''
    const awb = req.body.awb || req.body.referenceNumber || req.body.trackingNumber || ''
    const tracking =
      courier || awb || req.body.expectedDelivery || req.body.transitNote
        ? {
            courier,
            awb,
            expectedDelivery: req.body.expectedDelivery,
            transitNote: req.body.transitNote,
          }
        : null

    await orders.setStatus(req.params.id, req.body.status, {
      actor: req.auth.user,
      note: req.body.note,
      tracking,
    })
    res.json({ order: await orders.adminOne(req.params.id) })
  }),
)

router.patch(
  '/orders/:id/payment',
  requireOwner,
  validate(
    'body',
    z.object({ status: z.enum(PAYMENT_STATUSES).optional(), method: z.string().trim().max(40).optional(), txnRef: z.string().trim().max(60).optional() }).strip(),
  ),
  asyncHandler(async (req, res) => {
    await orders.setPayment(req.params.id, req.body)
    res.json({ order: await orders.adminOne(req.params.id) })
  }),
)

router.patch(
  '/orders/:id/tracking',
  validate(
    'body',
    z
      .object({
        courier: z.string().trim().max(60).optional(),
        awb: z.string().trim().max(60).optional(),
        expectedDelivery: z.coerce.date().optional(),
        transitNote: z.string().trim().max(120).optional(),
        sealNote: z.string().trim().max(120).optional(),
      })
      .strip(),
  ),
  asyncHandler(async (req, res) => {
    await orders.setTracking(req.params.id, req.body)
    res.json({ order: await orders.adminOne(req.params.id) })
  }),
)

/** A scan event on the parcel's custody history. */
router.post(
  '/orders/:id/events',
  validate('body', z.object({ title: z.string().trim().min(1).max(80), description: z.string().trim().max(300).optional(), at: z.coerce.date().optional() }).strip()),
  asyncHandler(async (req, res) => {
    await orders.addShipmentEvent(req.params.id, req.body)
    res.json({ order: await orders.adminOne(req.params.id) })
  }),
)

router.patch(
  '/orders/:id/notes',
  validate('body', z.object({ notes: z.string().max(2000) }).strip()),
  asyncHandler(async (req, res) => {
    await orders.setNotes(req.params.id, req.body.notes)
    res.json({ order: await orders.adminOne(req.params.id) })
  }),
)

/* ───────────────────────────────────────────────── owner refund requests ──── */

router.get(
  '/refund-requests',
  requireOwner,
  asyncHandler(async (_req, res) => {
    res.json(await orders.listRefundRequests())
  }),
)

router.post(
  '/refund-requests/:number/complete',
  requireOwner,
  validate(
    'body',
    z.object({ referenceNote: z.string().trim().min(3, 'Enter the UPI / UTR reference number or note.').max(150) }).strip(),
  ),
  asyncHandler(async (req, res) => {
    const order = await orders.processRefundRequest(req.params.number, {
      action: 'complete',
      referenceNote: req.body.referenceNote,
      actor: req.auth.user,
    })
    res.json({ order: adminOrder(order) })
  }),
)

router.post(
  '/refund-requests/:number/reject',
  requireOwner,
  validate(
    'body',
    z.object({ referenceNote: z.string().trim().min(3, 'Enter a reason for rejecting this refund.').max(200) }).strip(),
  ),
  asyncHandler(async (req, res) => {
    const order = await orders.processRefundRequest(req.params.number, {
      action: 'reject',
      referenceNote: req.body.referenceNote,
      actor: req.auth.user,
    })
    res.json({ order: adminOrder(order) })
  }),
)

/* ────────────────────────────────────────────────────────── customers ──── */

router.get(
  '/customers',
  validate('query', listQuery),
  asyncHandler(async (req, res) => {
    res.json({ customers: await customers.adminList(req.validatedQuery) })
  }),
)

router.get(
  '/customers/:id',
  asyncHandler(async (req, res) => {
    res.json({ customer: await customers.adminOne(req.params.id) })
  }),
)

router.patch(
  '/customers/:id',
  requireOwner,
  validate(
    'body',
    z
      .object({
        name: z.string().trim().min(1).max(80).optional(),
        phone: z.string().trim().max(24).optional(),
        city: z.string().trim().max(60).optional(),
        loyaltyTier: z.string().trim().max(40).optional(),
        loyaltyPoints: z.coerce.number().int().nonnegative().optional(),
        preferredAccord: z.string().trim().max(60).optional(),
      })
      .strip(),
  ),
  asyncHandler(async (req, res) => {
    await customers.update(req.params.id, req.body)
    res.json({ customer: await customers.adminOne(req.params.id) })
  }),
)

router.patch(
  '/customers/:id/notes',
  validate('body', z.object({ notes: z.string().max(2000) }).strip()),
  asyncHandler(async (req, res) => {
    await customers.setNotes(req.params.id, req.body.notes)
    res.json({ customer: await customers.adminOne(req.params.id) })
  }),
)

/**
 * Block a patron.
 *
 * Does two things: sets the status that stops them checking out, and bumps
 * `tokenVersion` so the session they are already holding stops working. Without
 * the second, "Block" would be a label that took up to a week to mean anything.
 */
router.post(
  '/customers/:id/block',
  requireOwner,
  asyncHandler(async (req, res) => {
    await customers.setStatus(req.params.id, 'Blocked', { actor: req.auth.user })
    res.json({ customer: await customers.adminOne(req.params.id) })
  }),
)

router.post(
  '/customers/:id/unblock',
  requireOwner,
  asyncHandler(async (req, res) => {
    await customers.setStatus(req.params.id, 'Active', { actor: req.auth.user })
    res.json({ customer: await customers.adminOne(req.params.id) })
  }),
)

/* ─────────────────────────────────────────────── repeat customer analysis ──── */

router.get(
  '/repeat-customers',
  asyncHandler(async (_req, res) => {
    res.json(await repeatAnalysis.analyzeCustomers())
  }),
)

const loyaltyTierSchema = z.object({
  id: z.string().trim().max(40).optional(),
  label: z.string().trim().min(1).max(60),
  minVisits: z.coerce.number().int().min(2).max(100),
  discountPercent: z.coerce.number().min(1).max(80),
})

router.patch(
  '/repeat-customers/rules',
  requireOwner,
  validate(
    'body',
    z
      .object({
        autoSendEmail: z.boolean().optional(),
        validityDays: z.coerce.number().int().min(1).max(365).optional(),
        minOrderAmount: z.coerce.number().min(0).max(500000).optional(),
        tiers: z.array(loyaltyTierSchema).min(1).max(6).optional(),
      })
      .strip(),
  ),
  asyncHandler(async (req, res) => {
    res.json({ rules: await settings.updateLoyaltyRules(req.body) })
  }),
)

const benefitSendSchema = z
  .object({
    customerId: z.string().regex(/^[a-f0-9]{24}$/i).nullable().optional(),
    name: z.string().trim().max(80).optional().default(''),
    phone: z.string().trim().max(30).optional().default(''),
    email: z.string().trim().email('Enter a valid customer email address.'),
    discountPercent: z.coerce.number().min(1).max(80),
    minOrder: z.coerce.number().min(0).max(500000).optional().default(0),
    validityDays: z.coerce.number().int().min(1).max(365).optional().default(30),
    visits: z.coerce.number().int().min(1).max(10000).optional(),
    customMessage: z.string().trim().max(500).optional().default(''),
  })
  .strip()

router.post(
  '/repeat-customers/send-benefit',
  validate('body', benefitSendSchema),
  asyncHandler(async (req, res) => {
    if (req.auth.user?.role !== 'owner' && Number(req.body.discountPercent) > 15) {
      throw forbidden('Staff can issue repeat customer benefits up to 15% only. Ask the Shop Owner for higher discounts.')
    }
    const out = await repeatAnalysis.issueAndSendBenefit({
      ...req.body,
      kind: 'manual-offer',
      sentBy: req.auth.user?.name || 'Owner',
    })
    res.json(out)
  }),
)

router.post(
  '/repeat-customers/send-bulk-benefit',
  requireOwner,
  validate(
    'body',
    z
      .object({
        recipients: z
          .array(
            z.object({
              customerId: z.string().regex(/^[a-f0-9]{24}$/i).nullable().optional(),
              name: z.string().trim().max(80).optional().default(''),
              phone: z.string().trim().max(30).optional().default(''),
              email: z.string().trim().email(),
              visits: z.coerce.number().int().min(1).optional(),
            }),
          )
          .min(1)
          .max(100),
        discountPercent: z.coerce.number().min(1).max(80),
        minOrder: z.coerce.number().min(0).max(500000).optional().default(0),
        validityDays: z.coerce.number().int().min(1).max(365).optional().default(30),
        customMessage: z.string().trim().max(500).optional().default(''),
      })
      .strip(),
  ),
  asyncHandler(async (req, res) => {
    const sentBy = req.auth.user?.name || 'Owner'
    const results = []
    for (const r of req.body.recipients) {
      try {
        const out = await repeatAnalysis.issueAndSendBenefit({
          ...r,
          discountPercent: req.body.discountPercent,
          minOrder: req.body.minOrder,
          validityDays: req.body.validityDays,
          customMessage: req.body.customMessage,
          kind: 'manual-offer',
          sentBy,
        })
        results.push({ email: r.email, ok: true, status: out.emailLog.status, couponCode: out.coupon.code })
      } catch (err) {
        results.push({ email: r.email, ok: false, error: err?.message || 'Failed' })
      }
    }
    res.json({
      total: results.length,
      succeeded: results.filter((x) => x.ok).length,
      failed: results.filter((x) => !x.ok).length,
      results,
    })
  }),
)

router.get(
  '/repeat-customers/emails/:id',
  asyncHandler(async (req, res) => {
    const log = await EmailLog.findById(req.params.id).lean()
    if (!log) return res.status(404).json({ message: 'Email log not found.' })
    res.json({ email: { ...log, id: String(log._id) } })
  }),
)

/* ────────────────────────────────────────────────────────── inventory ──── */

/**
 * Move stock.
 *
 * `delta` and `next` are two ways of saying the same thing and exactly one is
 * required: `delta` is the restock button (`+24`), `next` is a stock-take
 * correction ("there are actually 7"). The service writes the shelf and the
 * ledger row in one transaction, so the two cannot disagree.
 */
router.post(
  '/inventory/adjust',
  requireOwner,
  validate(
    'body',
    z
      .object({
        productId: z.string().regex(/^[a-f0-9]{24}$/i, 'A product reference is required.'),
        delta: z.coerce.number().int().optional(),
        next: z.coerce.number().int().nonnegative().optional(),
        reason: z.enum(STOCK_REASONS).optional(),
        reasonNote: z.string().trim().max(300).optional(),
        batch: z.string().trim().max(40).optional(),
        idempotencyKey: z.string().trim().max(120).optional(),
      })
      .strip()
      .refine((body) => body.delta !== undefined || body.next !== undefined, {
        message: 'Provide either a delta or an absolute next count.',
      }),
  ),
  asyncHandler(async (req, res) => {
    /*
     * `delta` is the route's word for it, `change` is the service's — and the
     * ledger row's. The translation has to happen somewhere, and it belongs
     * here, at the boundary: `applyAdjustment` reads `input.change`, so a body
     * carrying only `delta` used to reach it as `Number(undefined) || 0`. The
     * result was the worst kind of wrong — a 200, a shelf that had not moved,
     * and a ledger row confidently recording a movement of nothing.
     *
     * `delta` is dropped rather than passed along so the two names can never
     * disagree about the same request.
     */
    const { delta, ...rest } = req.body
    const result = await inventory.adjustStock({
      ...rest,
      ...(delta !== undefined ? { change: delta } : {}),
      actor: req.auth.user._id,
      actorLabel: req.auth.user.name,
    })
    res.json({
      product: await products.adminOne(result.product._id),
      movement: publicLedgerRow(result.row),
      duplicate: result.duplicate,
    })
  }),
)

router.get(
  '/inventory/ledger',
  validate('query', z.object({ productId: z.string().trim().optional(), limit: z.coerce.number().int().positive().max(200).optional() }).strip()),
  asyncHandler(async (req, res) => {
    const rows = await inventory.listLedger(req.validatedQuery)
    res.json({ ledger: rows.map(publicLedgerRow) })
  }),
)

router.get(
  '/inventory/summary',
  requireOwner,
  asyncHandler(async (_req, res) => {
    res.json(await analytics.inventorySummary())
  }),
)

/**
 * How many units of a fragrance the shop counter keeps back from the website.
 *
 * Not a stock movement — nothing leaves the shelf — so it writes no ledger row,
 * and it is a separate door from `/inventory/adjust` so that one never has to
 * mean two things.
 */
router.patch(
  '/inventory/reserve',
  requireOwner,
  validate(
    'body',
    z
      .object({
        productId: z.string().regex(/^[a-f0-9]{24}$/i, 'A product reference is required.'),
        shopReserve: z.coerce.number().int().nonnegative().max(100000),
      })
      .strip(),
  ),
  asyncHandler(async (req, res) => {
    const product = await inventory.setShopReserve(req.body.productId, req.body.shopReserve, { actorLabel: req.auth.user.name })
    res.json({ product: await products.adminOne(product._id) })
  }),
)

/* ─────────────────────────────────────────────────────────── shop counter ──── */

/**
 * Ring up a counter bill.
 *
 * Lines carry a product id, a size and a quantity — never a price; the server
 * prices from its own volume ladder exactly as it does for the storefront. The
 * one thing the counter may set that a shopper may not is a hand-given
 * `discount`. `clientRef` makes a retried Charge return the first bill (200,
 * `duplicate: true`) instead of selling the same bottles twice.
 *
 * The answer carries the bill and the fragrances it moved, so the panel can show
 * the new shelf counts without re-reading the whole catalogue.
 */
router.post(
  '/pos/bills',
  validate(
    'body',
    z
      .object({
        items: z
          .array(
            z
              .object({
                productId: z.string().regex(/^[a-f0-9]{24}$/i, 'Each line needs a product reference.'),
                size: z.string().trim().max(20).optional(),
                qty: z.coerce.number().int().positive().max(500),
              })
              .strip(),
          )
          .min(1, 'A bill needs at least one item.')
          .max(60),
        customerId: z.string().regex(/^[a-f0-9]{24}$/i).optional(),
        customer: z
          .object({
            name: z.string().trim().max(80).optional().default(''),
            phone: z.string().trim().max(24).optional().default(''),
            email: z.string().trim().email('Please enter a valid customer email.').or(z.literal('')).optional().default(''),
          })
          .strip()
          .optional(),
        sendBenefitEmail: z.boolean().optional(),
        payment: z.object({ method: z.enum(SHOP_PAYMENT_METHODS), txnRef: z.string().trim().max(60).optional() }).strip(),
        discount: z
          .object({ type: z.enum(['flat', 'percent']), value: z.coerce.number().nonnegative() })
          .strip()
          .refine((discount) => discount.type !== 'percent' || discount.value <= 100, {
            message: 'A percentage discount cannot be more than 100.',
          })
          .optional(),
        notes: z.string().trim().max(500).optional(),
        clientRef: z.string().trim().min(8).max(80).optional(),
      })
      .strip(),
  ),
  asyncHandler(async (req, res) => {
    const result = await pos.ringUp(req.body, { actor: req.auth.user })
    res.status(result.duplicate ? 200 : 201).json({
      order: adminOrder(result.order),
      products: result.products,
      duplicate: result.duplicate,
      loyalty: result.loyalty ?? null,
    })
  }),
)

/** Live repeat-customer lookup during counter billing as cashier types Name / Phone / Email. */
router.get(
  '/pos/customer-lookup',
  validate(
    'query',
    z
      .object({
        name: z.string().trim().max(80).optional(),
        phone: z.string().trim().max(30).optional(),
        email: z.string().trim().max(120).optional(),
        customerId: z.string().trim().max(64).optional(),
      })
      .strip(),
  ),
  asyncHandler(async (req, res) => {
    res.json(await repeatAnalysis.lookupCustomerRepeat(req.validatedQuery))
  }),
)

/**
 * Void a counter bill: stock back on the shelf, payment refunded, bill
 * cancelled. A refund is money leaving the till, so it is the owner's or a
 * manager's call rather than any staff role's.
 */
router.post(
  '/pos/bills/:id/void',
  requireOwner,
  validate('body', z.object({ reason: z.string().trim().max(200).optional() }).strip()),
  asyncHandler(async (req, res) => {
    const result = await pos.voidBill(req.params.id, { actor: req.auth.user, reason: req.body.reason })
    res.json({ order: adminOrder(result.order), products: result.products })
  }),
)

/* ─────────────────────────────────────────────────────────── taxonomy ──── */

router.get(
  '/taxonomy',
  asyncHandler(async (_req, res) => {
    res.json(await taxonomy.adminTaxonomy())
  }),
)

const categoryBody = z
  .object({
    kind: z.enum(['shelf', 'facet']).optional(),
    name: safeStr.pipe(z.string().min(1, 'A category needs a name.').max(80)),
    slug: safeStr.pipe(z.string().max(80)).optional(),
    key: z.string().trim().max(40).nullable().optional(),
    description: safeStr.pipe(z.string().max(400)).optional(),
    status: z.enum(['Active', 'Hidden', 'Archived']).optional(),
    shelf: z.coerce.number().int().optional(),
  })
  .strip()

router.post(
  '/categories',
  requireOwner,
  validate('body', categoryBody),
  asyncHandler(async (req, res) => {
    const category = await taxonomy.createCategory(req.body)
    cache.invalidateTags(['catalogue', 'taxonomy'])
    res.status(201).json({ category: { id: String(category._id), name: category.name, slug: category.slug, kind: category.kind } })
  }),
)

router.patch(
  '/categories/:id',
  requireOwner,
  validate('body', categoryBody.partial()),
  asyncHandler(async (req, res) => {
    const category = await taxonomy.updateCategory(req.params.id, req.body)
    cache.invalidateTags(['catalogue', 'taxonomy'])
    res.json({ category: { id: String(category._id), name: category.name, slug: category.slug, kind: category.kind } })
  }),
)

/** Refused with a 409 while anything still sits on the shelf. */
router.delete(
  '/categories/:id',
  requireOwner,
  asyncHandler(async (req, res) => {
    await taxonomy.deleteCategory(req.params.id)
    cache.invalidateTags(['catalogue', 'taxonomy'])
    res.json({ ok: true })
  }),
)

const brandBody = z
  .object({
    name: safeStr.pipe(z.string().min(1, 'A brand needs a name.').max(80)),
    slug: safeStr.pipe(z.string().max(80)).optional(),
    short: safeStr.pipe(z.string().max(20)).optional(),
    house: z.enum(['Designer Original', 'Own Brand', 'Attar Brand']).optional(),
    country: safeStr.pipe(z.string().max(60)).optional(),
    origin: safeStr.pipe(z.string().max(40)).optional(),
    logo: z.string().trim().max(500000).optional(),
    status: z.enum(['Stocked', 'Paused', 'Discontinued']).optional(),
    since: z.coerce.number().int().min(1800).max(2100).nullable().optional(),
  })
  .strip()

router.post(
  '/brands',
  requireOwner,
  validate('body', brandBody),
  asyncHandler(async (req, res) => {
    const brand = await taxonomy.createBrand(req.body)
    cache.invalidateTags(['catalogue', 'taxonomy'])
    res.status(201).json({ brand: adminBrand(brand) })
  }),
)

router.patch(
  '/brands/:id',
  requireOwner,
  validate('body', brandBody.partial()),
  asyncHandler(async (req, res) => {
    const brand = await taxonomy.updateBrand(req.params.id, req.body)
    cache.invalidateTags(['catalogue', 'taxonomy'])
    res.json({ brand: adminBrand(brand) })
  }),
)

/** Refused with a 409 while the house still has fragrances in the catalogue. */
router.delete(
  '/brands/:id',
  requireOwner,
  asyncHandler(async (req, res) => {
    await taxonomy.deleteBrand(req.params.id)
    cache.invalidateTags(['catalogue', 'taxonomy'])
    res.json({ ok: true })
  }),
)

/* ──────────────────────────────────────────────────────────── reviews ──── */

router.get(
  '/reviews',
  validate('query', listQuery),
  asyncHandler(async (req, res) => {
    res.json({ reviews: await reviews.adminList(req.validatedQuery) })
  }),
)

router.patch(
  '/reviews/:id/status',
  requireOwner,
  validate('body', z.object({ status: z.enum(['Published', 'Pending', 'Rejected']) }).strip()),
  asyncHandler(async (req, res) => {
    await reviews.setStatus(req.params.id, req.body.status, { actor: req.auth.user })
    res.json({ ok: true })
  }),
)

router.delete(
  '/reviews/:id',
  requireOwner,
  asyncHandler(async (req, res) => {
    await reviews.remove(req.params.id)
    res.json({ ok: true })
  }),
)

/* ──────────────────────────────────────────────────────────── coupons ──── */

router.get(
  '/coupons',
  asyncHandler(async (_req, res) => {
    res.json({ coupons: await coupons.adminList() })
  }),
)

const couponBody = z
  .object({
    code: z.string().trim().min(1, 'A coupon needs a code.').max(30),
    label: z.string().trim().max(60).optional(),
    headline: z.string().trim().max(80).optional(),
    description: z.string().trim().max(300).optional(),
    terms: z.string().trim().max(600).optional(),
    type: z.enum(['percent']).optional().default('percent'),
    value: z.coerce.number().nonnegative(),
    minOrder: z.coerce.number().nonnegative().optional(),
    cap: z.coerce.number().nonnegative().nullable().optional(),
    active: z.boolean().optional(),
    startsAt: z.coerce.date().nullable().optional(),
    endsAt: z.coerce.date().nullable().optional(),
    usageLimit: z.coerce.number().int().nonnegative().nullable().optional(),
    scope: z
      .object({
        tiers: z.array(z.string()).optional(),
        excludeTiers: z.array(z.string()).optional(),
        categories: z.array(z.string()).optional(),
      })
      .optional(),
  })
  .strip()

router.post(
  '/coupons',
  requireOwner,
  validate('body', couponBody),
  asyncHandler(async (req, res) => {
    const coupon = await coupons.create(req.body)
    res.status(201).json({ coupon: { id: String(coupon._id), code: coupon.code } })
  }),
)

router.patch(
  '/coupons/:id',
  requireOwner,
  validate('body', couponBody.partial()),
  asyncHandler(async (req, res) => {
    await coupons.update(req.params.id, req.body)
    res.json({ coupon: { id: req.params.id } })
  }),
)

/** Turn a code on or off without deleting it — the row's inline toggle. */
router.patch(
  '/coupons/:id/active',
  requireOwner,
  validate('body', z.object({ active: z.boolean() }).strip()),
  asyncHandler(async (req, res) => {
    await coupons.setActive(req.params.id, req.body.active)
    res.json({ coupon: { id: req.params.id, active: req.body.active } })
  }),
)

router.delete(
  '/coupons/:id',
  requireOwner,
  asyncHandler(async (req, res) => {
    await coupons.remove(req.params.id)
    res.json({ ok: true })
  }),
)

/* ─────────────────────────────────────────────────────────── analytics ──── */

/** Everything the dashboard needs in one request. */
router.get(
  '/analytics',
  requireOwner,
  asyncHandler(async (_req, res) => {
    res.json(await analytics.dashboard())
  }),
)

router.get(
  '/analytics/summary',
  requireOwner,
  asyncHandler(async (_req, res) => {
    res.json(await analytics.summary())
  }),
)

/** A shorter, cheaper read for the dashboard's auto-refresh. */
router.get(
  '/analytics/revenue',
  requireOwner,
  validate('query', z.object({ days: z.coerce.number().int().positive().max(365).optional() }).strip()),
  asyncHandler(async (req, res) => {
    res.json({
      series: await analytics.revenueSeries({ days: req.validatedQuery.days ?? 30 }),
      topProducts: await analytics.topProducts({ limit: 5 }),
      byCategory: await analytics.byCategory(),
      byTier: await analytics.byTier(),
    })
  }),
)

/** The audit feed. */
router.get(
  '/activity',
  validate('query', z.object({ limit: z.coerce.number().int().positive().max(100).optional() }).strip()),
  asyncHandler(async (req, res) => {
    const rows = await activityFeed({ limit: req.validatedQuery.limit ?? 20 })
    res.json({ activity: rows.map(publicActivity) })
  }),
)

/* ──────────────────────────────────────────────────────────── settings ──── */

router.get(
  '/settings',
  asyncHandler(async (req, res) => {
    const data = await settings.allSettings()
    if (req.auth.user?.role !== 'owner') {
      data.email = { configured: Boolean(data.email?.configured) }
    }
    res.json(data)
  }),
)

/**
 * Settings are the owner's alone.
 *
 * A delivery fee is a pricing decision, and `manager` — who can move orders and
 * edit stock — should not be able to change what the shop charges. That is a
 * different kind of authority, so it gets a different guard.
 */
router.patch(
  '/settings/pricing',
  requireOwner,
  validate(
    'body',
    z
      .object({
        shippingFee: z.coerce.number().nonnegative().optional(),
        freeShippingOver: z.coerce.number().nonnegative().optional(),
        giftWrapFee: z.coerce.number().nonnegative().optional(),
        gstRate: z.coerce.number().nonnegative().max(100).optional(),
        comboDiscountPercent: z.coerce.number().nonnegative().max(80).optional(),
        currency: z.string().trim().max(6).optional(),
      })
      .strip(),
  ),
  asyncHandler(async (req, res) => {
    res.json({ pricing: await settings.updatePricing(req.body) })
  }),
)

router.patch(
  '/settings/store',
  requireOwner,
  validate('body', z.record(z.string(), z.string().max(200))),
  asyncHandler(async (req, res) => {
    res.json({ store: await settings.updateStore(req.body) })
  }),
)

router.patch(
  '/settings/content',
  requireOwner,
  validate('body', z.record(z.string(), z.any())),
  asyncHandler(async (req, res) => {
    res.json({ content: await settings.updateContent(req.body) })
  }),
)

const showcaseIdList = z.array(z.string().trim().min(1).max(64)).max(50).optional()

router.patch(
  '/settings/showcase',
  requireOwner,
  validate(
    'body',
    z
      .object({
        codEnabled: z.boolean().optional(),
        showBestsellers: z.boolean().optional(),
        showHomeDeals: z.boolean().optional(),
        showOffersProducts: z.boolean().optional(),
        showCouponsSection: z.boolean().optional(),
        showMultiBottleOffers: z.boolean().optional(),
        showCombos: z.boolean().optional(),
        showCelebrities: z.boolean().optional(),
        showCarPerfumes: z.boolean().optional(),
        offerProductIds: showcaseIdList,
        bestsellerProductIds: showcaseIdList,
        homeDealProductIds: showcaseIdList,
        comboProductIds: showcaseIdList,
        celebrityProductIds: showcaseIdList,
        carPerfumeProductIds: showcaseIdList,
      })
      .strip(),
  ),
  asyncHandler(async (req, res) => {
    const showcase = await settings.updateShowcase(req.body)
    cache.invalidateTags(['catalogue', 'showcase'])
    res.json({ showcase })
  }),
)

router.patch(
  '/settings/email',
  requireOwner,
  validate(
    'body',
    z
      .object({
        host: z.string().trim().max(150).optional(),
        port: z.coerce.number().int().min(1).max(65535).optional(),
        user: z.string().trim().max(150).optional(),
        pass: z.string().max(200).optional(),
        clearPassword: z.boolean().optional(),
        fromName: z.string().trim().max(80).optional(),
        fromEmail: z.string().trim().max(150).optional(),
      })
      .strip(),
  ),
  asyncHandler(async (req, res) => {
    res.json({ email: await settings.updateEmailSettings(req.body) })
  }),
)

router.get(
  '/settings/email/verify-brevo',
  requireOwner,
  asyncHandler(async (_req, res) => {
    res.json(await verifyBrevoAccount())
  }),
)

router.post(
  '/settings/email/test',
  requireOwner,
  validate('body', z.object({ to: z.string().trim().email('Enter a valid test email address.') }).strip()),
  asyncHandler(async (req, res) => {
    const store = await settings.getStore()
    const sent = await sendLoggedEmail({
      to: req.body.to,
      recipientName: req.auth.user?.name || 'Owner',
      kind: 'test',
      subject: `Test Email from ${store.name} Admin`,
      html: `<p>Your transactional email setup for <strong>${store.name}</strong> is working properly!</p>`,
      text: `Your transactional email setup for ${store.name} is working properly!`,
      sentBy: req.auth.user?.name || 'Owner',
    })
    res.json({
      ok: sent.status === 'sent',
      status: sent.status,
      provider: sent.provider,
      messageId: sent.messageId,
      error: sent.error,
      configured: sent.configured,
    })
  }),
)

/* ─────────────────────────────────────────────────────────────── staff ──── */

/** The staff list is owner-only: it enumerates every account with access. */
router.get(
  '/staff',
  requireOwner,
  asyncHandler(async (_req, res) => {
    const users = await auth.staffList()
    res.json({ staff: users.map(sessionUser) })
  }),
)

router.post(
  '/staff',
  requireOwner,
  validate(
    'body',
    z
      .object({
        name: z.string().trim().min(1).max(80),
        email: z.string().trim().email('That is not a valid email address.'),
        password: z.string().min(8, 'A password needs at least 8 characters.'),
        role: z.enum(['staff', 'owner']),
      })
      .strip(),
  ),
  asyncHandler(async (req, res) => {
    const user = await auth.createStaff(req.body)
    res.status(201).json({ staff: sessionUser(user) })
  }),
)

router.patch(
  '/staff/:id',
  requireOwner,
  validate('body', z.object({ name: z.string().trim().min(1).max(80).optional(), role: z.enum(['staff', 'owner']).optional() }).strip()),
  asyncHandler(async (req, res) => {
    const user = await auth.updateStaff(req.params.id, req.body)
    res.json({ staff: sessionUser(user) })
  }),
)

router.delete(
  '/staff/:id',
  requireOwner,
  asyncHandler(async (req, res) => {
    await auth.removeStaff(req.params.id)
    res.json({ ok: true })
  }),
)

/* ───────────────────────────────────────────────────────────── uploads ──── */

/**
 * A form field arriving as an owner reference.
 *
 * Multipart bodies are all strings, so an `ownerId` comes through as text and
 * has to be checked before it reaches Mongoose — an invalid ObjectId would
 * otherwise surface as a CastError (400) rather than being treated as "not
 * attached to anything yet", which is what an upload in progress actually is.
 */
const refOrNull = (value) => (value && /^[a-f0-9]{24}$/i.test(String(value)) ? value : null)

/** What the upload routes accept — so the admin's drop zone can state it. */
router.get(
  '/uploads/limits',
  asyncHandler(async (_req, res) => {
    res.json({
      allowed: [...ALLOWED_MIME],
      ...UPLOAD_LIMITS,
      // Where the bytes will actually go. The panel shows this so an operator
      // knows whether photographs are on a CDN or on this machine's disk.
      driver: storageDriver(),
      cloudinary: cloudinaryConfigured() ? 'configured' : 'not-configured',
    })
  }),
)

/**
 * Upload a file.
 *
 * Bytes go to the storage driver, the facts about them to the `media`
 * collection, and the row's id comes back for the caller to attach to whatever
 * it is describing.
 *
 * `requireUploads` runs **before** multer, so a driver that cannot take the file
 * answers 503 with an explanation rather than buffering it and failing later.
 * With the local driver that never happens — a laptop needs no configuration to
 * accept a photograph.
 */
router.post(
  '/uploads',
  requireOwner,
  requireUploads,
  uploadSingle,
  asyncHandler(async (req, res) => {
    const row = await media.upload(req.file, {
      ownerType: req.body.ownerType ?? 'content',
      ownerId: refOrNull(req.body.ownerId),
      alt: req.body.alt ?? '',
      caption: req.body.caption ?? '',
      uploadedBy: req.auth.user._id,
    })
    res.status(201).json({ media: publicMedia(row) })
  }),
)

/** Several files at once, for a drop zone. */
router.post(
  '/uploads/batch',
  requireOwner,
  requireUploads,
  uploadManyFiles,
  asyncHandler(async (req, res) => {
    const rows = await media.uploadMany(req.files, {
      ownerType: req.body.ownerType ?? 'content',
      ownerId: refOrNull(req.body.ownerId),
      uploadedBy: req.auth.user._id,
    })
    res.status(201).json({ media: rows.map(publicMedia) })
  }),
)

/** The media library. */
router.get(
  '/media',
  validate('query', z.object({ ownerType: z.string().trim().optional(), ownerId: z.string().trim().optional(), limit: z.coerce.number().int().positive().max(200).optional() }).strip()),
  asyncHandler(async (req, res) => {
    res.json({ media: await media.list(req.validatedQuery) })
  }),
)

/** Re-describe an asset without re-uploading it. */
router.patch(
  '/media/:id',
  requireOwner,
  validate('body', z.object({ alt: z.string().max(200).optional(), caption: z.string().max(300).optional() }).strip()),
  asyncHandler(async (req, res) => {
    const row = await media.describe(req.params.id, req.body)
    res.json({ media: publicMedia(row) })
  }),
)

/** Destroy an asset, in Cloudinary and here. */
router.delete(
  '/media/:id',
  requireOwner,
  requireUploads,
  asyncHandler(async (req, res) => {
    await media.destroy(req.params.id)
    res.json({ ok: true })
  }),
)

router.use(uploadErrors)

export default router
