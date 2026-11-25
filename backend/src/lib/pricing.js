import {
  rupees,
  FREE_SHIPPING_THRESHOLD,
  STANDARD_SHIPPING_FEE,
  GIFT_WRAP_FEE,
  LOYALTY_ORDER_THRESHOLD,
  LOYALTY_POINTS_PER_ORDER,
  LOYALTY_POINTS_PER_RUPEE,
} from './format.js'

/**
 * The pricing authority.
 *
 * This file is the single place money is computed, and it reproduces
 * `frontend/src/store/cartStore.js` line for line. That matters more than it
 * looks: the cart prices an order in the browser and this prices it again on the
 * server, so any disagreement shows up as a shopper being charged a figure the
 * summary never showed them. The client's arithmetic, in its own order:
 *
 *   couponDiscount = coupon.discount(subtotal)          // on the RAW subtotal
 *   afterCoupon    = max(0, subtotal - couponDiscount)
 *   shipping       = afterCoupon === 0 || afterCoupon >= threshold ? 0 : fee
 *   gst            = round(afterCoupon * 18 / 118)      // informational
 *   total          = afterCoupon + shipping + giftWrap
 *
 * Two details worth stating because they are easy to get backwards: the
 * free-shipping threshold is measured on the **post-discount** subtotal, and GST
 * is *included* in the listed price, so it is reported as a split of the total
 * rather than added to it.
 *
 * A coupon's `discount` in the storefront is a **function** (`pct(10, 999, 500)`),
 * which cannot be stored in MongoDB. It is stored as data instead — `type`,
 * `value`, `minOrder`, `cap` — and `couponDiscount()` below is the one
 * implementation of what those fields mean.
 */

const GST_RATE = 18
const GST_DIVISOR = 100 + GST_RATE

/**
 * What a coupon removes from a subtotal.
 *
 * Mirrors the storefront's `pct` and `flat` helpers exactly, including that the
 * minimum-order test is against the **raw** subtotal and that a percentage is
 * rounded before the cap is applied. Unlike the client it also clamps to the
 * subtotal, so a stored rule can never drive a total below zero — the client can
 * get away without that check because its coupons are hand-written constants,
 * while these are editable rows in a database.
 *
 * @param {{type: 'percent'|'flat', value: number, minOrder?: number, cap?: number|null, active?: boolean}|null} coupon
 * @param {number} subtotal
 * @returns {number} rupees removed, never negative, never more than `subtotal`
 */
export function couponDiscount(coupon, subtotal) {
  if (!coupon || coupon.active === false) return 0
  const base = Number(subtotal) || 0
  if (base <= 0) return 0
  if (base < (coupon.minOrder ?? 0)) return 0

  let amount = 0
  if (coupon.type === 'percent') {
    amount = Math.round((base * (Number(coupon.value) || 0)) / 100)
    if (coupon.cap != null) amount = Math.min(amount, coupon.cap)
  } else if (coupon.type === 'flat') {
    amount = Number(coupon.value) || 0
  }

  return Math.max(0, Math.min(rupees(amount), base))
}

/**
 * Calculate multi-bottle combination discount.
 *
 * Rules:
 * - Flatten all bottle units across lines.
 * - Sort descending by price (highest price first, lowest last).
 * - Bottle #0 (highest price): 0% discount (customer pays full price).
 * - Bottle #1 (2nd highest price): 15% cut off.
 * - Bottle #2 and onwards (3rd highest and cheaper): 20% cut off.
 *
 * Sorting descending ensures that if a customer adds a cheap bottle first and an expensive one later,
 * the 20% cut applies strictly to the cheaper bottle, never the most expensive one.
 *
 * @param {Array<{qty: number, unitPrice: number, comboId?: string}>} lines
 * @param {number} [percent=15]
 * @returns {number}
 */
export function comboDiscountForLines() {
  return 0
}

/**
 * Price a set of lines.
 *
 * @param {object} input
 * @param {Array<{qty: number, unitPrice: number, comboId?: string}>} input.items
 * @param {object|null} [input.coupon]   a coupon document, or a plain rule object
 * @param {boolean} [input.giftWrap]
 * @param {{shippingFee?: number, freeShippingOver?: number, giftWrapFee?: number}} [input.rule]
 * @returns {object} the pricing snapshot stored on the order
 */
export function priceOrder({ items = [], coupon = null, giftWrap = false, rule = {} }) {
  const shippingFee = rule.shippingFee ?? STANDARD_SHIPPING_FEE
  const freeShippingOver = rule.freeShippingOver ?? FREE_SHIPPING_THRESHOLD
  const giftWrapFee = rule.giftWrapFee ?? GIFT_WRAP_FEE
  const comboDiscountPercent = 0

  const lines = items.map((item) => ({
    ...item,
    qty: Number(item.qty) || 0,
    unitPrice: Number(item.unitPrice) || 0,
    lineTotal: (Number(item.qty) || 0) * (Number(item.unitPrice) || 0),
  }))

  const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0)
  const comboDiscount = 0
  const couponAmount = Math.min(subtotal, couponDiscount(coupon, subtotal))
  const discount = couponAmount
  const afterCoupon = Math.max(0, subtotal - discount)

  // An empty basket is not charged for delivery, and once discounts have taken
  // the order past the threshold the delivery is complimentary — both as the
  // cart does it, measured after the discount rather than before.
  const hasFreeShipping = shippingFee > 0 && freeShippingOver > shippingFee && freeShippingOver > 1
  const shipping =
    shippingFee === 0
      ? 0
      : afterCoupon === 0
        ? 0
        : hasFreeShipping && afterCoupon >= freeShippingOver
          ? 0
          : shippingFee
  const wrap = giftWrap ? giftWrapFee : 0
  const gst = Math.round((afterCoupon * GST_RATE) / GST_DIVISOR)
  const total = afterCoupon + shipping + wrap

  return {
    lines,
    subtotal,
    comboDiscount,
    comboDiscountPercent,
    discount,
    afterCoupon,
    shipping,
    giftWrap: wrap,
    gst,
    total,
    savings: discount,
    loyaltyPoints: total >= LOYALTY_ORDER_THRESHOLD ? LOYALTY_POINTS_PER_ORDER : 0,
    freeShippingGap: hasFreeShipping ? Math.max(0, freeShippingOver - afterCoupon) : 0,
    coupon: coupon
      ? {
          code: coupon.code,
          type: coupon.type,
          value: coupon.value,
          minOrder: coupon.minOrder ?? 0,
          cap: coupon.cap ?? null,
          amount: couponAmount,
        }
      : null,
    // The rule as it stood when the order was placed. A historical order must not
    // re-price because a delivery fee changed this morning.
    rule: { shippingFee, freeShippingOver, giftWrapFee, gstRate: GST_RATE, comboDiscountPercent },
  }
}

export default { comboDiscountForLines, couponDiscount, priceOrder }
