import { Schema, model } from 'mongoose'
import { baseOptions, ref } from './options.js'
import './Media.js'

/**
 * A placed order.
 *
 * Both frontends read this same row and describe it in their own words. The
 * admin works the fulfilment path — Pending, Packed, Shipped, Delivered, with
 * Cancelled off to one side — while the storefront shows a shopper "In Transit"
 * or "Mixing in Lab". The admin's flow is the canonical `status`, because it is
 * ordered and it is what staff actually move an order along; the shopper's
 * wording is derived from it in `src/lib/views.js` rather than stored twice.
 *
 * **Money is a snapshot, not a recalculation.** `pricing` records the subtotal,
 * the coupon, the delivery fee and the total *as they stood when the order was
 * placed*, along with the rule that produced them. A historical order must not
 * re-price because the delivery fee changed this morning, and — more concretely
 * — the seeded orders must keep showing the amounts the admin fixtures state
 * rather than being recomputed against today's threshold. `src/lib/pricing.js`
 * computes; this field remembers.
 */

/** The fulfilment path. Cancelled is a terminal state off it, not a step on it. */
export const ORDER_FLOW = ['Pending', 'Packed', 'Shipped', 'Delivered']
export const ORDER_STATUSES = [...ORDER_FLOW, 'Cancelled']
export const PAYMENT_STATUSES = ['Paid', 'COD Pending', 'Refunded', 'Failed']
export const REFUND_STATUSES = ['None', 'Requested', 'Refunded', 'Rejected']
/**
 * `Shop` is a bill rung up at the counter in the admin panel. It is an order
 * like any other — same number sequence, same ledger, same reports — with two
 * differences the order service enforces: it is handed over on the spot (so it
 * is born `Delivered`), and it may sell into the shop reserve that online
 * orders are held above.
 */
export const ORDER_CHANNELS = ['Website', 'Storefront', 'Admin', 'Shop']
/** How a counter bill is settled. Online orders keep their free-text method. */
export const SHOP_PAYMENT_METHODS = ['Cash', 'UPI', 'Card']

/**
 * Where each status sits on the shopper's five-stage custody journey. The
 * storefront renders "Stage 3 of 5 • Air Express Forwarding" for a shipped
 * order, which is this index plus one.
 */
export const TIMELINE_STAGES = ['Confirmed', 'Hand-Poured', 'In Transit', 'Out for Delivery', 'Handover']

const orderItemSchema = new Schema(
  {
    /** Null once a product is deleted — the line survives, the link does not. */
    product: ref('Product', { required: false, default: null }),
    name: { type: String, required: true },
    sku: { type: String, default: '' },
    slug: { type: String, default: '' },
    /**
     * The picture, frozen at placement.
     *
     * A line is a record of what was sold, read long after the fact — on the
     * receipt, the account page, the tracking page and the admin's drawer. Going
     * back to the product for its photo would show today's photograph for
     * yesterday's sale, and nothing at all once the fragrance has been deleted.
     * So the first gallery shot is copied here, for the same reason the name and
     * the price are.
     */
    image: { type: String, default: '' },
    volume: { type: String, default: '' },
    qty: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    lineTotal: { type: Number, required: true, min: 0 },
    /** Optional item metadata and gift note. */
    meta: { type: String, default: '' },
    note: { type: String, default: '' },
    comboId: { type: String, default: '' },
  },
  { _id: true },
)

const shipmentEventSchema = new Schema(
  {
    title: { type: String, required: true },
    description: { type: String, default: '' },
    at: { type: Date, required: true },
  },
  { _id: true },
)

const orderSchema = new Schema(
  {
    number: { type: String, required: true, unique: true, uppercase: true, trim: true },
    customer: ref('Customer'),
    placedAt: { type: Date, required: true, default: () => new Date() },
    channel: { type: String, enum: ORDER_CHANNELS, default: 'Website' },

    status: { type: String, enum: ORDER_STATUSES, default: 'Pending', index: true },

    payment: {
      status: { type: String, enum: PAYMENT_STATUSES, default: 'Paid' },
      method: { type: String, default: 'UPI' },
      txnRef: { type: String, default: '' },
      razorpayOrderId: { type: String, default: '' },
    },

    /**
     * The delivery address copied at placement. A snapshot rather than a ref,
     * because an order has to remember where it was actually sent even after the
     * customer edits or deletes that address.
     */
    address: {
      name: { type: String, default: '' },
      phone: { type: String, default: '' },
      email: { type: String, default: '', lowercase: true, trim: true },
      line1: { type: String, default: '' },
      line2: { type: String, default: '' },
      area: { type: String, default: '' },
      city: { type: String, default: '' },
      district: { type: String, default: '' },
      state: { type: String, default: '' },
      pincode: { type: String, default: '' },
    },

    items: { type: [orderItemSchema], default: [] },

    /** Written by `priceOrder()` — see the note at the top. */
    pricing: {
      subtotal: { type: Number, default: 0 },
      comboDiscount: { type: Number, default: 0 },
      comboDiscountPercent: { type: Number, default: 0 },
      discount: { type: Number, default: 0 },
      afterCoupon: { type: Number, default: 0 },
      shipping: { type: Number, default: 0 },
      giftWrap: { type: Number, default: 0 },
      gst: { type: Number, default: 0 },
      total: { type: Number, default: 0 },
      savings: { type: Number, default: 0 },
      loyaltyPoints: { type: Number, default: 0 },
      coupon: {
        code: { type: String, default: null },
        type: { type: String, default: null },
        value: { type: Number, default: null },
        minOrder: { type: Number, default: null },
        cap: { type: Number, default: null },
        amount: { type: Number, default: 0 },
      },
      rule: {
        shippingFee: { type: Number, default: 0 },
        freeShippingOver: { type: Number, default: 0 },
        giftWrapFee: { type: Number, default: 0 },
        gstRate: { type: Number, default: 18 },
        comboDiscountPercent: { type: Number, default: 15 },
      },
    },

    tracking: {
      courier: { type: String, default: '' },
      awb: { type: String, default: '' },
      expectedDelivery: { type: Date, default: null },
      transitNote: { type: String, default: '' },
      sealNote: { type: String, default: '' },
    },

    shipmentEvents: { type: [shipmentEventSchema], default: [] },
    inclusions: { type: [String], default: [] },
    /** Staff-only. */
    notes: { type: String, default: '' },
    /** Customer cancellation / manual UPI refund workflow (pre-packed prepaid orders). */
    refund: {
      status: { type: String, enum: REFUND_STATUSES, default: 'None', index: true },
      upiId: { type: String, default: '', trim: true },
      amount: { type: Number, default: 0, min: 0 },
      reason: { type: String, default: '', trim: true },
      requestedAt: { type: Date, default: null },
      processedAt: { type: Date, default: null },
      processedBy: { type: String, default: '' },
      referenceNote: { type: String, default: '', trim: true },
    },
    /** Stock movement keys, so a cancellation can reverse exactly what it took. */
    stockApplied: { type: Boolean, default: false },

    /** Who rang up a counter bill — a name snapshot, as printed on the receipt. */
    cashier: { type: String, default: '' },
    /**
     * The client's own id for a bill, so a double-tapped Charge button or a
     * retried request lands one bill rather than two. Sparse and left absent
     * when unused, for the same reason as `StockLedger.idempotencyKey`: an
     * explicit null is indexed, and the second keyless order would collide.
     */
    clientRef: { type: String },

    legacyId: { type: String, default: null },
  },
  baseOptions,
)

orderSchema.index({ customer: 1, placedAt: -1 })
orderSchema.index({ customer: 1, status: 1, placedAt: -1 })
orderSchema.index({ status: 1, placedAt: -1 })
orderSchema.index({ 'tracking.awb': 1 })
orderSchema.index({ channel: 1, placedAt: -1 })
orderSchema.index({ channel: 1, status: 1, placedAt: -1 })
orderSchema.index({ clientRef: 1 }, { unique: true, sparse: true })

/** Which step of the custody journey this order sits on, or -1 when cancelled. */
orderSchema.virtual('stageIndex').get(function stageIndex() {
  if (this.status === 'Cancelled') return -1
  const map = { Pending: 0, Packed: 1, Shipped: 2, Delivered: 4 }
  return map[this.status] ?? 0
})

export const Order = model('Order', orderSchema)
export default Order
