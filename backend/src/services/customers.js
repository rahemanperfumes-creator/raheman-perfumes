import { Customer, Order, Product, Review, STAFF_ROLES, User } from '../models/index.js'
import { conflict, notFound, unprocessable } from '../middleware/error.js'
import { adminCustomer, publicAddress, publicCustomer } from '../lib/views.js'
import { logCustomer } from './activity.js'
import { WALK_IN_EMAIL, SYNTHETIC_PHONE_DOMAIN, isSyntheticEmail } from '../lib/identity.js'

/**
 * Patrons.
 *
 * One row, two views. The storefront's account page wants a first name, a tier,
 * a default address and a stats block; the admin's customer drawer wants city,
 * status, lifetime spend and staff notes. `views.js` holds a serializer for each
 * and this file supplies the numbers they need.
 *
 * **The lifetime figures are an opening balance plus the order book.** The admin
 * fixture quotes 14 orders and ₹148,900 for Rahul while its own order book holds
 * two of them, and says so in a comment — so summing the book would be wrong, and
 * storing the total separately would let the two drift. `lifetime.openingOrders`
 * and `openingSpent` hold the history that predates this database, and the admin
 * view reports `opening + Σ`. Exact today, still live tomorrow.
 */

/** Order counts and spend per customer, in one aggregate (online orders only). */
async function orderStats() {
  const rows = await Order.aggregate([
    {
      // Only count online website orders for online customer statistics
      $match: {
        channel: { $in: ['Website', 'Storefront'] },
      },
    },
    {
      $group: {
        _id: '$customer',
        orders: { $sum: 1 },
        spent: { $sum: { $cond: [{ $ne: ['$status', 'Cancelled'] }, '$pricing.total', 0] } },
        lastOrder: { $max: '$placedAt' },
      },
    },
  ])
  return new Map(rows.filter((row) => row._id).map((row) => [String(row._id), row]))
}

/** `GET /api/admin/customers` — the array behind the `{customers}` envelope (online website patrons only). */
export async function adminList({ q, status, limit = 200 } = {}) {
  // Strictly filter for Online Customers — exclude physical shop counter / walk-in records
  const query = {
    email: {
      $nin: [WALK_IN_EMAIL],
      $not: new RegExp(`(${SYNTHETIC_PHONE_DOMAIN.replace('.', '\\.')}|@counter\\.rehmanperfume\\.in)$`, 'i'),
    },
    name: { $not: /^walk-in/i },
  }
  if (status && status !== 'all') query.status = status
  if (q) {
    const pattern = new RegExp(String(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
    query.$and = [{ $or: [{ name: pattern }, { email: pattern }, { phone: pattern }, { city: pattern }] }]
  }

  const [customers, stats] = await Promise.all([
    Customer.find(query).sort({ joined: -1 }).limit(Math.min(Number(limit) || 200, 500)),
    orderStats(),
  ])

  // Which of these profiles belong to a staff login.
  const staffIds = new Set(
    (
      await User.find({ customer: { $in: customers.map((customer) => customer._id) }, role: { $in: STAFF_ROLES } })
        .select('customer')
        .lean()
    ).map((user) => String(user.customer)),
  )

  // Exclude internal staff accounts who have placed zero online orders and any synthetic walk-ins
  const onlineCustomers = customers.filter((customer) => {
    if (isSyntheticEmail(customer.email)) return false
    if (customer.name && customer.name.toLowerCase().startsWith('walk-in')) return false
    const isStaff = staffIds.has(String(customer._id))
    const custStats = stats.get(String(customer._id)) ?? {}
    const orderCount = (customer.lifetime?.openingOrders ?? 0) + (custStats.orders ?? 0)
    if (isStaff && orderCount === 0) return false
    return true
  })

  return onlineCustomers.map((customer) =>
    adminCustomer(customer, stats.get(String(customer._id)) ?? {}, { staff: staffIds.has(String(customer._id)) }),
  )
}

/** One patron for the admin's drawer. */
export async function adminOne(id) {
  const customer = await Customer.findById(id)
  if (!customer) throw notFound('That customer does not exist.')
  const stats = (await orderStats()).get(String(customer._id)) ?? {}
  const staff = Boolean(await User.findOne({ customer: customer._id, role: { $in: STAFF_ROLES } }))
  return adminCustomer(customer, stats, { staff })
}

/** The signed-in patron's own profile, with its stats counted rather than stored. */
export async function selfView(customer) {
  return publicCustomer(customer, await selfStats(customer._id))
}

/** The numbers behind the account page's stats strip. */
export async function selfStats(customerId) {
  const [orders, reviews] = await Promise.all([
    Order.countDocuments({ customer: customerId }),
    Review.countDocuments({ customer: customerId }),
  ])
  return { orders, reviews }
}

/** Find a patron by email, or make one — used by registration and checkout. */
export async function findOrCreateByEmail({ email, name, phone = '', city = '' }) {
  const normalised = String(email ?? '').trim().toLowerCase()
  if (!normalised) throw unprocessable('An email address is required.')

  const existing = await Customer.findOne({ email: normalised })
  if (existing) return { customer: existing, created: false }

  const customer = await Customer.create({
    name: name?.trim() || normalised.split('@')[0],
    email: normalised,
    phone,
    city,
  })
  return { customer, created: true }
}

/** Update a patron's own profile fields. */
export async function update(id, patch = {}) {
  const customer = await Customer.findById(id)
  if (!customer) throw notFound('That customer does not exist.')

  // Only the fields a patron may edit about themselves. `status`,
  // `loyaltyTier`, `lifetime` and `notes` are staff decisions and are not here.
  for (const field of ['name', 'phone', 'city', 'preferredAccord']) {
    if (patch[field] !== undefined) customer[field] = patch[field]
  }

  await customer.save()
  return customer
}

/** Staff-only notes about a patron. */
export async function setNotes(id, notes) {
  const customer = await Customer.findById(id)
  if (!customer) throw notFound('That customer does not exist.')
  customer.notes = String(notes ?? '')
  await customer.save()
  return customer
}

/**
 * Block or unblock a patron.
 *
 * Blocking does two things, and the second is the one that is easy to forget:
 * the status stops them placing an order, and **bumping `tokenVersion` on their
 * user row kills the session they are already holding**. Without that second
 * step a blocked patron keeps a working cookie for up to a week, and "Block"
 * would be a label rather than a control.
 */
export async function setStatus(id, status, { actor = null } = {}) {
  const customer = await Customer.findById(id)
  if (!customer) throw notFound('That customer does not exist.')

  /*
   * A staff account cannot be blocked through its patron profile.
   *
   * Blocking bumps `tokenVersion` on the linked user, and a staff login *is*
   * that user — so blocking the owner's patron row signs the owner out of the
   * panel mid-shift, and the block itself then does nothing a re-login cannot
   * walk straight past: staff sign-in never consults the patron status. The
   * control is for patrons; refuse it here rather than offer a footgun.
   */
  if (status === 'Blocked') {
    const linked = await User.findOne({ customer: customer._id })
    if (linked && STAFF_ROLES.includes(linked.role)) {
      throw unprocessable(
        'This profile belongs to a staff login, and staff cannot be blocked. Blocking it would sign that account out of the panel without actually restricting it.',
      )
    }
  }

  customer.status = status
  await customer.save()

  if (status === 'Blocked') {
    await User.updateOne({ customer: customer._id }, { $inc: { tokenVersion: 1 } })
  }

  await logCustomer(`${customer.name} was marked ${status}.`, { actor: actor?.name ?? 'Staff', target: customer.email })
  return customer
}

/* ─────────────────────────────────────────────────────── addresses ──── */

/** The patron's address book. */
export const addresses = (customer) => (customer.addresses ?? []).map(publicAddress)

/** Add an address, honouring "make this my default". */
export async function addAddress(customer, input) {
  const isFirst = !customer.addresses?.length
  if (input.isDefault || isFirst) {
    customer.addresses.forEach((address) => {
      address.isDefault = false
    })
  }

  customer.addresses.push({ ...input, isDefault: Boolean(input.isDefault) || isFirst })
  await customer.save()
  return customer.addresses[customer.addresses.length - 1]
}

/** Edit an address. */
export async function updateAddress(customer, addressId, patch = {}) {
  const address = customer.addresses.id(addressId)
  if (!address) throw notFound('That address does not exist.')

  for (const field of ['tag', 'name', 'phone', 'line1', 'line2', 'area', 'city', 'district', 'state', 'pincode', 'type']) {
    if (patch[field] !== undefined) address[field] = patch[field]
  }

  if (patch.isDefault === true) {
    customer.addresses.forEach((entry) => {
      entry.isDefault = String(entry._id) === String(addressId)
    })
  }

  await customer.save()
  return address
}

/**
 * Remove an address.
 *
 * If it was the default, another one is promoted — otherwise the account is left
 * with addresses and no default, and the next checkout has to guess.
 */
export async function removeAddress(customer, addressId) {
  const address = customer.addresses.id(addressId)
  if (!address) throw notFound('That address does not exist.')

  const wasDefault = address.isDefault
  address.deleteOne()
  if (wasDefault && customer.addresses.length) customer.addresses[0].isDefault = true

  await customer.save()
  return customer
}

/** Make an address the default one. */
export const setDefaultAddress = (customer, addressId) => updateAddress(customer, addressId, { isDefault: true })

/* ──────────────────────────────────────────────────────── wishlist ──── */

/** The patron's wishlist, populated. */
export async function wishlist(customer) {
  await customer.populate('wishlist', 'name slug volumes stock listPrice')
  return customer.wishlist ?? []
}

/**
 * Add or remove a fragrance from the wishlist, returning which way it went.
 *
 * A toggle rather than separate add and remove endpoints, because the heart on a
 * product card is one button and two endpoints would need the client to know
 * which state it was in — a question the server can answer atomically.
 *
 * Note that a **function is never persisted** here: only the product's ObjectId
 * goes in the array, and the populated product is resolved on read.
 */
export async function toggleWishlist(customer, productIdOrSlug) {
  const value = String(productIdOrSlug ?? '')
  const product = /^[a-f0-9]{24}$/i.test(value)
    ? await Product.findById(value)
    : await Product.findOne({ slug: value.toLowerCase() })
  if (!product) throw notFound('That fragrance does not exist.')

  const index = (customer.wishlist ?? []).findIndex((entry) => String(entry) === String(product._id))
  let added
  if (index === -1) {
    customer.wishlist.push(product._id)
    added = true
  } else {
    customer.wishlist.splice(index, 1)
    added = false
  }

  await customer.save()
  return { added, productId: String(product._id), count: customer.wishlist.length }
}

/** Replace the whole wishlist, for a client that keeps it locally. */
export async function setWishlist(customer, productIds = []) {
  const ids = productIds.filter((id) => /^[a-f0-9]{24}$/i.test(String(id)))
  const found = await Product.find({ _id: { $in: ids } }).select('_id')
  customer.wishlist = found.map((product) => product._id)
  await customer.save()
  return customer.wishlist
}

/** Look a patron up by id, refusing when there is none. */
export async function byId(id) {
  const customer = await Customer.findById(id)
  if (!customer) throw notFound('That customer does not exist.')
  return customer
}

/** A patron and their credential together, for the admin's staff view. */
export async function withUser(id) {
  const customer = await byId(id)
  const user = await User.findOne({ customer: customer._id }).select('email role lastLoginAt tokenVersion')
  return { customer, user }
}

/** Refuse a patron who has been blocked, with the message checkout uses. */
export function assertNotBlocked(customer) {
  if (customer.status === 'Blocked') {
    throw conflict('This account is blocked and cannot place orders. Please contact customer support.')
  }
}

export default {
  adminList,
  adminOne,
  selfView,
  selfStats,
  findOrCreateByEmail,
  update,
  setNotes,
  setStatus,
  addresses,
  addAddress,
  updateAddress,
  removeAddress,
  setDefaultAddress,
  wishlist,
  toggleWishlist,
  setWishlist,
  byId,
  withUser,
  assertNotBlocked,
}
