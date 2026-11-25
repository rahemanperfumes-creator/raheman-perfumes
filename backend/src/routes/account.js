import { Router } from 'express'
import { z } from 'zod'
import validate from '../middleware/validate.js'
import { asyncHandler } from '../middleware/asyncHandler.js'
import { requireCustomer } from '../middleware/auth.js'
import * as customers from '../services/customers.js'
import * as orders from '../services/orders.js'
import { publicAddress } from '../lib/views.js'

/**
 * The signed-in shopper's own account.
 *
 * Every route here is behind `requireCustomer`, which refuses a staff account
 * with no patron profile rather than handing it an empty profile it could then
 * write to. The customer document comes from `req.auth.customer`, which the
 * session loader has already populated — the routes never take a customer id
 * from the request, so there is no way to address someone else's account.
 */

const router = Router()
router.use(requireCustomer)

/** The profile, with its stats counted from the other collections. */
router.get(
  '/profile',
  asyncHandler(async (req, res) => {
    res.json(await customers.selfView(req.auth.customer))
  }),
)

router.patch(
  '/profile',
  validate(
    'body',
    z
      .object({
        name: z.string().trim().min(1).max(80).optional(),
        phone: z.string().trim().max(24).optional(),
        city: z.string().trim().max(60).optional(),
        preferredAccord: z.string().trim().max(60).optional(),
      })
      .strip(),
  ),
  asyncHandler(async (req, res) => {
    const customer = await customers.update(req.auth.customer._id, req.body)
    res.json(await customers.selfView(customer))
  }),
)

/* ──────────────────────────────────────────────────────── addresses ──── */

const addressSchema = z
  .object({
    tag: z.string().trim().max(30).optional().default(''),
    name: z.string().trim().max(80).optional().default(''),
    phone: z.string().trim().min(10, 'A valid 10-digit mobile number is required.').max(24),
    line1: z.string().trim().min(1, 'A street address is required.').max(160),
    line2: z.string().trim().max(160).optional().default(''),
    area: z.string().trim().max(80).optional().default(''),
    city: z.string().trim().min(1, 'A city is required.').max(60),
    district: z.string().trim().max(80).optional().default(''),
    state: z.string().trim().max(60).optional().default(''),
    pincode: z.string().trim().max(12).optional().default(''),
    type: z.enum(['Home', 'Office', 'Other']).optional().default('Home'),
    isDefault: z.boolean().optional().default(false),
  })
  .strip()

router.get(
  '/addresses',
  asyncHandler(async (req, res) => {
    res.json(customers.addresses(req.auth.customer))
  }),
)

router.post(
  '/addresses',
  validate('body', addressSchema),
  asyncHandler(async (req, res) => {
    const address = await customers.addAddress(req.auth.customer, req.body)
    res.status(201).json(publicAddress(address))
  }),
)

router.patch(
  '/addresses/:id',
  validate('body', addressSchema.partial()),
  asyncHandler(async (req, res) => {
    const address = await customers.updateAddress(req.auth.customer, req.params.id, req.body)
    res.json(publicAddress(address))
  }),
)

router.post(
  '/addresses/:id/default',
  asyncHandler(async (req, res) => {
    const address = await customers.setDefaultAddress(req.auth.customer, req.params.id)
    res.json(publicAddress(address))
  }),
)

router.delete(
  '/addresses/:id',
  asyncHandler(async (req, res) => {
    await customers.removeAddress(req.auth.customer, req.params.id)
    res.json({ ok: true, addresses: customers.addresses(req.auth.customer) })
  }),
)

/* ─────────────────────────────────────────────────────────── orders ──── */

router.get(
  '/orders',
  asyncHandler(async (req, res) => {
    res.json(await orders.forCustomer(req.auth.customer._id))
  }),
)

router.get(
  '/orders/:number',
  asyncHandler(async (req, res) => {
    // Scoped to the signed-in patron inside the query, so looking up by number
    // alone cannot read someone else's order.
    const order = await orders.publicOneFor(req.auth.customer._id, req.params.number)
    if (!order) return res.status(404).json({ message: `No order matches “${req.params.number}”.` })
    return res.json(order)
  }),
)

/**
 * Customer-requested cancellation (only allowed BEFORE parcel is Packed).
 * Prepaid / Razorpay orders must provide a valid UPI ID for manual owner refund.
 */
router.post(
  '/orders/:number/cancel',
  validate(
    'body',
    z
      .object({
        upiId: z.string().trim().max(100).optional().default(''),
        reason: z.string().trim().max(300).optional().default(''),
      })
      .strip(),
  ),
  asyncHandler(async (req, res) => {
    const order = await orders.cancelByCustomer(req.auth.customer._id, req.params.number, req.body)
    res.json({ order })
  }),
)

/* ───────────────────────────────────────────────────────── wishlist ──── */

router.get(
  '/wishlist',
  asyncHandler(async (req, res) => {
    const products = await customers.wishlist(req.auth.customer)
    res.json(products.map((product) => String(product._id ?? product)))
  }),
)

/**
 * Toggle a fragrance on the wishlist.
 *
 * A toggle rather than separate add and remove routes, because the heart on a
 * product card is one button and two endpoints would make the client decide
 * which one to call — a question the server can answer atomically.
 */
router.post(
  '/wishlist/:productId',
  asyncHandler(async (req, res) => {
    res.json(await customers.toggleWishlist(req.auth.customer, req.params.productId))
  }),
)

/** Replace the whole wishlist, for a client that keeps one locally. */
router.put(
  '/wishlist',
  validate('body', z.object({ productIds: z.array(z.string()).max(200) }).strip()),
  asyncHandler(async (req, res) => {
    const ids = await customers.setWishlist(req.auth.customer, req.body.productIds)
    res.json({ productIds: ids.map(String) })
  }),
)

export default router
