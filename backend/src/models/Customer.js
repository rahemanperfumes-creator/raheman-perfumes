import { Schema, model } from 'mongoose'
import { baseOptions, ref } from './options.js'

/**
 * A patron.
 *
 * One document serves both frontends, and they describe the same person
 * differently. `cust-1042` (Rahul Sharma) appears in `admin/src/data/customers.js`
 * as a commerce record — city, status, lifetime spend, staff notes — and in
 * `frontend/src/data/account.js` as an account — first name, preferred accord,
 * default address, a stats block. `src/lib/views.js` has a serializer for each;
 * this is the one row underneath both.
 *
 * Two things are deliberately absent:
 *
 *   • **Credentials.** Those live in `users`, linked by ref, so a staff member
 *     can sign in without being a customer and a patron can be seeded (and have
 *     orders raised for them by staff) without ever having registered.
 *   • **`totalSpent` / `orders` as plain fields.** The admin fixture quotes 14
 *     orders and ₹148,900 for Rahul while its own order book holds only two of
 *     them, and says so in a comment. Summing the book would therefore be wrong,
 *     and typing the lifetime figure separately would let the two drift. So the
 *     history that predates this database is kept as an **opening balance** and
 *     the admin view reports `opening + Σ orders`: exact today, and still live
 *     tomorrow when he places another order.
 */

export const CUSTOMER_STATUSES = ['Active', 'VIP', 'Blocked']
export const ADDRESS_TYPES = ['Home', 'Office', 'Other']

const addressSchema = new Schema(
  {
    tag: { type: String, default: '' },
    name: { type: String, default: '' },
    phone: { type: String, default: '' },
    line1: { type: String, required: true },
    line2: { type: String, default: '' },
    /** Locality / taluka, as chosen alongside the PIN code. */
    area: { type: String, default: '' },
    city: { type: String, required: true },
    district: { type: String, default: '' },
    state: { type: String, default: '' },
    pincode: { type: String, default: '' },
    type: { type: String, enum: ADDRESS_TYPES, default: 'Home' },
    isDefault: { type: Boolean, default: false },
    /** The `addr-home`-style id this address had in the storefront fixture. */
    legacyId: { type: String, default: null },
  },
  { _id: true },
)

const customerSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, default: '' },
    city: { type: String, default: '' },

    status: { type: String, enum: CUSTOMER_STATUSES, default: 'Active', index: true },
    loyaltyTier: { type: String, default: 'Bronze Member' },
    loyaltyPoints: { type: Number, default: 0, min: 0 },
    preferredAccord: { type: String, default: '' },
    /** `joined` in the admin fixture and `memberSince` on the storefront. */
    joined: { type: Date, default: () => new Date() },

    /** Staff-only. Never emitted by the public serializer. */
    notes: { type: String, default: '' },

    addresses: { type: [addressSchema], default: [] },

    /** See the note at the top: history before this database, not a duplicate. */
    lifetime: {
      openingOrders: { type: Number, default: 0, min: 0 },
      openingSpent: { type: Number, default: 0, min: 0 },
      lastOrder: { type: Date, default: null },
    },

    wishlist: { type: [ref('Product', { required: false })], default: [] },

    legacyId: { type: String, default: null },
  },
  baseOptions,
)

customerSchema.index({ name: 'text', email: 'text', phone: 'text' })

/** The address marked default, or the first one, or null. */
customerSchema.virtual('defaultAddress').get(function defaultAddress() {
  if (!this.addresses?.length) return null
  return this.addresses.find((address) => address.isDefault) ?? this.addresses[0]
})

/** True when staff have blocked this patron from placing orders. */
customerSchema.virtual('isBlocked').get(function isBlocked() {
  return this.status === 'Blocked'
})

export const Customer = model('Customer', customerSchema)
export default Customer
