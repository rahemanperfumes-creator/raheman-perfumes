import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'
import { Customer, User, STAFF_ROLES } from '../models/index.js'
import config from '../config/env.js'
import { conflict, unauthorized, unprocessable } from '../middleware/error.js'
import { sessionUser } from '../lib/views.js'
import { findOrCreateByEmail } from './customers.js'
import { logCustomer } from './activity.js'
import {
  buildEmailVerificationEmail,
  buildPasswordResetEmail,
  sendLoggedEmail,
} from './mailer.js'

/**
 * Signing in.
 *
 * A shopper's account is two rows: a `customers` document holding the commerce
 * profile, and a `users` document holding the credential. They are created
 * together at registration and linked by reference. Staff accounts are `users`
 * rows with a role and **no** customer — which is why the split exists, since
 * otherwise every employee would need an empty patron profile.
 *
 * Passwords are hashed with bcrypt at cost 12 and never leave this file.
 * `passwordHash` is `select: false` on the model, so a query that forgets to
 * exclude it still will not return it.
 *
 * Not every account has one. A patron who signed up with **"Continue with
 * Google"** stores no hash at all — Google is the credential — which is why
 * `passwordHash` is optional on the model and why every password path here goes
 * through `assertHasPassword`. A missing hash is a real account, not a broken
 * one, and each of those routes has to say which it is.
 */

const BCRYPT_ROUNDS = 12
const MIN_PASSWORD = 8
const VERIFY_TTL_MS = 15 * 60 * 1000 // 15 minutes

/** Hash a password. */
export const hashPassword = (password) => bcrypt.hash(password, BCRYPT_ROUNDS)

/** Hash an arbitrary token/OTP code with SHA-256 */
export const hashToken = (value) => crypto.createHash('sha256').update(String(value ?? '')).digest('hex')

/** Generate a 6-digit verification / reset PIN code */
export function generatePinCode() {
  return String(crypto.randomInt(100000, 999999))
}

/**
 * Normalise and sanitize a username string.
 * Keeps lowercase letters, numbers, underscores, periods, and hyphens.
 */
export function cleanUsername(raw, fallbackEmail = '') {
  let val = String(raw ?? '').trim().toLowerCase()
  if (!val && fallbackEmail) {
    val = String(fallbackEmail).split('@')[0] || ''
  }
  val = val.replace(/[^a-z0-9_.-]/g, '_').replace(/^_+|_+$/g, '')
  if (val.length > 30) val = val.slice(0, 30)
  return val
}

/**
 * Ensure a unique username that does not collide with any existing user.
 */
export async function ensureUniqueUsername(desired, fallbackEmail = '') {
  let base = cleanUsername(desired, fallbackEmail)
  if (base.length < 3) base = `user_${String(crypto.randomInt(1000, 9999))}`
  let candidate = base
  let counter = 1
  while (await User.findOne({ username: candidate })) {
    candidate = `${base.slice(0, 24)}_${counter++}`
  }
  return candidate
}

/**
 * Fast availability lookup for registration form: checks email and username.
 */
export async function checkAvailability({ email, username }) {
  const result = {}
  if (email) {
    const normalised = String(email).trim().toLowerCase()
    const found = await User.findOne({ email: normalised }).select('+passwordHash googleId').lean()
    result.emailAvailable = !found
    result.email = normalised
    if (found) {
      result.existingMethod = found.googleId && !found.passwordHash
        ? 'google'
        : found.googleId && found.passwordHash
          ? 'both'
          : 'password'
    }
  }
  if (username) {
    const cleaned = cleanUsername(username)
    if (cleaned.length < 3) {
      result.usernameAvailable = false
      result.usernameReason = 'Username must be at least 3 characters.'
    } else {
      const found = await User.findOne({ username: cleaned }).lean()
      result.usernameAvailable = !found
      result.username = cleaned
    }
  }
  return result
}

/**
 * Check password strength.
 *
 * Length only — a composition rule (a digit, a symbol) pushes people towards
 * `Password1!` and is worse than a longer minimum. The one refusal that is not
 * about length is the case where the password *is* the email address, which is
 * the single most guessable thing an account can have.
 */
function assertPassword(password, email = '') {
  const value = String(password ?? '')
  if (value.length < MIN_PASSWORD) {
    throw unprocessable(`A password needs at least ${MIN_PASSWORD} characters.`)
  }
  if (email && value.toLowerCase() === String(email).toLowerCase()) {
    throw unprocessable('Your password cannot be your email address.')
  }
}

/**
 * Refuse a password operation on an account that has no password.
 *
 * An account created with "Continue with Google" stores no hash at all, so
 * `bcrypt.compare(anything, undefined)` would throw a `TypeError` out of the
 * library and surface as a 500. The codes matter as much as the message: the
 * sign-in page reads them to offer the Google button again instead of a
 * password box the shopper cannot possibly fill.
 *
 *   • `no_password`     — this is a Google account; sign in with Google.
 *   • `password_exists` — the opposite, on the "add a password" path.
 */
function assertHasPassword(user) {
  if (!user.passwordHash) {
    throw unauthorized('That account signs in with Google. Choose "Continue with Google" instead.', {
      code: 'no_password',
    })
  }
}

/** The document a session attaches to: the user, with its customer populated. */
export const loadSession = (userId) => User.findById(userId).select('+passwordHash').populate('customer')

/** Dispatch an account security email via Brevo/SMTP and never crash auth flows on transport failure. */
async function deliverAuthEmail({ user, kind, templatePromise, sentBy = 'System Auth' }) {
  try {
    const content = await templatePromise
    const res = await sendLoggedEmail({
      to: user.email,
      recipientName: user.name || '',
      customerId: user.customer ?? null,
      kind,
      subject: content.subject,
      html: content.html,
      text: content.text,
      sentBy,
    })
    if (res.status === 'failed') {
      console.error(`[auth] ${kind} email delivery failed for ${user.email}: ${res.error}`)
    }
    return res
  } catch (err) {
    console.error(`[auth] ${kind} email error for ${user.email}:`, err?.message || err)
    return { status: 'failed', provider: 'preview', error: err?.message || 'Email delivery failed.', configured: false }
  }
}

/**
 * Create a shopper account.
 *
 * Registration creates the patron profile *and* the credential. A conflict is a
 * 409 on the email or username rather than a silent sign-in.
 * Generates an initial email verification OTP code. Email verification is skippable,
 * so the user can immediately browse or choose to verify.
 */
export async function register({ name, email, username, password, phone = '', city = '' }) {
  const normalised = String(email ?? '').trim().toLowerCase()
  if (!normalised) throw unprocessable('An email address is required.')
  assertPassword(password, normalised)

  const existingUser = await User.findOne({ email: normalised }).select('+passwordHash')
  if (existingUser) {
    if (existingUser.googleId && !existingUser.passwordHash) {
      throw conflict(
        'An account with this email already exists via Google sign-in. Sign in with Google, or use "Forgot password" to add a password to this same account.',
        { code: 'google_account_exists' },
      )
    }
    throw conflict('An account with that email address already exists. Try signing in instead.', {
      code: 'account_exists',
    })
  }

  let finalUsername = ''
  if (username) {
    finalUsername = cleanUsername(username)
    if (finalUsername.length < 3 || finalUsername.length > 30) {
      throw unprocessable('Username must be between 3 and 30 characters.')
    }
    if (await User.findOne({ username: finalUsername })) {
      throw conflict('That username is already taken. Please choose another.')
    }
  } else {
    finalUsername = await ensureUniqueUsername(name, normalised)
  }

  const verificationCode = generatePinCode()
  const codeHash = hashToken(verificationCode)
  const expiresAt = new Date(Date.now() + VERIFY_TTL_MS)

  const { customer } = await findOrCreateByEmail({ email: normalised, name, phone, city })
  const user = await User.create({
    email: normalised,
    username: finalUsername,
    passwordHash: await hashPassword(password),
    name: name?.trim() || customer.name,
    role: 'shopper',
    customer: customer._id,
    isEmailVerified: false,
    emailVerification: {
      codeHash,
      expiresAt,
    },
  })

  console.info(`[auth] Email verification code generated for ${normalised} (@${finalUsername})`)
  const emailResult = await deliverAuthEmail({
    user,
    kind: 'email-verification',
    templatePromise: buildEmailVerificationEmail({ name: user.name, email: normalised, code: verificationCode }),
    sentBy: 'Registration',
  })
  await logCustomer(`${customer.name} created an account.`, { actor: customer.name, actorUser: user._id })

  const delivered = emailResult.status === 'sent'
  return {
    user,
    customer,
    emailDelivered: delivered,
    emailProvider: emailResult.provider,
    requiresEmailVerification: true,
    emailError: !delivered ? emailResult.error || 'Failed to deliver verification email.' : undefined,
  }
}

/**
 * Verify an email or username and password.
 *
 * Supports logging in with either the registered email address OR username.
 * The same message for an unknown identifier and a wrong password, deliberately.
 */
export async function login({ identifier, email, password }) {
  const query = String(identifier || email || '').trim().toLowerCase()
  if (!query) throw unprocessable('An email address or username is required.')

  const user = await User.findOne({
    $or: [{ email: query }, { username: query }],
  }).select('+passwordHash').populate('customer')

  if (!user) throw unauthorized('That email address or username and password do not match.')

  if (!user.passwordHash) {
    throw unauthorized(
      'This email is signed up with Google and has no password yet. Continue with Google, or use Forgot Password to set a password for this same account.',
      { code: 'no_password' },
    )
  }

  const ok = await bcrypt.compare(String(password ?? ''), user.passwordHash)
  if (!ok) throw unauthorized('That email address or username and password do not match.')

  if (!user.customer && STAFF_ROLES.includes(user.role)) {
    const { customer } = await findOrCreateByEmail({ email: user.email, name: user.name })
    user.customer = customer._id
  }

  if (user.googleId && user.authProvider !== 'both') {
    user.authProvider = 'both'
  }
  user.lastLoginAt = new Date()
  await user.save()

  return {
    user,
    customer: user.customer ?? null,
    requiresEmailVerification: !user.isEmailVerified,
  }
}

/**
 * Sign out everywhere: bump the token version, invalidating every token issued
 * to this account. Ordinary sign-out just clears the cookie; this is the one
 * that matters when a device was lost.
 */
export async function revokeSessions(user) {
  user.tokenVersion = (user.tokenVersion ?? 0) + 1
  await user.save()
  return user
}

/** Change a password, and cut every other session off while doing it. */
export async function changePassword(user, { current, next }) {
  assertPassword(next, user.email)
  const withHash = await User.findById(user._id).select('+passwordHash')
  assertHasPassword(withHash)
  const ok = await bcrypt.compare(String(current ?? ''), withHash.passwordHash)
  if (!ok) throw unauthorized('That current password is not right.')

  withHash.passwordHash = await hashPassword(next)
  withHash.tokenVersion = (withHash.tokenVersion ?? 0) + 1
  await withHash.save()
  return withHash
}

/**
 * Give a password to an account that has none.
 *
 * The path a Google patron takes to stop depending on Google: they are signed in
 * already, so there is no current password to prove anything with — the session
 * *is* the proof, and `requireAuth` at the route is what checks it. Doing it
 * without one is the whole point, so this is deliberately not a variant of
 * `changePassword`.
 *
 * Every other session is cut off afterwards, on the same reasoning as a reset:
 * the credential just changed, so anything holding an older claim on this account
 * should have to sign in again.
 */
export async function setPassword(user, password) {
  assertPassword(password, user.email)
  const withHash = await User.findById(user._id).select('+passwordHash')
  if (withHash.passwordHash) {
    throw conflict('This account already has a password. Use “Change password” instead.')
  }

  withHash.passwordHash = await hashPassword(password)
  withHash.authProvider = withHash.googleId ? 'both' : 'password'
  withHash.tokenVersion = (withHash.tokenVersion ?? 0) + 1
  await withHash.save()
  return withHash
}

/* ─────────────────────────────────────────────────── email verification ──── */

/**
 * Send (or resend) a 6-digit email verification code.
 */
export async function sendEmailVerification(userOrIdentifier) {
  let user = null
  if (userOrIdentifier && typeof userOrIdentifier === 'object' && userOrIdentifier._id) {
    user = await User.findById(userOrIdentifier._id)
  } else {
    const query = String(userOrIdentifier ?? '').trim().toLowerCase()
    user = await User.findOne({ $or: [{ email: query }, { username: query }] })
  }

  if (!user) {
    return { sent: true, message: 'If that account exists, a verification code has been sent.' }
  }

  if (user.isEmailVerified) {
    return { sent: false, alreadyVerified: true, message: 'This email is already verified.' }
  }

  const code = generatePinCode()
  user.emailVerification = {
    codeHash: hashToken(code),
    expiresAt: new Date(Date.now() + VERIFY_TTL_MS),
  }
  await user.save()

  console.info(`[auth] Email verification code generated for ${user.email} (@${user.username || 'n/a'})`)
  const emailResult = await deliverAuthEmail({
    user,
    kind: 'email-verification',
    templatePromise: buildEmailVerificationEmail({ name: user.name, email: user.email, code }),
    sentBy: 'Email Verification',
  })
  const delivered = emailResult.status === 'sent'

  return {
    sent: delivered,
    delivered,
    provider: emailResult.provider,
    message: delivered
      ? `Verification code sent to ${user.email}. Please check your inbox.`
      : `Failed to deliver verification code: ${emailResult.error || 'Email delivery failed.'}`,
    error: !delivered ? emailResult.error : undefined,
  }
}

/**
 * Verify an email with a 6-digit code.
 */
export async function verifyEmail(userOrId, code) {
  let user = null
  if (userOrId && typeof userOrId === 'object' && userOrId._id) {
    user = await User.findById(userOrId._id)
  } else if (typeof userOrId === 'string' && /^[0-9a-fA-F]{24}$/.test(userOrId)) {
    user = await User.findById(userOrId)
  } else {
    const query = String(userOrId ?? '').trim().toLowerCase()
    user = await User.findOne({ $or: [{ email: query }, { username: query }] })
  }
  if (!user) throw unauthorized('Account not found.')

  if (user.isEmailVerified) {
    return { verified: true, message: 'Email is already verified.', user }
  }

  const cleanCode = String(code ?? '').trim()
  if (!cleanCode) throw unprocessable('A 6-digit verification code is required.')

  const codeHash = hashToken(cleanCode)
  if (
    !user.emailVerification?.codeHash ||
    user.emailVerification.codeHash !== codeHash ||
    !user.emailVerification.expiresAt ||
    user.emailVerification.expiresAt < new Date()
  ) {
    throw unprocessable('That verification code is invalid or has expired. Please request a new one.')
  }

  user.isEmailVerified = true
  user.emailVerification = { codeHash: null, expiresAt: null }
  await user.save()

  return { verified: true, message: 'Email successfully verified!', user }
}

/* ────────────────────────────────────────────────────── password reset ──── */

/** A reset link or code is valid for an hour. */
const RESET_TTL_MS = 60 * 60 * 1000

/**
 * Start a password reset.
 *
 * Accepts either an email address OR username.
 * Generates both a URL token and a user-friendly 6-digit PIN code.
 */
export async function forgotPassword(identifier) {
  const query = String(identifier ?? '').trim().toLowerCase()
  const user = await User.findOne({
    $or: [{ email: query }, { username: query }],
  })

  if (!user) {
    return { sent: true, message: 'If that address or username has an account, a reset code is on its way.' }
  }

  const token = crypto.randomBytes(32).toString('hex')
  const code = generatePinCode()

  user.resetToken = {
    hash: hashToken(token),
    codeHash: hashToken(code),
    expiresAt: new Date(Date.now() + RESET_TTL_MS),
  }
  await user.save()

  const link = `${config.corsOrigins[0] ?? ''}/reset-password?token=${token}&email=${encodeURIComponent(user.email)}`
  console.info(`[auth] Password reset for ${user.email} (@${user.username || 'n/a'}):\n  Code: ${code}\n  Link: ${link}`)

  const emailResult = await deliverAuthEmail({
    user,
    kind: 'password-reset',
    templatePromise: buildPasswordResetEmail({
      name: user.name,
      email: user.email,
      code,
      resetLink: link,
    }),
    sentBy: 'Forgot Password',
  })

  const delivered = emailResult.status === 'sent'
  return {
    sent: true,
    delivered,
    provider: emailResult.provider,
    message: delivered
      ? 'If that address or username has an account, a reset code and link have been sent to your email.'
      : 'If that address or username has an account, a reset code and link have been generated.',
    email: user.email,
  }
}

/** Finish a password reset. Supports either URL token OR 6-digit code + email/username. */
export async function resetPassword({ token, code, identifier, email, password }) {
  let user = null
  const cleanToken = String(token ?? '').trim()
  const cleanCode = String(code ?? '').trim()

  if (cleanToken) {
    const hash = hashToken(cleanToken)
    user = await User.findOne({ 'resetToken.hash': hash }).select('+passwordHash')
  } else if (cleanCode) {
    const codeHash = hashToken(cleanCode)
    const query = String(identifier || email || '').trim().toLowerCase()
    user = await User.findOne({
      $or: [{ email: query }, { username: query }],
      'resetToken.codeHash': codeHash,
    }).select('+passwordHash')
  }

  if (!user || !user.resetToken?.expiresAt || user.resetToken.expiresAt < new Date()) {
    throw unprocessable('That reset link or code is not valid, or has expired. Please request a new one.')
  }

  assertPassword(password, user.email)
  user.passwordHash = await hashPassword(password)
  user.authProvider = user.googleId ? 'both' : 'password'
  user.resetToken = { hash: null, codeHash: null, expiresAt: null }
  if (!user.isEmailVerified) {
    user.isEmailVerified = true
    user.emailVerification = { codeHash: null, expiresAt: null }
  }
  // Invalidate old sessions
  user.tokenVersion = (user.tokenVersion ?? 0) + 1
  await user.save()

  return user
}

/* ────────────────────────────────────────────────────────── staff ──── */

/** Create a staff account. Owner-only, enforced at the route. */
export async function createStaff({ name, email, password, role }) {
  const normalised = String(email ?? '').trim().toLowerCase()
  assertPassword(password, normalised)
  if (await User.findOne({ email: normalised })) throw conflict('An account with that email address already exists.')

  const user = await User.create({
    email: normalised,
    passwordHash: await hashPassword(password),
    name: name?.trim() || normalised.split('@')[0],
    role,
    customer: null,
  })
  return user
}

/** The staff list. */
export async function staffList() {
  return User.find({ role: { $ne: 'shopper' } }).sort({ role: 1, name: 1 })
}

/** Change a staff member's role, or deactivate them. */
export async function updateStaff(id, { name, role }) {
  const user = await User.findById(id)
  if (!user) throw unauthorized('That staff account does not exist.')
  if (role !== undefined && user.role === 'owner' && role !== 'owner') {
    const otherOwners = await User.countDocuments({ role: 'owner', _id: { $ne: user._id } })
    if (otherOwners === 0) throw conflict('At least one Owner account must remain.')
  }
  if (name !== undefined) user.name = name
  if (role !== undefined) {
    user.role = role
    // A role change must take effect now, not when the current token expires.
    user.tokenVersion = (user.tokenVersion ?? 0) + 1
  }
  await user.save()
  return user
}

/** Remove a staff account. */
export async function removeStaff(id) {
  const user = await User.findById(id)
  if (!user) throw unauthorized('That staff account does not exist.')
  if (user.role === 'owner') {
    const otherOwners = await User.countDocuments({ role: 'owner', _id: { $ne: user._id } })
    if (otherOwners === 0) throw conflict('At least one Owner account must remain.')
  }
  await user.deleteOne()
  return user
}

/** The `{user, customer}` block both clients persist after signing in. */
export const sessionPayload = (user, customer = null) => ({
  user: sessionUser(user),
  customer: customer ? { id: String(customer._id), name: customer.name, email: customer.email } : null,
})

export default {
  register,
  login,
  checkAvailability,
  sendEmailVerification,
  verifyEmail,
  cleanUsername,
  ensureUniqueUsername,
  revokeSessions,
  changePassword,
  forgotPassword,
  resetPassword,
  createStaff,
  staffList,
  updateStaff,
  removeStaff,
  hashPassword,
  loadSession,
  sessionPayload,
}
