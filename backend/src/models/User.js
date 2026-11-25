import { Schema, model } from 'mongoose'
import { baseOptions, ref } from './options.js'

/**
 * A way to sign in.
 *
 * Separate from `customers` on purpose. A credential and a commerce profile have
 * different lifetimes and different audiences: a patron's order history is
 * business data the owner reads all day, while a password hash is a liability that
 * should be touched by as little code as possible. The owner is provisioned a
 * patron profile at sign-in, so a single account can run the shop and buy from it.
 *
 * `role` is one field rather than a staff flag plus a separate admin table,
 * because the only thing that varies between a shopper and an owner is which
 * routes they may reach — `requireRole()` in `src/middleware/auth.js` is the
 * single place that decides.
 */

export const ROLES = ['shopper', 'owner', 'staff']

/** Roles that may reach `/api/admin/*` at all. */
export const STAFF_ROLES = ['owner', 'staff']

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    /**
     * Unique username for direct login and profile mention.
     * Sparse so that older accounts or accounts in transition without a username
     * do not collide, while enforcing absolute uniqueness across all users.
     */
    username: {
      type: String,
      unique: true,
      sparse: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    /**
     * Excluded from queries by default, so it cannot be logged by accident.
     *
     * **Not required any more.** An account created through "Continue with
     * Google" has no password at all — Google is the credential — and requiring
     * one would mean storing a random string and pretending it was a password.
     * Absent is the honest representation, and every route that checks a password
     * has to answer for it (`assertHasPassword` in `services/auth.js`).
     */
    passwordHash: { type: String, default: undefined, select: false },
    name: { type: String, default: '' },
    role: { type: String, enum: ROLES, default: 'shopper', index: true },

    /**
     * Google's stable subject id (`sub`) for this account, once it has been
     * linked. Never the email — an address can be reassigned inside a Workspace
     * domain, and matching on it would hand the new holder the old account.
     *
     * Sparse so the unique index covers only the accounts that have one: without
     * `sparse`, every password account would collide on `null`.
     */
    googleId: { type: String, default: undefined, unique: true, sparse: true },

    /** How this account signs in. Purely informational — nothing branches on it. */
    authProvider: { type: String, enum: ['password', 'google', 'both'], default: 'password' },

    /** The patron this credential speaks for. Provisioned on first sign-in for the owner. */
    customer: ref('Customer', { required: false, default: null }),

    /**
     * Bumped to invalidate every token already issued to this user — sign out
     * everywhere, or cut off a blocked patron. Without it a JWT stays valid
     * until it expires, and "block this customer" would not actually block
     * anything for up to a week.
     */
    tokenVersion: { type: Number, default: 0 },

    lastLoginAt: { type: Date, default: null },

    /** Email verification flag and pending verification code (OTP). */
    isEmailVerified: { type: Boolean, default: false, index: true },
    emailVerification: {
      codeHash: { type: String, default: null },
      expiresAt: { type: Date, default: null },
    },

    /** A password reset in flight. Stores hash of URL token and/or 6-digit OTP code. */
    resetToken: {
      hash: { type: String, default: null },
      codeHash: { type: String, default: null },
      expiresAt: { type: Date, default: null },
    },
  },
  baseOptions,
)

/** True when this account may open the admin panel. */
userSchema.virtual('isStaff').get(function isStaff() {
  return this.role !== 'shopper'
})

/** True when this account has a password of its own to type. */
userSchema.virtual('hasPassword').get(function hasPassword() {
  return Boolean(this.passwordHash)
})

export const User = model('User', userSchema)
export default User
