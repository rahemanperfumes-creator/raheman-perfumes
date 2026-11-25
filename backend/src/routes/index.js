import { Router } from 'express'
import { z } from 'zod'
import validate from '../middleware/validate.js'
import { asyncHandler } from '../middleware/asyncHandler.js'
import { requireAuth, requireCustomer } from '../middleware/auth.js'
import { requireUploads, uploadMany, uploadErrors } from '../middleware/upload.js'
import publicRoutes from './public.js'
import authRoutes from './auth.js'
import accountRoutes from './account.js'
import adminRoutes from './admin.js'
import * as orders from '../services/orders.js'
import * as media from '../services/media.js'
import { isRazorpayConfigured, getRazorpayKeyId } from '../services/razorpay.js'
import { publicMedia, publicOrder, publicTracking } from '../lib/views.js'

/**
 * Everything under `/api`.
 *
 * Both `vite.config.js` files proxy `/api` to `http://localhost:8000` with
 * **no path rewrite**, so this is where the routers land and nothing is
 * stripped — `/api/products` reaches `publicRoutes` as `/products`.
 *
 * `/orders` (checkout) and `/uploads/review-images` sit here rather than inside
 * `account.js` because they are not account reads: checkout is the one write the
 * storefront makes today, and a review photograph is uploaded before the review
 * it belongs to exists.
 */

const router = Router()

router.use('/', publicRoutes)
router.use('/auth', authRoutes)
router.use('/account', accountRoutes)
router.use('/admin', adminRoutes)

/**
 * Place an order.
 *
 * The basket arrives as **slugs and sizes, never prices**. The server looks each
 * fragrance up and reads the price off its own volume ladder, because a price
 * that came from the browser is a price the browser could have edited. Stock
 * leaves the shelf in the same transaction that writes the order.
 */
router.post(
  '/orders',
  requireCustomer,
  validate(
    'body',
    z
      .object({
        items: z
          .array(
            z
              .object({
                slug: z.string().trim().optional(),
                productId: z.string().trim().optional(),
                size: z.string().trim().optional(),
                volume: z.string().trim().optional(),
                qty: z.coerce.number().int().positive().max(20).default(1),
                isLoyaltyReward: z.boolean().optional(),
                note: z.string().trim().max(200).optional(),
                comboId: z.string().trim().max(80).optional(),
                isLoyaltyReward: z.boolean().optional(),
              })
              .refine((item) => item.slug || item.productId, { message: 'Each line needs a slug or a productId.' }),
          )
          .min(1, 'An order needs at least one item.')
          .max(40),
        address: z
          .object({
            name: z.string().trim().max(80).optional().default(''),
            phone: z.string().trim().max(24).optional().default(''),
            line1: z.string().trim().max(160).optional().default(''),
            line2: z.string().trim().max(160).optional().default(''),
            area: z.string().trim().max(80).optional().default(''),
            city: z.string().trim().max(60).optional().default(''),
            district: z.string().trim().max(80).optional().default(''),
            state: z.string().trim().max(60).optional().default(''),
            pincode: z.string().trim().max(12).optional().default(''),
          })
          .optional(),
        couponCode: z.string().trim().max(30).optional(),
        giftWrap: z.boolean().optional().default(false),
        payment: z
          .object({
            method: z.string().trim().max(30).optional(),
            status: z.enum(['Paid', 'COD Pending', 'Refunded', 'Failed']).optional(),
            txnRef: z.string().trim().max(100).optional(),
            razorpay_payment_id: z.string().trim().max(100).optional(),
            razorpay_order_id: z.string().trim().max(100).optional(),
            razorpay_signature: z.string().trim().max(200).optional(),
          })
          .optional(),
        notes: z.string().trim().max(500).optional(),
        clientRef: z.string().trim().max(80).optional(),
      })
      .strip(),
  ),
  asyncHandler(async (req, res) => {
    const order = await orders.place(req.body, { customer: req.auth.customer })
    res.status(201).json({ order: publicOrder(order), tracking: publicTracking(order) })
  }),
)

/**
 * Public Razorpay gateway status & keyId check.
 */
router.get('/payments/razorpay/config', (req, res) => {
  res.json({
    configured: isRazorpayConfigured(),
    keyId: getRazorpayKeyId(),
  })
})

/**
 * Initiate server-side Razorpay order with strict price arithmetic.
 */
router.post(
  '/payments/razorpay/create-order',
  requireCustomer,
  validate(
    'body',
    z
      .object({
        items: z
          .array(
            z
              .object({
                slug: z.string().trim().optional(),
                productId: z.string().trim().optional(),
                size: z.string().trim().optional(),
                volume: z.string().trim().optional(),
                qty: z.coerce.number().int().positive().max(20).default(1),
                isLoyaltyReward: z.boolean().optional(),
              })
              .refine((item) => item.slug || item.productId, { message: 'Each line needs a slug or productId.' }),
          )
          .min(1, 'Need at least one item.'),
        couponCode: z.string().trim().max(30).optional(),
        giftWrap: z.boolean().optional().default(false),
      })
      .strip(),
  ),
  asyncHandler(async (req, res) => {
    const razorpayOrder = await orders.prepareRazorpayOrder(req.body, { customer: req.auth.customer })
    res.json(razorpayOrder)
  }),
)

/**
 * Upload the photographs for a review.
 *
 * Separate from the review itself so a failed submission does not orphan a
 * half-written review, and so the ids can be attached to the review that is
 * created afterwards. A shopper may use this; they do not need a staff role.
 */
router.post(
  '/uploads/review-images',
  requireAuth,
  requireUploads,
  uploadMany,
  asyncHandler(async (req, res) => {
    const rows = await media.uploadMany(req.files, {
      ownerType: 'review',
      ownerId: null,
      uploadedBy: req.auth.user._id,
    })
    res.status(201).json({ media: rows.map(publicMedia), mediaIds: rows.map((row) => String(row._id)) })
  }),
)

router.use('/uploads', uploadErrors)

export default router
