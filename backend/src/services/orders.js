import mongoose from 'mongoose'
import { Coupon, Customer, Order, ORDER_FLOW, Product, onlineStockOf } from '../models/index.js'
import { isStaffUser } from '../middleware/auth.js'
import { priceOrder } from '../lib/pricing.js'
import { nextOrderNumber } from '../lib/orderNumber.js'
import { conflict, forbidden, notFound, unprocessable } from '../middleware/error.js'
import { adminOrder, publicOrder, publicTracking } from '../lib/views.js'
import { deductForOrder, restoreForOrder } from './inventory.js'
import { getPricing, getShowcase } from './settings.js'
import { logAlert, logOrder } from './activity.js'
import { recordEvent, dispatchPendingEvents } from './outbox.js'
import { processPostOrderLoyalty } from './repeatAnalysis.js'
import { sendLoggedEmail } from './mailer.js'
import { realEmailOf } from '../lib/identity.js'
import { cache } from '../lib/cache.js'
import {
  LOYALTY_ORDER_THRESHOLD,
  LOYALTY_POINTS_PER_ORDER,
  LOYALTY_REWARD_POINTS_COST,
} from '../lib/format.js'
import { verifyRazorpaySignature, createRazorpayOrder, isRazorpayConfigured } from './razorpay.js'

/**
 * Placing and moving orders.
 *
 * Three things happen here that have to agree with each other, and each is a
 * place where getting it wrong is expensive:
 *
 *   • **Money is computed once and frozen.** `priceOrder()` prices the basket
 *     from the server's own rule set, and the result is written to
 *     `order.pricing` as a snapshot. A placed order never re-prices — not when
 *     the delivery fee changes, and not when the product's price changes. That is
 *     what "money is computed, never stored" means for a historical record: it
 *     was computed at placement and the computation is what is kept.
 *
 *   • **Stock leaves the shelf in the same transaction as the order.** An order
 *     that exists while its stock does not is how a shop oversells. Both writes
 *     commit together or neither does.
 *
 *   • **The status path is one-way.** `ORDER_FLOW` runs Pending → Packed →
 *     Shipped → Delivered, with Cancelled terminal and off the path. Any
 *     backward move is refused.
 */

/**
 * The legal statuses from a given one.
 *
 * Forward moves may *skip* — a shop that packs and ships without pausing to mark
 * the order Packed is doing something legitimate, and refusing it would only
 * teach staff to make two clicks instead of one. Everything backward is refused,
 * because a delivered parcel cannot become pending again and pretending
 * otherwise corrupts the stock ledger that moved with it. Cancelled is reachable
 * from anywhere on the path except Delivered, and is terminal.
 */
export function allowedTransitions(from) {
  if (from === 'Cancelled') return []
  if (from === 'Delivered') return []
  const index = ORDER_FLOW.indexOf(from)
  if (index === -1) return [...ORDER_FLOW.slice(1), 'Cancelled']
  return [...ORDER_FLOW.slice(index + 1), 'Cancelled']
}

/** Is `to` a legal move from `from`? */
export const canTransition = (from, to) => allowedTransitions(from).includes(to)

/** Assert a transition, with a message that says what is allowed instead. */
function assertTransition(order, to) {
  if (order.status === to) throw conflict(`Order ${order.number} is already ${to}.`)
  if (!canTransition(order.status, to)) {
    const allowed = allowedTransitions(order.status)
    throw conflict(
      allowed.length
        ? `Order ${order.number} is ${order.status} and cannot move to ${to}. Allowed from here: ${allowed.join(', ')}.`
        : `Order ${order.number} is ${order.status}, which is final.`,
    )
  }
}

/**
 * Resolve a basket line to a product and the price of the size chosen.
 *
 * The client sends a slug and a size rather than a price, and that is the point:
 * a price arriving from the browser is a price the browser could have edited.
 * The server looks the fragrance up and reads the price off its own volume
 * ladder.
 *
 * The stock test depends on who is selling. The counter may sell the whole
 * shelf; every other channel sees only what sits above the shop reserve. This is
 * the early, friendly refusal — the binding one is repeated inside the
 * transaction by `applyAdjustment`, which also catches two lines of the same
 * fragrance that only overrun together.
 */
async function resolveLine(line, { counter = false } = {}) {
  // Complimentary 10-points loyalty reward (Free 5ml Pure Attar)
  const isReward =
    Boolean(line.isLoyaltyReward) ||
    line.slug === 'pure-artisan-attar-5ml' ||
    line.productId === 'free-5ml-attar-reward'

  if (isReward) {
    return {
      product: null,
      isLoyaltyReward: true,
      item: {
        product: null,
        name: 'Pure Artisan Attar (Loyalty Reward)',
        sku: 'RP-ATT-5ML-FREE',
        slug: 'pure-artisan-attar-5ml',
        image: '/rehman-amber-bottle-transparent.png',
        volume: '5ml',
        qty: 1,
        unitPrice: 0,
        lineTotal: 0,
        meta: 'Complimentary 10-Points Loyalty Reward',
        note: 'Free 5ml Artisan Attar Gift',
        comboId: '',
      },
    }
  }

  const product = line.productId
    ? await Product.findById(line.productId).populate('images')
    : await Product.findOne({ slug: String(line.slug ?? '').toLowerCase() }).populate('images')

  if (!product) throw unprocessable(`“${line.slug ?? line.productId}” is not in the catalogue.`)
  if (product.status !== 'Active') throw unprocessable(`${product.name} is not currently available.`)

  const wanted = String(line.size ?? line.volume ?? '')
  const volume = wanted ? product.volumes.find((entry) => entry.size === wanted) : product.volumes[0]
  if (!volume) {
    const sizes = product.volumes.map((entry) => entry.size).join(', ')
    throw unprocessable(`${product.name} does not come in ${wanted}. Available: ${sizes}.`)
  }

  const qty = Math.max(1, Number(line.qty) || 1)
  const available = counter ? (product.stock ?? 0) : onlineStockOf(product)
  if (available < qty) {
    if (counter) {
      throw conflict(
        available > 0
          ? `${product.name} has only ${available} on the shelf — the bill asks for ${qty}.`
          : `${product.name} is out of stock.`,
      )
    }
    throw conflict(
      available > 0
        ? `${product.name} (${volume.size}) has only ${available} left — you asked for ${qty}.`
        : `${product.name} is currently sold out.`,
    )
  }

  return {
    product,
    item: {
      product: product._id,
      name: product.name,
      sku: product.sku,
      slug: product.slug,
      // The first gallery shot, copied now rather than joined later — see the
      // note on `orderItemSchema.image`. `find` rather than `[0]` because a
      // gallery can hold a dangling ref to a deleted media row.
      image:
        (product.images ?? []).find((media) => media?.secureUrl || media?.url)?.secureUrl ||
        (product.images ?? []).find((media) => media?.secureUrl || media?.url)?.url ||
        '',
      volume: volume.size,
      qty,
      unitPrice: volume.price,
      lineTotal: volume.price * qty,
      meta: line.meta ?? '',
      note: line.note ?? '',
      comboId: String(line.comboId ?? '').trim(),
    },
  }
}

/**
 * Place an order.
 *
 * @param {object} input
 * @param {Array<{slug?: string, productId?: string, size?: string, qty: number}>} input.items
 * @param {object} [input.address] an address snapshot; when omitted the
 *   customer's default address is copied
 * @param {string} [input.couponCode]
 * @param {boolean} [input.giftWrap]
 * @param {{method?: string, status?: string, txnRef?: string}} [input.payment]
 * @param {string} [input.channel] `'Shop'` for a counter bill — see below
 * @param {{type: 'flat'|'percent', value: number}} [input.discount] a counter
 *   bill's hand-given discount; ignored on every other channel
 * @param {string} [input.clientRef] the client's id for this order, so a retry
 *   returns the first order instead of placing a second
 * @param {object} context
 * @param {any} context.customer the Customer document placing this
 * @param {any} [context.actor] the User behind it, when staff raised it
 *
 * **A counter bill** (`channel: 'Shop'`) is the same order with the shop's
 * rules: it may sell into the shop reserve, it carries no delivery fee, the
 * cashier may knock something off by hand, and it is paid and handed over on
 * the spot — so it is born `Delivered` and `Paid`, and the only way back is a
 * void (`voidShopBill`).
 */
export async function place(input, { customer, actor = null } = {}) {
  if (!customer) throw unprocessable('An order needs a customer.')
  const channel = input.channel ?? (actor ? 'Admin' : 'Website')
  const counter = channel === 'Shop'

  // A blocked account is an online sanction — it is what kills the patron's
  // session — and a cashier serving someone face to face is making that call
  // in person. So the counter is the one channel it does not stop.
  if (customer.status === 'Blocked' && !counter) {
    // `cust-1429` exists in the fixtures as exactly this case.
    throw conflict('This account is blocked and cannot place orders. Please contact customer support.')
  }
  if (!input.items?.length) throw unprocessable('An order needs at least one item.')
  if (counter && actor?.role === 'staff' && input.discount?.type === 'percent' && Number(input.discount.value) > 15) {
    throw forbidden('Staff discount limit is 15%. Ask the Shop Owner for a higher discount.')
  }

  if (input.clientRef) {
    const existing = await Order.findOne({ clientRef: input.clientRef })
    if (existing) return markDuplicate(existing)
  }

  // Everything that can fail before the transaction does, so the transaction
  // stays short: resolving lines, checking stock, pricing, and taking a number.
  const resolved = []
  for (const line of input.items) resolved.push(await resolveLine(line, { counter }))
  const items = resolved.map((entry) => entry.item)

  // When a cart contains multiple lines for the same product
  // (e.g. two sizes or duplicate bottles), ensure cumulative stock suffices.
  const qtyByProduct = new Map()
  for (const { product, item } of resolved) {
    if (!product) continue // Skip non-inventory promotional gifts / loyalty reward lines
    const key = String(product._id)
    const entry = qtyByProduct.get(key) ?? { product, qty: 0 }
    entry.qty += item.qty
    qtyByProduct.set(key, entry)
  }
  for (const { product, qty } of qtyByProduct.values()) {
    const available = counter ? (product.stock ?? 0) : onlineStockOf(product)
    if (available < qty) {
      throw conflict(
        available > 0
          ? `${product.name} has only ${available} left — your order asks for ${qty}.`
          : `${product.name} is currently sold out.`,
      )
    }
  }

  // Verify loyalty reward eligibility if present in basket
  const hasLoyaltyReward = resolved.some((entry) => entry.isLoyaltyReward)
  if (hasLoyaltyReward) {
    const pts = Number(customer?.loyaltyPoints) || 0
    if (pts < LOYALTY_REWARD_POINTS_COST) {
      throw unprocessable(
        `You need at least ${LOYALTY_REWARD_POINTS_COST} loyalty points to claim the Free 5ml Attar reward. You currently have ${pts} points.`,
      )
    }
  }

  const stored = await getPricing()
  // Nothing is dispatched from the counter, so there is nothing to charge for.
  const rule = counter ? { ...stored, shippingFee: 0 } : stored
  let coupon = null
  if (input.couponCode) {
    coupon = await Coupon.findOne({ code: String(input.couponCode).trim().toUpperCase() })
    if (!coupon) throw unprocessable(`“${input.couponCode}” is not a recognised code.`)
    if (!coupon.isLive()) throw unprocessable(`“${coupon.code}” is not currently active.`)
    if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) throw unprocessable(`“${coupon.code}” has been fully redeemed.`)
  } else if (counter && Number(input.discount?.value) > 0) {
    // Staff accounts are capped at 15% counter discount; higher discounts require Owner authority.
    if (actor?.role === 'staff') {
      const itemsSubtotal = items.reduce((sum, line) => sum + line.lineTotal, 0)
      const val = Number(input.discount.value)
      const maxFlat = Math.round((itemsSubtotal * 15) / 100)
      if ((input.discount.type === 'percent' && val > 15) || (input.discount.type === 'flat' && val > maxFlat)) {
        throw forbidden('Staff discount limit is 15%. Ask the Shop Owner for a higher discount.')
      }
    }
    // A hand-given discount is priced by the same rule a coupon is, so the
    // arithmetic — rounding, the clamp at the subtotal — has one definition.
    coupon = { code: null, type: input.discount.type, value: Number(input.discount.value), minOrder: 0, cap: null }
  }

  const pricing = priceOrder({ items, coupon, giftWrap: !counter && Boolean(input.giftWrap), rule })
  if (input.couponCode && (pricing.coupon?.amount ?? 0) === 0) {
    throw unprocessable(`“${coupon.code}” needs a minimum order of ₹${coupon.minOrder}.`)
  }

  // Allocated before the transaction: a number spent on a failed write is a gap,
  // and a gap costs nothing, while a reused number points two customers at one
  // parcel.
  const number = await nextOrderNumber()
  const address = input.address ?? snapshotAddress(customer)
  const method = input.payment?.method ?? (counter ? 'Cash' : 'Razorpay')
  const isCod = String(method).trim().toUpperCase() === 'COD'

  let paymentRecord = {
    status: counter ? 'Paid' : (isCod ? 'COD Pending' : 'Paid'),
    method: isCod ? 'COD' : (counter ? method : 'Razorpay'),
    txnRef: input.payment?.txnRef ?? '',
    razorpayOrderId: input.payment?.razorpay_order_id ?? '',
  }

  if (!counter) {
    if (isCod) {
      const showcase = await getShowcase()
      if (!showcase.codEnabled) {
        throw unprocessable('Cash on Delivery is currently turned off. Please choose Online Payment (Razorpay).')
      }
    } else {
      // Online payment (Razorpay) — strictly require verified payment approval
      const p = input.payment ?? {}
      const paymentId = p.razorpay_payment_id || p.txnRef
      const orderId = p.razorpay_order_id
      const signature = p.razorpay_signature

      if (!paymentId || !orderId || !signature) {
        throw unprocessable(
          'Online payment verification required. The order cannot be placed until payment is approved on Razorpay.',
        )
      }

      const isValid = verifyRazorpaySignature({
        razorpay_order_id: orderId,
        razorpay_payment_id: paymentId,
        razorpay_signature: signature,
      })

      if (!isValid) {
        throw unprocessable('Payment verification failed: Invalid Razorpay signature. Nothing has been charged.')
      }

      paymentRecord = {
        status: 'Paid',
        method: 'Razorpay',
        txnRef: paymentId,
        razorpayOrderId: orderId,
      }
    }
  }

  const session = await mongoose.startSession()
  try {
    let order = null
    await session.withTransaction(async () => {
      const [created] = await Order.create(
        [
          {
            number,
            customer: customer._id,
            placedAt: new Date(),
            channel,
            status: counter ? 'Delivered' : 'Pending',
            payment: paymentRecord,
            address,
            items,
            pricing,
            notes: input.notes ?? '',
            stockApplied: true,
            inclusions: input.inclusions ?? [],
            cashier: counter ? (actor?.name ?? '') : '',
            shipmentEvents: counter
              ? [
                  {
                    title: 'Handover at Counter',
                    description: `Fulfilled and handed over at boutique counter${actor?.name ? ` by ${actor.name}` : ''}.`,
                    at: new Date(),
                  },
                ]
              : [
                  {
                    title: 'Order Confirmed',
                    description: isCod
                      ? 'Order placed & confirmed. Cash on Delivery scheduled for collection at delivery.'
                      : 'Payment verified & order confirmed. Fragrance compounding initiated at Raheman Perfumes atelier.',
                    at: new Date(),
                  },
                ],
            ...(input.clientRef ? { clientRef: input.clientRef } : {}),
          },
        ],
        { session },
      )

      await deductForOrder(items, created, session, actor?._id ?? null)

      // Only a real coupon row has a usage count. A hand-given discount has no
      // `_id`, and `updateOne({_id: undefined})` would match the first coupon in
      // the collection and count this order against it. Enforce `usageLimit`
      // atomically inside the transaction so concurrent checkouts or transaction
      // retries can never over-redeem a capped code.
      if (coupon?._id) {
        const filter = coupon.usageLimit
          ? { _id: coupon._id, usedCount: { $lt: coupon.usageLimit } }
          : { _id: coupon._id }
        const redemption = await Coupon.updateOne(filter, { $inc: { usedCount: 1 } }).session(session)
        if (redemption.matchedCount === 0) {
          throw conflict(`“${coupon.code}” has been fully redeemed.`)
        }
      }

      if (hasLoyaltyReward) {
        const deductResult = await Customer.updateOne(
          { _id: customer._id, loyaltyPoints: { $gte: LOYALTY_REWARD_POINTS_COST } },
          { $inc: { loyaltyPoints: -LOYALTY_REWARD_POINTS_COST } },
        ).session(session)
        if (deductResult.matchedCount === 0) {
          throw conflict('Insufficient loyalty points to claim the Free 5ml Attar reward.')
        }
      }

      // Customer earns 1 loyalty point for every order above ₹799
      if (customer?._id && pricing.total >= LOYALTY_ORDER_THRESHOLD) {
        await Customer.updateOne(
          { _id: customer._id },
          { $inc: { loyaltyPoints: LOYALTY_POINTS_PER_ORDER } },
        ).session(session)
      }

      // Record outbox domain event atomically in same transaction
      await recordEvent(
        'OrderPlaced',
        created._id,
        {
          orderNumber: created.number,
          customerEmail: customer.email,
          customerName: customer.name,
          total: pricing.total,
          itemsCount: items.length,
          channel,
        },
        session,
      )

      order = created
    })

    if (customer) {
      let pointDelta = 0
      if (hasLoyaltyReward) pointDelta -= LOYALTY_REWARD_POINTS_COST
      if (pricing.total >= LOYALTY_ORDER_THRESHOLD) pointDelta += LOYALTY_POINTS_PER_ORDER
      customer.loyaltyPoints = Math.max(0, (customer.loyaltyPoints ?? 0) + pointDelta)
    }

    const amount = `₹${pricing.total.toLocaleString('en-IN')}`
    await logOrder(
      counter
        ? `Shop bill ${order.number} rung up by ${actor?.name ?? 'the counter'} — ${amount} by ${method}.`
        : `Order ${order.number} placed by ${customer.name} — ${amount}.`,
      {
        actor: actor?.name ?? customer.name,
        actorUser: actor?._id ?? null,
        target: order.number,
      },
    )

    // Invalidate product stock cache & dispatch outbox events in background
    cache.invalidateTags(['catalogue', 'products'])
    dispatchPendingEvents().catch(() => {})
    if (!counter) {
      processPostOrderLoyalty({ order, customer, actorName: 'Website Auto' }).catch(() => {})
    }

    return order
  } catch (error) {
    // Two identical requests raced past the lookup above and the unique index
    // refused the second. The first one is the order; hand it back.
    if (error?.code === 11000 && input.clientRef && /clientRef/.test(error.message ?? '')) {
      const existing = await Order.findOne({ clientRef: input.clientRef })
      if (existing) return markDuplicate(existing)
    }
    throw error
  } finally {
    await session.endSession()
  }
}

/** Flag an order as the answer to a retry, without writing anything to it. */
function markDuplicate(order) {
  order.$locals.duplicate = true
  return order
}

/** Copy the customer's default address, or an empty one when they have none. */
function snapshotAddress(customer) {
  const address = customer.defaultAddress
  if (!address) return {}
  return {
    name: address.name || customer.name,
    phone: address.phone || customer.phone,
    line1: address.line1,
    line2: address.line2,
    area: address.area,
    city: address.city,
    district: address.district,
    state: address.state,
    pincode: address.pincode,
  }
}

/* ───────────────────────────────────────────────────────────── reads ──── */

/** `GET /api/admin/orders` — the array behind the `{orders}` envelope. */
export async function adminList(filters = {}) {
  const query = {}
  if (filters.status && filters.status !== 'all') query.status = filters.status
  if (filters.channel) query.channel = filters.channel
  if (filters.customer) query.customer = filters.customer
  if (filters.q) query.number = new RegExp(String(filters.q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
  if (filters.from || filters.to) {
    query.placedAt = {}
    if (filters.from) query.placedAt.$gte = new Date(filters.from)
    if (filters.to) query.placedAt.$lte = new Date(filters.to)
  }

  const orders = await Order.find(query)
    .sort({ placedAt: -1 })
    .limit(Math.min(Number(filters.limit) || 100, 1000))
    .populate('customer', 'name email phone')
    .populate({ path: 'items.product', select: 'name slug images', populate: { path: 'images', select: 'secureUrl url' } })
  return orders.map(adminOrder)
}

/** One order for the admin's drawer, including its movement history. */
export async function adminOne(id) {
  const order = await findOrder(id)
  return adminOrder(order)
}

/** The signed-in patron's own orders. */
export async function forCustomer(customerId, { limit = 50 } = {}) {
  const orders = await Order.find({ customer: customerId })
    .sort({ placedAt: -1 })
    .limit(limit)
    .populate({ path: 'items.product', select: 'name slug images', populate: { path: 'images', select: 'secureUrl url' } })
  return orders.map(publicOrder)
}

/** Look an order up by number or by id, whichever the caller has. */
async function findOrder(idOrNumber, { populate = true } = {}) {
  const value = String(idOrNumber ?? '')
  const byNumber = /^rp\d+$/i.test(value)
  let query = Order.findOne(byNumber ? { number: value.toUpperCase() } : { _id: mongoose.isValidObjectId(value) ? value : null })
  if (populate) {
    query = query
      .populate('customer', 'name email phone')
      .populate({ path: 'items.product', select: 'name slug images', populate: { path: 'images', select: 'secureUrl url' } })
  }
  const order = await query
  if (!order) throw notFound(`No order matches “${value}”.`)
  return order
}

/** A single order for the shopper's order page. */
export async function publicOne(idOrNumber) {
  return publicOrder(await findOrder(idOrNumber, { populate: false }))
}

/**
 * One order, scoped to the patron who owns it.
 *
 * Looking a number up on its own would let anyone read anyone's order by
 * guessing `RP2041`, and the numbers are sequential — so the ownership test is
 * part of the query rather than a check afterwards. `null` when the order exists
 * but belongs to someone else, which the route turns into the same 404 as an
 * unknown number: telling a prober that a number is real but not theirs is
 * information they have no use for.
 */
export async function publicOneFor(customerId, number) {
  const order = await Order.findOne({ number: String(number ?? '').toUpperCase(), customer: customerId })
  return order ? publicOrder(order) : null
}

/**
 * The public tracking payload, or `null`.
 *
 * `null` rather than a 404 for an unknown number, because the tracking page asks
 * for whatever the shopper typed and its own fixture lookup returns undefined
 * for a miss — an error status would make the client fall back to the demo
 * tracking page and show a *fictional* parcel for a mistyped number, which is
 * worse than showing nothing.
 */
export async function tracking(number, { user = null, customer = null, phone = '' } = {}) {
  const order = await Order.findOne({ number: String(number ?? '').toUpperCase() })
  if (!order) return null

  let verified = false

  // 1. Staff users always have verified full access
  if (user && isStaffUser(user.role)) {
    verified = true
  }

  // 2. Customer owns the order (account match)
  if (!verified && (customer || user)) {
    const customerId = String(customer?._id || user?.customer || '')
    const orderCustomerId = String(order.customer?._id || order.customer || '')
    if (customerId && orderCustomerId && customerId === orderCustomerId) {
      verified = true
    }
    if (!verified && user?.email && order.address?.email) {
      if (user.email.toLowerCase() === order.address.email.toLowerCase()) {
        verified = true
      }
    }
  }

  // 3. Mobile phone verification (digits match exact or last 4/10 digits)
  if (!verified && phone) {
    const cleanInput = String(phone).replace(/\D/g, '')
    const cleanOrderPhone = String(order.address?.phone || '').replace(/\D/g, '')
    if (cleanInput.length >= 4 && cleanOrderPhone.length >= 4) {
      if (
        cleanInput === cleanOrderPhone ||
        cleanOrderPhone.endsWith(cleanInput) ||
        cleanInput.endsWith(cleanOrderPhone) ||
        (cleanInput.length >= 10 && cleanOrderPhone.slice(-10) === cleanInput.slice(-10))
      ) {
        verified = true
      }
    }
  }

  return publicTracking(order, { verified })
}

/* ──────────────────────────────────────────────────────────── writes ──── */

/**
 * Move an order along its path.
 *
 * Cancelling returns the stock the order took, inside the same transaction that
 * writes the status — an order marked Cancelled while its units stayed off the
 * shelf is a shelf that quietly under-counts for ever.
 */
export async function setStatus(idOrNumber, status, { actor = null, note = '', tracking = null } = {}) {
  const order = await findOrder(idOrNumber, { populate: false })
  assertTransition(order, status)

  const session = await mongoose.startSession()
  try {
    await session.withTransaction(async () => {
      if (status === 'Cancelled' && order.stockApplied) {
        await restoreForOrder(order, session, actor)
        order.stockApplied = false
      }
      order.status = status
      if (note) order.notes = order.notes ? `${order.notes}\n${note}` : note
      if (tracking) {
        if (!order.tracking) order.tracking = {}
        if (tracking.courier !== undefined) order.tracking.courier = tracking.courier
        if (tracking.awb !== undefined) order.tracking.awb = tracking.awb
        if (tracking.expectedDelivery !== undefined) order.tracking.expectedDelivery = tracking.expectedDelivery
        if (tracking.transitNote !== undefined) order.tracking.transitNote = tracking.transitNote
        if (tracking.sealNote !== undefined) order.tracking.sealNote = tracking.sealNote
      }
      if (status === 'Packed') {
        order.shipmentEvents.push({
          title: 'Packed & Sealed',
          description: 'Bottles hand-inspected, wrapped in shockproof bubble packaging, and sealed with tamper-proof band at atelier.',
          at: new Date(),
        })
      } else if (status === 'Shipped') {
        const courierName = order.tracking?.courier || tracking?.courier || ''
        const awbNumber = order.tracking?.awb || tracking?.awb || ''
        const desc = courierName
          ? `Dispatched via ${courierName}${awbNumber ? ` (AWB / Tracking: ${awbNumber})` : ''}. Parcel is en route to destination hub.`
          : 'Dispatched from atelier to courier logistics partner.'
        order.shipmentEvents.push({
          title: 'Dispatched / In Transit',
          description: desc,
          at: new Date(),
        })
      } else if (status === 'Delivered') {
        const customerName = order.address?.name || 'Customer'
        const city = order.address?.city ? ` in ${order.address.city}` : ''
        order.shipmentEvents.push({
          title: 'Delivered',
          description: `Package delivered successfully to ${customerName}${city}. Tamper-evident seal verified.`,
          at: new Date(),
        })
      } else if (status === 'Cancelled') {
        order.shipmentEvents.push({
          title: 'Order Cancelled',
          description: note ? `Order cancelled: ${note}` : 'Order cancelled before dispatch.',
          at: new Date(),
        })
      }
      await order.save({ session })
    })
  } finally {
    await session.endSession()
  }

  await logOrder(`Order ${order.number} moved to ${status}.`, {
    actor: actor?.name ?? 'Fulfilment',
    actorUser: actor?._id ?? null,
    target: order.number,
  })

  return order
}

/**
 * Void a counter bill.
 *
 * A shop bill is born `Delivered`, which the fulfilment path treats as final —
 * and for a parcel it is. At the counter, though, a wrong line or a customer
 * who changes their mind at the till is routine, so a bill has its own way back:
 * the bottles return to the shelf, the payment is marked refunded and the bill
 * is cancelled, all in one transaction. Only shop bills may be voided here; an
 * online order goes through `setStatus` and its own rules.
 */
export async function voidShopBill(idOrNumber, { actor = null, reason = '' } = {}) {
  const order = await findOrder(idOrNumber, { populate: false })
  if (order.channel !== 'Shop') {
    throw conflict(`${order.number} is not a shop bill — cancel it from the order book instead.`)
  }
  if (order.status === 'Cancelled') throw conflict(`Bill ${order.number} is already void.`)

  const session = await mongoose.startSession()
  try {
    await session.withTransaction(async () => {
      if (order.stockApplied) {
        await restoreForOrder(order, session, actor?._id ?? null)
        order.stockApplied = false
      }
      order.status = 'Cancelled'
      order.payment.status = 'Refunded'
      const line = `Voided by ${actor?.name ?? 'staff'}${reason ? `: ${reason}` : '.'}`
      order.notes = order.notes ? `${order.notes}\n${line}` : line
      await order.save({ session })
    })
  } finally {
    await session.endSession()
  }

  await logAlert(`Shop bill ${order.number} voided — ₹${(order.pricing?.total ?? 0).toLocaleString('en-IN')} refunded, stock returned.`, {
    actor: actor?.name ?? 'Counter',
    actorUser: actor?._id ?? null,
    target: order.number,
  })

  return order
}

/** Record a payment status change, or a reference against it. */
export async function setPayment(idOrNumber, patch = {}) {
  const order = await findOrder(idOrNumber, { populate: false })
  if (patch.status !== undefined) order.payment.status = patch.status
  if (patch.method !== undefined) order.payment.method = patch.method
  if (patch.txnRef !== undefined) order.payment.txnRef = patch.txnRef
  await order.save()
  return order
}

/** Set the courier details the tracking page renders. */
export async function setTracking(idOrNumber, patch = {}) {
  const order = await findOrder(idOrNumber, { populate: false })
  const fields = ['courier', 'awb', 'expectedDelivery', 'transitNote', 'sealNote']
  for (const field of fields) {
    if (patch[field] !== undefined) order.tracking[field] = patch[field]
  }
  await order.save()
  return order
}

/** Append a scan event to the parcel's custody history. */
export async function addShipmentEvent(idOrNumber, { title, description = '', at = new Date() }) {
  const order = await findOrder(idOrNumber, { populate: false })
  order.shipmentEvents.push({ title, description, at })
  await order.save()
  return order
}

/** Staff-only notes on an order. */
export async function setNotes(idOrNumber, notes) {
  const order = await findOrder(idOrNumber, { populate: false })
  order.notes = String(notes ?? '')
  await order.save()
  return order
}

/** Counts for the dashboard, and the shop's own order history for a patron. */
export async function countForCustomer(customerId) {
  const [orders, spend, latest] = await Promise.all([
    Order.countDocuments({ customer: customerId }),
    Order.aggregate([
      { $match: { customer: new mongoose.Types.ObjectId(String(customerId)), status: { $ne: 'Cancelled' } } },
      { $group: { _id: null, total: { $sum: '$pricing.total' } } },
    ]),
    Order.findOne({ customer: customerId }).sort({ placedAt: -1 }).select('placedAt'),
  ])

  return { orders, spent: spend[0]?.total ?? 0, lastOrder: latest?.placedAt ?? null }
}

/** Live order counts per status, for the admin's tabs. */
export async function countsByStatus() {
  const rows = await Order.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }])
  return Object.fromEntries(rows.map((row) => [row._id, row.count]))
}

const UPI_PATTERN = /^[a-zA-Z0-9.\-_]{2,64}@[a-zA-Z0-9]{2,32}$/

/**
 * Customer-initiated cancellation.
 *
 * Allowed strictly BEFORE parcel is packed (`status === 'Pending'`).
 * Prepaid orders (Razorpay / UPI / Card / Net Banking) require a valid UPI ID
 * so the shop owner can manually transfer the refund via the Owner Refund Requests page.
 */
export async function cancelByCustomer(customerId, orderNumber, { upiId = '', reason = '' } = {}) {
  const number = String(orderNumber ?? '').trim().toUpperCase()
  const order = await Order.findOne({ number, customer: customerId })
  if (!order) throw notFound(`No order matches “${number}”.`)

  if (order.status === 'Cancelled') {
    throw conflict(`Order ${order.number} is already cancelled.`)
  }
  if (order.status !== 'Pending') {
    throw conflict('Cancellation closed: once your parcel is Packed or Shipped, it cannot be cancelled.')
  }

  const isCod = String(order.payment?.method ?? '').trim().toUpperCase() === 'COD'
  const isPrepaid = order.payment?.status === 'Paid' && !isCod
  const cleanUpi = String(upiId ?? '').trim()
  const cleanReason = String(reason ?? '').trim()

  if (isPrepaid && !UPI_PATTERN.test(cleanUpi)) {
    throw unprocessable('Please enter a valid UPI ID (e.g. name@okaxis or 9876543210@ybl) so the owner can refund your payment.')
  }

  const refundAmount = isPrepaid ? Number(order.pricing?.total) || 0 : 0

  let committedOrder = null
  const session = await mongoose.startSession()
  try {
    await session.withTransaction(async () => {
      // Reload fresh inside the transaction so transient retries never observe
      // aborted in-memory mutations (such as stockApplied=false or doubled notes).
      const txOrder = await Order.findById(order._id).session(session)
      if (!txOrder) throw notFound(`No order matches “${order.number}”.`)
      if (txOrder.status !== 'Pending') {
        throw conflict(`Order ${txOrder.number} is already ${txOrder.status.toLowerCase()} and can no longer be cancelled online.`)
      }

      if (txOrder.stockApplied) {
        await restoreForOrder(txOrder, session, null)
        txOrder.stockApplied = false
      }
      txOrder.status = 'Cancelled'
      txOrder.refund = {
        status: isPrepaid ? 'Requested' : 'None',
        upiId: isPrepaid ? cleanUpi : '',
        amount: refundAmount,
        reason: cleanReason || 'Cancelled by customer before packing',
        requestedAt: new Date(),
        processedAt: null,
        processedBy: '',
        referenceNote: '',
      }
      if (cleanReason) {
        txOrder.notes = txOrder.notes
          ? `${txOrder.notes}\nCustomer cancelled: ${cleanReason}`
          : `Customer cancelled: ${cleanReason}`
      }
      txOrder.shipmentEvents.push({
        title: 'Order Cancelled',
        description: isPrepaid
          ? `Order cancelled by customer before packing. Full manual UPI refund requested to ${cleanUpi}.`
          : 'Order cancelled by customer before packing.',
        at: new Date(),
      })
      // Reverse loyalty points adjustment on cancellation
      const hadReward = (txOrder.items ?? []).some((item) => item.unitPrice === 0 && item.slug === 'pure-artisan-attar-5ml')
      let pointAdjustment = 0
      if (hadReward) pointAdjustment += LOYALTY_REWARD_POINTS_COST
      if ((txOrder.pricing?.total ?? 0) >= LOYALTY_ORDER_THRESHOLD) pointAdjustment -= LOYALTY_POINTS_PER_ORDER
      if (pointAdjustment !== 0 && txOrder.customer) {
        await Customer.updateOne(
          { _id: txOrder.customer },
          { $inc: { loyaltyPoints: pointAdjustment } },
        ).session(session)
      }

      await txOrder.save({ session })
      committedOrder = txOrder
    })
  } finally {
    await session.endSession()
  }

  if (committedOrder) {
    order.stockApplied = committedOrder.stockApplied
    order.status = committedOrder.status
    order.refund = committedOrder.refund
    order.notes = committedOrder.notes
  }

  if (isPrepaid) {
    await logAlert(
      `Refund requested on cancelled order ${order.number} — ₹${refundAmount.toLocaleString('en-IN')} to UPI ${cleanUpi}.`,
      { actor: order.address?.name || 'Customer', target: order.number },
    )
  } else {
    await logOrder(`COD order ${order.number} cancelled by customer before packing.`, {
      actor: order.address?.name || 'Customer',
      target: order.number,
    })
  }

  return publicOrder(order)
}

/** Owner-only list of prepaid order refund requests. */
export async function listRefundRequests() {
  const docs = await Order.find({ 'refund.status': { $in: ['Requested', 'Refunded', 'Rejected'] } })
    .populate('customer', 'name email phone')
    .sort({ 'refund.requestedAt': -1, updatedAt: -1 })
    .lean()

  const requests = docs.map((doc) => {
    const cust = doc.customer && typeof doc.customer === 'object' ? doc.customer : null
    const amount = Number(doc.refund?.amount) || Number(doc.pricing?.total) || 0
    return {
      orderId: doc.number,
      placedAt: doc.placedAt,
      customerName: doc.address?.name || cust?.name || 'Customer',
      customerPhone: doc.address?.phone || cust?.phone || '',
      customerEmail: doc.address?.email || realEmailOf(cust),
      paymentMethod: doc.payment?.method ?? '',
      paymentStatus: doc.payment?.status ?? '',
      txnRef: doc.payment?.txnRef ?? '',
      amount,
      upiId: doc.refund?.upiId ?? '',
      reason: doc.refund?.reason ?? '',
      status: doc.refund?.status ?? 'Requested',
      requestedAt: doc.refund?.requestedAt ?? doc.updatedAt,
      processedAt: doc.refund?.processedAt ?? null,
      processedBy: doc.refund?.processedBy ?? '',
      referenceNote: doc.refund?.referenceNote ?? '',
      items: (doc.items ?? []).map((item) => `${item.qty} × ${item.name} (${item.volume})`),
    }
  })

  const pending = requests.filter((r) => r.status === 'Requested')
  const refunded = requests.filter((r) => r.status === 'Refunded')
  const rejected = requests.filter((r) => r.status === 'Rejected')

  return {
    requests,
    summary: {
      pendingCount: pending.length,
      pendingAmount: pending.reduce((sum, r) => sum + r.amount, 0),
      refundedCount: refunded.length,
      refundedAmount: refunded.reduce((sum, r) => sum + r.amount, 0),
      rejectedCount: rejected.length,
    },
  }
}

/** Owner-only manual refund completion or rejection (after UPI transfer). */
export async function processRefundRequest(orderNumber, { action, referenceNote = '', actor = null } = {}) {
  const number = String(orderNumber ?? '').trim().toUpperCase()
  const order = await Order.findOne({ number }).populate('customer', 'name email phone')
  if (!order) throw notFound(`No order matches “${number}”.`)

  if (order.refund?.status !== 'Requested') {
    throw conflict(`Refund on order ${order.number} is ${order.refund?.status ?? 'None'}, not Pending.`)
  }

  const approve = action === 'complete'
  order.refund.status = approve ? 'Refunded' : 'Rejected'
  order.refund.processedAt = new Date()
  order.refund.processedBy = actor?.name || 'Owner'
  order.refund.referenceNote = String(referenceNote ?? '').trim()
  if (approve) {
    order.payment.status = 'Refunded'
  }
  await order.save()

  const amount = Number(order.refund.amount) || Number(order.pricing?.total) || 0
  await logAlert(
    approve
      ? `Manual refund of ₹${amount.toLocaleString('en-IN')} completed for ${order.number} (${order.refund.upiId}) · Ref: ${order.refund.referenceNote}.`
      : `Refund request rejected for ${order.number} — ${order.refund.referenceNote}.`,
    { actor: actor?.name || 'Owner', actorUser: actor?._id ?? null, target: order.number },
  )

  const customerEmail = order.address?.email || realEmailOf(order.customer)
  if (approve && customerEmail) {
    sendLoggedEmail({
      to: customerEmail,
      recipientName: order.address?.name || order.customer?.name || 'Customer',
      phone: order.address?.phone || order.customer?.phone || '',
      customerId: order.customer?._id ?? null,
      kind: 'order-confirmation',
      subject: `Refund Completed for Order ${order.number} (₹${amount.toLocaleString('en-IN')})`,
      html: `<p>Namaste <strong>${order.address?.name || 'Customer'}</strong>,</p><p>Your manual refund of <strong>₹${amount.toLocaleString('en-IN')}</strong> for cancelled order <strong>${order.number}</strong> has been transferred to your UPI ID <strong>${order.refund.upiId}</strong>.</p><p>Reference / UTR: <strong>${order.refund.referenceNote}</strong></p>`,
      text: `Namaste, your refund of Rs.${amount} for cancelled order ${order.number} has been sent to UPI ID ${order.refund.upiId}. Ref/UTR: ${order.refund.referenceNote}.`,
      sentBy: actor?.name || 'Owner',
    }).catch(() => {})
  }

  return order
}

/**
 * Calculate pricing and initiate a server-to-server Razorpay order.
 */
export async function prepareRazorpayOrder(input, { customer }) {
  if (!customer) throw unprocessable('An order needs a customer.')
  if (!input.items?.length) throw unprocessable('An order needs at least one item.')

  const resolved = []
  for (const line of input.items) resolved.push(await resolveLine(line, { counter: false }))
  const items = resolved.map((entry) => entry.item)

  const stored = await getPricing()
  let coupon = null
  if (input.couponCode) {
    coupon = await Coupon.findOne({ code: String(input.couponCode).trim().toUpperCase() })
    if (!coupon || !coupon.isLive()) {
      coupon = null
    }
  }

  const pricing = priceOrder({ items, coupon, giftWrap: Boolean(input.giftWrap), rule: stored })
  const amountInPaise = Math.round(pricing.total * 100)

  const rzp = await createRazorpayOrder({
    amountInPaise,
    currency: 'INR',
    receipt: `rcpt_${Date.now().toString(36)}`,
    notes: {
      customerEmail: customer.email,
      customerName: customer.name || 'Customer',
      itemsCount: items.length,
    },
  })

  return {
    orderId: rzp.orderId,
    amount: rzp.amount,
    currency: rzp.currency,
    keyId: rzp.keyId,
    payable: pricing.total,
  }
}

export default {
  place,
  prepareRazorpayOrder,
  adminList,
  adminOne,
  forCustomer,
  publicOne,
  publicOneFor,
  tracking,
  setStatus,
  voidShopBill,
  setPayment,
  setTracking,
  addShipmentEvent,
  setNotes,
  cancelByCustomer,
  listRefundRequests,
  processRefundRequest,
  countForCustomer,
  countsByStatus,
  allowedTransitions,
  canTransition,
}
