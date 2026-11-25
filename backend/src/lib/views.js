import { isoDay, istLabel, istStamp } from './format.js'
import { isSyntheticEmail, normalizeEmail, realEmailOf, WALK_IN_EMAIL } from './identity.js'
import { TIMELINE_STAGES } from '../models/Order.js'
import { onlineStockOf } from '../models/Product.js'
import { barcodeRecord } from './barcode.js'

/**
 * One document, two shapes.
 *
 * Every entity here is read by both frontends, and they describe the same thing
 * differently. The admin's product carries `cost`, `stock` and `salesYtd`; the
 * storefront's carries `reviewCount` and a `volumes` ladder and must never see
 * unit cost. The storefront's customer is a first name and a stats block; the
 * admin's is a lifetime-spend record with staff notes. So each serializer below
 * is the *contract for one consumer*, and the model is the single row underneath.
 *
 * The important property is negative: **`publicProduct()` must not emit `cost`.**
 * Unit cost is the house's margin. Serving the raw document to `/api/products`
 * would publish it to anyone who opens the network tab.
 */

/** A populated ref's display name, tolerating an unpopulated ObjectId. */
const nameOf = (value) => (value && typeof value === 'object' && 'name' in value ? value.name : null)
const idOf = (value) => {
  if (!value) return null
  return String(value._id ?? value)
}

/* ───────────────────────────────────────────────────────────── products ──── */

/**
 * The storefront's product record.
 *
 * Field for field what `frontend/src/data/products.js` holds, so a page that
 * reads `product.volumes[0].price` or `product.reviewCount` keeps working.
 * `price` and `mrp` are the **first** volume's — the "from ₹8,999" figure the
 * shop quotes — as the storefront itself derives them.
 *
 * @param {object} doc a Product, with `brand` and `category` populated
 * @param {{rating: number, reviewCount: number}} [stats] from the reviews collection
 */
export function publicProduct(doc, stats = null) {
  const volume = doc.volumes?.[0] ?? null
  const rating = stats?.rating ?? fallbackRating(doc)
  const reviewCount = stats?.reviewCount ?? doc.ratingBaseline?.count ?? 0

  return {
    id: String(doc._id),
    slug: doc.slug,
    name: doc.name,
    brand: nameOf(doc.brand) ?? '',
    tier: doc.tier,
    gender: doc.gender,
    family: doc.family,
    concentration: doc.concentration,
    tagline: doc.tagline,
    description: doc.description,
    notes: {
      top: doc.notes?.top ?? [],
      heart: doc.notes?.heart ?? [],
      base: doc.notes?.base ?? [],
    },
    volumes: (doc.volumes ?? []).map((entry) => ({
      size: entry.size,
      price: entry.price,
      mrp: entry.mrp,
      label: entry.label,
    })),
    price: volume?.price ?? doc.listPrice ?? 0,
    mrp: volume?.mrp ?? doc.listMrp ?? 0,
    rating,
    reviewCount,
    badges: doc.badges ?? [],
    longevity: doc.longevity,
    projection: doc.projection,
    // Derived, not stored — and from what the website may sell, not from the
    // raw shelf. Units held back for the shop counter are not on offer here, so
    // a shopper sees 16 left when the shelf holds 20 and the shop keeps 4.
    // `shopReserve` itself is never published.
    inStock: onlineStockOf(doc) > 0,
    stockLeft: onlineStockOf(doc),
    sku: doc.sku,
    batch: doc.batch,
    origin: doc.origin,
    bestseller: doc.bestseller,
    featured: doc.featured,
    status: doc.status,
    comingSoon: doc.status === 'Draft',
    collections: doc.collections ?? [],
    occasions: doc.occasions ?? [],
    images: (doc.images ?? []).map((image) => publicMedia(image)),
  }
}

/** The admin's product record — adds what only staff may see. */
export function adminProduct(doc, stats = null) {
  const rating = stats?.rating ?? fallbackRating(doc)
  const reviewCount = stats?.reviewCount ?? doc.ratingBaseline?.count ?? 0

  return {
    id: String(doc._id),
    slug: doc.slug,
    name: doc.name,
    brand: nameOf(doc.brand) ?? '',
    category: nameOf(doc.category) ?? '',
    brandId: idOf(doc.brand),
    categoryId: idOf(doc.category),
    tier: doc.tier,
    gender: doc.gender,
    family: doc.family,
    concentration: doc.concentration,
    description: doc.description,
    /**
     * The three descriptive fields below are emitted here for a reason worth
     * stating, because their absence was a real bug rather than an oversight in
     * a comment.
     *
     * `adminApi.productBody()` writes `tagline`, `longevity` and `projection` on
     * every save — the field list and this one are supposed to be two views of
     * the same record. They were not: this function omitted all three, so the
     * admin's edit form loaded a fragrance, found no `tagline` to show, and sent
     * an empty string back on save. **Editing a fragrance silently erased its
     * tagline, longevity and projection.** A field the panel may write is a
     * field the panel must be able to read.
     */
    tagline: doc.tagline,
    longevity: doc.longevity,
    projection: doc.projection,
    notes: {
      top: doc.notes?.top ?? [],
      heart: doc.notes?.heart ?? [],
      base: doc.notes?.base ?? [],
    },
    volumes: (doc.volumes ?? []).map((entry) => ({ size: entry.size, price: entry.price, mrp: entry.mrp, label: entry.label })),
    sku: doc.sku,
    /**
     * The staff barcode — **admin only, deliberately absent from
     * `publicProduct()` above.** It is the shop's own shelf code, not something
     * a shopper has any use for, and publishing it would put the internal
     * numbering of the stockroom into a page source anyone can read.
     *
     * Emitted as a whole record rather than a bare string because the symbology
     * is part of the fact: a label printed as Code 128 and one printed as EAN-13
     * are different artifacts, and a renderer handed only the digits would have
     * to guess which to draw. `humanReadable` is the line printed under the bars,
     * which for this scheme is the value itself.
     */
    barcode: doc.barcode ? barcodeRecord(doc.barcode) : null,
    /** The house's headline price, not the first volume's — see the model. */
    price: doc.listPrice,
    mrp: doc.listMrp,
    cost: doc.cost,
    stock: doc.stock,
    /** Held back for the counter; the storefront sells only `onlineStock`. */
    shopReserve: doc.shopReserve ?? 0,
    onlineStock: onlineStockOf(doc),
    safeLimit: doc.safeLimit,
    status: doc.status,
    salesYtd: doc.salesYtd,
    lastCompounded: isoDay(doc.lastCompounded),
    rating,
    reviews: reviewCount,
    badges: doc.badges ?? [],
    bestseller: doc.bestseller,
    featured: doc.featured,
    collections: doc.collections ?? [],
    occasions: doc.occasions ?? [],
    images: (doc.images ?? []).map((image) => publicMedia(image)),
    batch: doc.batch,
    origin: doc.origin,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  }
}

/** Rating from the opening balance alone, for a product with no live reviews. */
function fallbackRating(doc) {
  const { count = 0, sum = 0 } = doc.ratingBaseline ?? {}
  return count > 0 ? Math.round((sum / count) * 10) / 10 : 0
}

/* ─────────────────────────────────────────────────────────── taxonomy ──── */

/** A storefront facet: `{id, label, slug, count, blurb}`. */
export const publicCategory = (doc, count = 0) => ({
  id: doc.key ?? doc.slug,
  label: doc.name,
  slug: doc.slug,
  count,
  blurb: doc.description,
})

/** An editorial shelf, as the admin's Categories table holds it. */
export const adminCategory = (doc) => ({
  id: String(doc._id),
  name: doc.name,
  slug: doc.slug,
  description: doc.description,
  status: doc.status,
  shelf: doc.shelf,
})

/** A storefront brand: `{id, name, short, count, origin, logo}`. */
export const publicBrand = (doc, count = 0) => ({
  id: String(doc._id),
  name: doc.name,
  short: doc.short || doc.name,
  count,
  origin: doc.origin || doc.country,
  logo: doc.logo || '',
})

export const adminBrand = (doc) => ({
  id: String(doc._id),
  name: doc.name,
  slug: doc.slug,
  house: doc.house,
  country: doc.country,
  status: doc.status,
  since: doc.since,
  logo: doc.logo || '',
})

/* ────────────────────────────────────────────────────────────── media ──── */

export function publicMedia(doc) {
  if (!doc || typeof doc !== 'object') return null
  return {
    id: String(doc._id ?? ''),
    url: doc.secureUrl,
    alt: doc.alt ?? '',
    caption: doc.caption ?? '',
    width: doc.width ?? null,
    height: doc.height ?? null,
    format: doc.format ?? '',
    bytes: doc.bytes ?? 0,
  }
}

/* ────────────────────────────────────────────────────────── customers ──── */

const initialsOf = (name = '') =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('')

/** An address as the storefront's account pages read it. */
export const publicAddress = (doc) => ({
  id: String(doc._id),
  tag: doc.tag,
  name: doc.name,
  phone: doc.phone,
  line1: doc.line1,
  line2: doc.line2,
  area: doc.area,
  city: doc.city,
  district: doc.district,
  state: doc.state,
  pincode: doc.pincode,
  type: doc.type,
  isDefault: doc.isDefault,
})

/**
 * The signed-in patron's own view.
 *
 * `tier` and `memberSince` are the storefront's names for what the admin calls
 * `loyaltyTier` and `joined` — the same values, so both are emitted rather than
 * picking a winner and breaking one of the two apps.
 *
 * `stats` is counted from the other collections, never stored: the storefront
 * fixture types it in (`stats: {orders: 14, …}`) and it would be wrong the first
 * time someone placed an order.
 */
export function publicCustomer(doc, stats = {}) {
  const address = doc.addresses?.find((entry) => entry.isDefault) ?? doc.addresses?.[0] ?? null
  const parts = String(doc.name ?? '').trim().split(/\s+/)
  return {
    id: String(doc._id),
    name: doc.name,
    firstName: parts[0] ?? doc.name,
    lastName: parts.slice(1).join(' '),
    email: doc.email,
    phone: doc.phone,
    city: doc.city ?? '',
    tier: doc.loyaltyTier,
    loyaltyTier: doc.loyaltyTier,
    loyaltyPoints: doc.loyaltyPoints,
    memberSince: isoDay(doc.joined),
    joined: isoDay(doc.joined),
    preferredAccord: doc.preferredAccord,
    defaultAddressId: address ? String(address._id) : null,
    avatarInitials: initialsOf(doc.name),
    stats: {
      orders: stats.orders ?? doc.lifetime?.openingOrders ?? 0,
      reviews: stats.reviews ?? 0,
      wishlist: doc.wishlist?.length ?? 0,
    },
  }
}

/**
 * The admin's customer record.
 *
 * `orders` and `totalSpent` are the opening balance **plus** what is in the order
 * book — see the note on the Customer model for why the fixture's lifetime
 * figures cannot simply be summed.
 */
export function adminCustomer(doc, stats = {}, { staff = false } = {}) {
  const displayEmail =
    doc.email === WALK_IN_EMAIL ? doc.email : isSyntheticEmail(doc.email) ? '' : doc.email
  return {
    id: String(doc._id),
    name: doc.name,
    email: displayEmail,
    phone: doc.phone,
    city: doc.city,
    status: doc.status,
    /** True when a staff login owns this patron profile — see `customers.setStatus`. */
    staff,
    isWalkIn: doc.email === WALK_IN_EMAIL || isSyntheticEmail(doc.email) || String(doc.name || '').toLowerCase().includes('walk-in'),
    channel: 'Website',
    loyaltyTier: doc.loyaltyTier,
    loyaltyPoints: doc.loyaltyPoints,
    orders: (doc.lifetime?.openingOrders ?? 0) + (stats.orders ?? 0),
    totalSpent: (doc.lifetime?.openingSpent ?? 0) + (stats.spent ?? 0),
    lastOrder: isoDay(stats.lastOrder ?? doc.lifetime?.lastOrder),
    joined: isoDay(doc.joined),
    notes: doc.notes,
    addresses: (doc.addresses ?? []).map((entry) => ({
      id: String(entry._id),
      tag: entry.tag,
      line1: entry.line1,
      line2: entry.line2,
      city: entry.city,
      state: entry.state,
      pincode: entry.pincode,
      isDefault: entry.isDefault,
    })),
  }
}

/** The account block on `/api/auth/me`, which the storefront persists. */
export const sessionUser = (user) => ({
  id: String(user._id),
  email: user.email,
  username: user.username || '',
  name: user.name,
  role: user.role,
  isStaff: user.role !== 'shopper',
  isEmailVerified: Boolean(user.isEmailVerified),
  customerId: idOf(user.customer),
  /**
   * Whether this account has a password of its own, so the account page can offer
   * "Set a password" to someone who signed up with Google and "Change password"
   * to everyone else.
   *
   * `passwordHash` is `select: false`, so this is only meaningful on a document
   * that was explicitly loaded with it — `loadSession` and the sign-in paths all
   * are. A false reading on a password account would show the wrong control, so
   * absent means "no password **known** here", which is what the account page
   * treats as a reason to describe what it sees rather than what it should be.
   */
  hasPassword: Boolean(user.passwordHash),
  authProvider: user.authProvider ?? (user.googleId ? 'both' : 'password'),
})

/* ───────────────────────────────────────────────────────────── orders ──── */

/**
 * The shopper's word for an order's state.
 *
 * The admin works the fulfilment path and the storefront shows the shopper
 * something warmer — "Mixing in Lab" for a bespoke commission still in the
 * studio, "In Transit" for a dispatched parcel. These are exactly the keys in
 * `ORDER_STATUS` in `frontend/src/data/account.js`, derived from the canonical
 * status rather than stored beside it.
 */
export function shopperStatus(order) {
  switch (order.status) {
    case 'Pending':
      return 'Order Confirmed'
    case 'Packed':
      return 'Packaging'
    case 'Shipped':
      return 'In Transit'
    case 'Delivered':
      return 'Delivered'
    case 'Cancelled':
      return 'Cancelled'
    default:
      return order.status
  }
}

/** One order as the storefront's account page lists it. */
export function publicOrder(doc) {
  const payMethod = doc.payment?.method ?? ''
  const payStatus = doc.payment?.status ?? 'Paid'
  const isCod = String(payMethod).trim().toUpperCase() === 'COD'
  return {
    id: doc.number,
    date: isoDay(doc.placedAt),
    status: shopperStatus(doc),
    rawStatus: doc.status,
    canCancel: doc.status === 'Pending' && doc.channel !== 'Shop',
    paymentMethod: payMethod,
    paymentStatus: payStatus,
    isPrepaid: payStatus === 'Paid' && !isCod,
    refund: {
      status: doc.refund?.status ?? 'None',
      upiId: doc.refund?.upiId ?? '',
      amount: doc.refund?.amount ?? 0,
      reason: doc.refund?.reason ?? '',
      requestedAt: doc.refund?.requestedAt ?? null,
      processedAt: doc.refund?.processedAt ?? null,
      referenceNote: doc.refund?.referenceNote ?? '',
    },
    items: (doc.items ?? []).map((item) => {
      let image = item.image ?? ''
      if ((!image || image.startsWith('/api/uploads/')) && item.product?.images?.[0]) {
        image = item.product.images[0].secureUrl || item.product.images[0].url || image
      }
      return {
        name: item.name,
        slug: item.slug,
        // The shot frozen onto the line at placement. Falls back to product photography
        // if the line image is missing or was saved under local ephemeral storage.
        image,
        volume: item.volume,
        qty: item.qty,
        price: item.unitPrice,
      }
    }),
    total: doc.pricing?.total ?? 0,
    trackingId: ['Shipped', 'Delivered'].includes(doc.status) ? doc.tracking?.awb || doc.number : null,
    canTrack: ['Shipped', 'Delivered'].includes(doc.status),
    courier: doc.tracking?.courier ?? '',
    awb: doc.tracking?.awb ?? '',
    tracking: {
      courier: doc.tracking?.courier ?? '',
      awb: doc.tracking?.awb ?? '',
      expectedDelivery: doc.tracking?.expectedDelivery ?? null,
      transitNote: doc.tracking?.transitNote ?? '',
    },
  }
}

/** One order as the admin's Orders table and drawer read it. */
export function adminOrder(doc) {
  const items = (doc.items ?? []).map((item) => {
    let image = item.image ?? ''
    if ((!image || image.startsWith('/api/uploads/')) && item.product?.images?.[0]) {
      image = item.product.images[0].secureUrl || item.product.images[0].url || image
    }
    return {
      name: item.name,
      sku: item.sku,
      slug: item.slug,
      image,
      volume: item.volume,
      qty: item.qty,
      price: item.unitPrice,
      total: item.lineTotal,
    }
  })

  return {
    id: doc.number,
    date: isoDay(doc.placedAt),
    placedAt: doc.placedAt,
    // A counter bill files under the walk-in record unless a patron was picked,
    // so the name typed at the till is the more useful one to show.
    customer:
      doc.channel === 'Shop'
        ? doc.address?.name || nameOf(doc.customer) || 'Walk-in Customer'
        : (nameOf(doc.customer) ?? doc.address?.name ?? ''),
    customerId: idOf(doc.customer),
    email: normalizeEmail(doc.address?.email) || realEmailOf(doc.customer),
    phone: doc.address?.phone ?? '',
    city: doc.address?.city ?? '',
    items,
    subtotal: doc.pricing?.subtotal ?? 0,
    discount: doc.pricing?.discount ?? 0,
    shipping: doc.pricing?.shipping ?? 0,
    gst: doc.pricing?.gst ?? 0,
    gstRate: doc.pricing?.rule?.gstRate ?? 18,
    amount: doc.pricing?.total ?? 0,
    status: doc.status,
    payment: doc.payment?.status ?? 'Paid',
    paymentMethod: doc.payment?.method ?? '',
    txnRef: doc.payment?.txnRef ?? '',
    channel: doc.channel === 'Storefront' ? 'Website' : (doc.channel || 'Website'),
    cashier: doc.cashier ?? '',
    trackingId: doc.tracking?.awb || null,
    courier: doc.tracking?.courier ?? '',
    awb: doc.tracking?.awb ?? '',
    tracking: {
      courier: doc.tracking?.courier ?? '',
      awb: doc.tracking?.awb ?? '',
      expectedDelivery: doc.tracking?.expectedDelivery ?? null,
      transitNote: doc.tracking?.transitNote ?? '',
      sealNote: doc.tracking?.sealNote ?? '',
    },
    itemCount: items.reduce((sum, item) => sum + item.qty, 0),
    notes: doc.notes,
    refund: {
      status: doc.refund?.status ?? 'None',
      upiId: doc.refund?.upiId ?? '',
      amount: doc.refund?.amount ?? 0,
      reason: doc.refund?.reason ?? '',
      requestedAt: doc.refund?.requestedAt ?? null,
      processedAt: doc.refund?.processedAt ?? null,
      processedBy: doc.refund?.processedBy ?? '',
      referenceNote: doc.refund?.referenceNote ?? '',
    },
  }
}

/** Icons per custody stage, matching the tracking page's own vocabulary. */
const STAGE_ICONS = ['check', 'flask', 'truck', 'scooter', 'mail']
const STAGE_DESCRIPTIONS = [
  'Payment verified & order confirmed.',
  'Packed, checked and sealed by Raheman Perfumes.',
  'Dispatched from Raheman Perfumes atelier.',
  'Courier on the way in safe heat-protected packing.',
  'Handed over at your doorstep with tamper-safe seal.',
]

/**
 * The public tracking page's whole payload.
 *
 * The five-stage custody timeline is **derived** from the canonical status, not
 * stored: a stored timeline is a second copy of the order's state that has to be
 * kept in step by hand, and the first time they disagree the shopper sees a
 * contradiction. Scan events are the one thing that is genuinely new
 * information, so those are rows (`shipmentEvents`) and the timeline is built
 * from them.
 */
function maskName(name) {
  if (!name) return 'Valued Customer'
  const parts = String(name).trim().split(/\s+/)
  return parts
    .map((p) => {
      if (p.length <= 1) return p
      return p[0] + '*'.repeat(Math.min(4, p.length - 1))
    })
    .join(' ')
}

function maskPhone(phone) {
  if (!phone) return ''
  const digits = String(phone).replace(/\D/g, '')
  if (digits.length <= 4) return '••••'
  return '••••••' + digits.slice(-4)
}

export function publicTracking(doc, { verified = false } = {}) {
  const isVerified = Boolean(verified)
  const events = [...(doc.shipmentEvents ?? [])].sort((a, b) => new Date(a.at) - new Date(b.at))
  const stage = doc.status === 'Cancelled' ? -1 : TIMELINE_STAGES.length - 1 - [...TIMELINE_STAGES].reverse().indexOf(stageNameFor(doc.status))

  const timeline = TIMELINE_STAGES.map((title, index) => {
    const state = stage === -1 ? 'pending' : index < stage ? 'done' : index === stage ? 'current' : 'pending'
    const event = events[index]
    return {
      id: `stage-${index + 1}`,
      title,
      state,
      timestamp: event ? istStamp(event.at) : stage >= index ? istStamp(doc.placedAt) : 'Expected',
      description:
        index === 2 && doc.tracking?.courier
          ? `Sent via ${doc.tracking.courier}.`
          : STAGE_DESCRIPTIONS[index],
      icon: STAGE_ICONS[index],
      ...(title === 'In Transit' && doc.tracking?.awb ? { checkpoint: `Checkpoint: ${doc.tracking.awb}` } : {}),
    }
  })

  // Format real events newest first
  let checkpoints = [...events].reverse().map((event) => ({
    id: String(event._id || event.title),
    title: event.title,
    description: event.description,
    timestamp: istStamp(event.at),
  }))

  // If no explicit events were recorded (e.g. earlier orders), synthesize status-accurate checkpoints
  if (checkpoints.length === 0) {
    const isCod = ['COD', 'cod'].includes(String(doc.payment?.method || '').toLowerCase())
    const placedDate = doc.placedAt || doc.createdAt || new Date()
    const updatedDate = doc.updatedAt || placedDate
    const synthetic = []

    if (doc.status === 'Cancelled') {
      synthetic.push({
        id: 'cp-cancelled',
        title: 'Order Cancelled',
        description: 'Order cancelled before dispatch. Full refund processed if prepaid.',
        timestamp: istStamp(updatedDate),
      })
    } else if (doc.status === 'Delivered') {
      synthetic.push({
        id: 'cp-delivered',
        title: 'Delivered',
        description: isVerified
          ? `Delivered to ${doc.address?.name || 'Customer'}${doc.address?.city ? ` in ${doc.address.city}` : ''}. Tamper-evident seal intact.`
          : 'Delivered to recipient with tamper-evident seal intact.',
        timestamp: istStamp(updatedDate),
      })
      synthetic.push({
        id: 'cp-out-for-delivery',
        title: 'Out for Delivery',
        description: 'Courier delivery executive is out for delivery with your parcel.',
        timestamp: istStamp(updatedDate),
      })
      synthetic.push({
        id: 'cp-shipped',
        title: 'Dispatched / In Transit',
        description: doc.tracking?.courier
          ? `Dispatched via ${doc.tracking.courier}${doc.tracking?.awb ? ` (AWB: ${doc.tracking.awb})` : ''}. Parcel is en route.`
          : 'Handed over to courier partner for final delivery.',
        timestamp: istStamp(placedDate),
      })
      synthetic.push({
        id: 'cp-packed',
        title: 'Packed & Sealed',
        description: 'Bottles inspected and sealed in tamper-proof bubble packaging at Raheman Perfumes atelier.',
        timestamp: istStamp(placedDate),
      })
    } else if (doc.status === 'Shipped') {
      synthetic.push({
        id: 'cp-shipped',
        title: 'Dispatched / In Transit',
        description: doc.tracking?.courier
          ? `Dispatched via ${doc.tracking.courier}${doc.tracking?.awb ? ` (AWB: ${doc.tracking.awb})` : ''}. Package is in transit to destination hub.`
          : 'Handed over to courier partner. Transit updates will follow as parcel reaches sorting hub.',
        timestamp: istStamp(updatedDate),
      })
      synthetic.push({
        id: 'cp-packed',
        title: 'Packed & Sealed',
        description: 'Bottles inspected, cushioned in bubble packaging, and sealed with tamper-proof band at atelier.',
        timestamp: istStamp(placedDate),
      })
    } else if (doc.status === 'Packed') {
      synthetic.push({
        id: 'cp-packed',
        title: 'Packed & Sealed',
        description: 'Fragrance order inspected, safely packed in tamper-evident packaging, and ready for courier pickup.',
        timestamp: istStamp(updatedDate),
      })
    }

    synthetic.push({
      id: 'cp-confirmed',
      title: 'Order Confirmed',
      description: isCod
        ? 'Order placed & confirmed. Cash on Delivery scheduled for collection at delivery.'
        : 'Payment verified & order confirmed. Fragrance compounding initiated at Raheman Perfumes atelier.',
      timestamp: istStamp(placedDate),
    })

    checkpoints = synthetic
  }

  const destination = isVerified
    ? {
        name: doc.address?.name ?? '',
        line1: doc.address?.line1 ?? '',
        line2: doc.address?.line2 ?? '',
        area: doc.address?.area ?? '',
        city: doc.address?.city ?? '',
        district: doc.address?.district ?? '',
        state: doc.address?.state ?? '',
        pincode: doc.address?.pincode ?? '',
        phone: doc.address?.phone ?? '',
      }
    : null

  return {
    orderId: doc.number,
    verified: isVerified,
    placedAt: doc.placedAt,
    placedLabel: istLabel(doc.placedAt),
    consignee: isVerified ? (doc.address?.name ?? '') : 'Customer',
    status: shopperStatus(doc),
    stage: stage + 1,
    totalStages: TIMELINE_STAGES.length,
    stageLabel: stage === -1 ? 'Cancelled' : `Stage ${stage + 1} of ${TIMELINE_STAGES.length}${doc.tracking?.transitNote ? ` • ${doc.tracking.transitNote}` : ''}`,
    courier: doc.tracking?.courier ?? '',
    awb: doc.tracking?.awb ?? '',
    expectedDelivery: doc.tracking?.expectedDelivery ? istLabel(doc.tracking.expectedDelivery) : '',
    transitNote: doc.tracking?.transitNote ?? '',
    sealNote: doc.tracking?.sealNote ?? '',
    destination,
    payment: isVerified
      ? {
          method: doc.payment?.method ?? '',
          txnRef: doc.payment?.txnRef ?? '',
          status: doc.payment?.status === 'Paid' ? 'Prepaid' : (doc.payment?.status ?? ''),
        }
      : null,
    refundStatus: doc.refund?.status ?? 'None',
    // Negative, as the tracking page renders it against the subtotal.
    amounts: isVerified
      ? {
          subtotal: doc.pricing?.subtotal ?? 0,
          discount: -(doc.pricing?.discount ?? 0),
          shipping: doc.pricing?.shipping ?? 0,
          total: doc.pricing?.total ?? 0,
        }
      : null,
    itemCount: (doc.items ?? []).reduce((sum, item) => sum + (Number(item.qty) || 1), 0),
    items: isVerified
      ? (doc.items ?? []).map((item) => ({
          id: String(item._id),
          slug: item.slug,
          name: item.name,
          image: item.image ?? '',
          kind: 'Fragrance',
          volume: item.volume,
          qty: item.qty,
          price: item.unitPrice,
          meta: item.meta,
          note: item.note,
        }))
      : [],
    timeline,
    checkpoints,
    inclusions: isVerified ? (doc.inclusions ?? []) : [],
  }
}

/** Which custody stage a canonical status sits on. */
function stageNameFor(status) {
  const map = { Pending: 'Confirmed', Packed: 'Hand-Poured', Shipped: 'In Transit', Delivered: 'Handover' }
  return map[status] ?? 'Confirmed'
}

/* ──────────────────────────────────────────────────────────── reviews ──── */

/** A review as the PDP lists it — `photos` is a **number**, as the fixture has it. */
export const publicReview = (doc) => ({
  id: String(doc._id),
  name: doc.name,
  city: doc.city,
  rating: doc.rating,
  title: doc.title,
  body: doc.body,
  date: isoDay(doc.date),
  verified: doc.verified,
  photos: (doc.photoCount ?? 0) + (doc.photos?.length ?? 0),
  helpful: doc.helpful,
})

/** A review as the admin's moderation table needs it. */
export const adminReview = (doc) => ({
  ...publicReview(doc),
  product: nameOf(doc.product) ?? '',
  productSlug: doc.product?.slug ?? '',
  productId: idOf(doc.product),
  customerId: idOf(doc.customer),
  status: doc.status,
})

/* ──────────────────────────────────────────────────────────── coupons ──── */

/** A coupon as the storefront's offers page shows it. */
export const publicCoupon = (doc) => ({
  code: doc.code,
  label: doc.label,
  headline: doc.headline,
  description: doc.description,
  minOrder: doc.minOrder,
  terms: doc.terms,
  // The client's own vocabulary for the rule, so a card can say "10% OFF".
  type: doc.type,
  value: doc.value,
  cap: doc.cap,
})

export const adminCoupon = (doc) => ({
  ...publicCoupon(doc),
  id: String(doc._id),
  active: doc.active,
  personalOnly: Boolean(doc.personalOnly),
  issuedToEmail: doc.issuedToEmail ?? '',
  startsAt: doc.startsAt,
  endsAt: doc.endsAt,
  usageLimit: doc.usageLimit,
  usedCount: doc.usedCount,
  scope: {
    tiers: doc.scope?.tiers ?? [],
    excludeTiers: doc.scope?.excludeTiers ?? [],
    categories: (doc.scope?.categories ?? []).map(idOf),
  },
})

/* ────────────────────────────────────────────────────────────── misc ──── */

export const publicLedgerRow = (doc) => ({
  id: String(doc._id),
  productId: idOf(doc.product),
  /*
   * A hard-deleted fragrance leaves its movements behind pointing at nothing.
   * The rows are still true — the shelf really did move — so they are kept and
   * named for what they are now rather than rendered as a blank line the panel
   * appears to have lost.
   */
  product: nameOf(doc.product) ?? '(fragrance deleted)',
  sku: doc.product?.sku ?? '—',
  previous: doc.previous,
  change: doc.change,
  next: doc.next,
  reason: doc.reason,
  batch: doc.batch,
  at: doc.at,
})

export const publicActivity = (doc) => ({
  id: String(doc._id),
  at: doc.at,
  actor: doc.actor,
  tone: doc.tone,
  text: doc.text,
  target: doc.target,
})

export default {
  publicProduct,
  adminProduct,
  publicCategory,
  adminCategory,
  publicBrand,
  adminBrand,
  publicMedia,
  publicAddress,
  publicCustomer,
  adminCustomer,
  sessionUser,
  shopperStatus,
  publicOrder,
  adminOrder,
  publicTracking,
  publicReview,
  adminReview,
  publicCoupon,
  adminCoupon,
  publicLedgerRow,
  publicActivity,
}
