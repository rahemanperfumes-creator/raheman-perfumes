import jwt from 'jsonwebtoken'
import config from '../config/env.js'
import { User, STAFF_ROLES } from '../models/index.js'
import { asyncHandler } from './asyncHandler.js'
import { forbidden, unauthorized } from './error.js'

/**
 * Sessions, as a signed token in an httpOnly cookie.
 *
 * Cookie rather than a bearer header because both frontends already send
 * `credentials: 'include'` on every request — `frontend/src/lib/api.js` and
 * `admin/src/lib/api.js` both set it — so this needs no client change at all,
 * and the token is never reachable from JavaScript.
 *
 * The token carries a `v` that must match `user.tokenVersion`. That is what
 * makes revocation real: signing out everywhere, or blocking a patron, bumps the
 * version and every token already issued stops verifying. A plain JWT with no
 * version would stay valid until it expired, which would make "Block" on the
 * admin's customer drawer a week-long no-op.
 *
 * ## Idle expiry
 *
 * A session ends after **four hours of inactivity** — the same rule for an owner
 * as for a shopper, since every role is resolved right here. That is a *sliding*
 * window, not a fixed one: `exp` is four hours ahead of the last request, so
 * someone working continuously is never interrupted, and someone who walks away
 * is signed out and has to sign in again. A fixed four-hour token would do the
 * opposite of what was asked and cut off a busy shift mid-morning.
 *
 * The sliding is done by `resolveSession`, which re-mints the cookie on any
 * request carrying a token more than five minutes old. `abs` caps the whole
 * thing at `SESSION_MAX_DAYS` and is copied forward unchanged on each renewal,
 * so no amount of activity turns a session into a permanent one.
 *
 * One consequence worth knowing on a development machine: cookies are scoped by
 * host and **ignore the port**, so 5173 and 5174 share this cookie. Signing into
 * the storefront on localhost also authenticates the admin panel. That is the
 * same behaviour a shared production domain would have, not a hole.
 */

/**
 * How stale a token may get before a request refreshes it.
 *
 * This is the overshoot on the idle window: a session dies `sessionIdleHours`
 * after its last *renewal*, so the longer this interval the longer past four
 * hours a dead session can linger. Five minutes keeps that tight, and it is
 * still far longer than a page's worth of requests, so a busy screen does not
 * write a `Set-Cookie` on every call.
 */
const RENEW_AFTER_MS = 5 * 60 * 1000

export const isStaffUser = (role) => STAFF_ROLES.includes(role)

/**
 * Mint a session token for a user document.
 *
 * - Shoppers (regular users): 3 hours inactivity auto-logout (`SESSION_IDLE_HOURS=3`).
 * - Staff / Admin / Owner: 7 days retention (`STAFF_SESSION_DAYS=7`), logging in once every 7 days.
 */
export function signToken(user, { absoluteExpiry } = {}) {
  const isStaff = isStaffUser(user?.role)
  const idleHours = isStaff ? (config.staffSessionDays || 7) * 24 : config.sessionIdleHours
  const sessionDays = isStaff ? (config.staffSessionDays || 7) : config.sessionDays

  const absolute =
  Number(absoluteExpiry) || Math.floor(Date.now() / 1000) + sessionDays * 24 * 60 * 60

  return jwt.sign(
    { sub: String(user._id), role: user.role, v: user.tokenVersion ?? 0, abs: absolute, idleHours },
    config.jwtSecret,
    { expiresIn: idleHours * 60 * 60 },
  )
}

export const STAFF_COOKIE = 'rehman_staff_session'

export function setSessionCookie(res, token, roleOverride) {
  let role = roleOverride
  if (!role && token) {
    try {
      const decoded = jwt.decode(token)
      role = decoded?.role
    } catch {
      // ignore
    }
  }
  const isStaff = isStaffUser(role)
  const maxAgeMs = isStaff
    ? (config.staffSessionDays || 7) * 24 * 60 * 60 * 1000
    : config.sessionIdleHours * 60 * 60 * 1000

  const isCrossDomain = config.isProduction || config.cookieSecure
  const cookieOpts = {
    httpOnly: true,
    sameSite: isCrossDomain ? 'none' : 'lax',
    secure: isCrossDomain ? true : config.cookieSecure,
    path: '/',
  }

  res.cookie(config.sessionCookie, token, {
    ...cookieOpts,
    maxAge: maxAgeMs,
  })

  if (isStaff) {
    res.cookie(STAFF_COOKIE, token, {
      ...cookieOpts,
      maxAge: (config.staffSessionDays || 7) * 24 * 60 * 60 * 1000,
    })
  }
}

export function clearSessionCookie(res) {
  const isCrossDomain = config.isProduction || config.cookieSecure
  const cookieOpts = {
    httpOnly: true,
    sameSite: isCrossDomain ? 'none' : 'lax',
    secure: isCrossDomain ? true : config.cookieSecure,
    path: '/',
  }
  res.clearCookie(config.sessionCookie, cookieOpts)
  res.clearCookie(STAFF_COOKIE, cookieOpts)
}

/**
 * The 401 a guard raises when there is no usable session.
 */
function refusal(reason, role) {
  if (reason !== 'expired') return unauthorized('Please sign in to continue.')
  const isStaff = isStaffUser(role)
  const message = isStaff
    ? 'Your session ended after 7 days. Please sign in again.'
    : `Your session ended. For your security, sessions sign out after ${config.sessionIdleHours} hours of inactivity — please sign in again.`
  return unauthorized(message, { code: 'session_expired' })
}

/**
 * Verify token and load user.
 */
async function resolveToken(token, res) {
  if (!token) return { session: null, reason: 'absent' }

  let payload
  try {
    payload = jwt.verify(token, config.jwtSecret)
  } catch {
    const decoded = jwt.decode(token)
    return { session: null, reason: 'expired', role: decoded?.role }
  }

  const absolute = Number(payload.abs)
  if (Number.isFinite(absolute) && absolute > 0 && absolute * 1000 <= Date.now()) {
    return { session: null, reason: 'expired', role: payload.role }
  }

  const user = await User.findById(payload.sub).select('+passwordHash').populate('customer')
  if (!user) return { session: null, reason: 'expired', role: payload.role }
  if ((payload.v ?? 0) !== (user.tokenVersion ?? 0)) return { session: null, reason: 'expired', role: payload.role }

  renewIfStale(res, user, payload, absolute)
  return { session: { user, customer: user.customer ?? null, payload }, reason: null, role: user.role }
}

/**
 * Read the cookie and load the user it names.
 */
async function resolveSession(req, res) {
  const isStaffRequest =
    req.originalUrl?.includes('/admin') ||
    req.baseUrl?.includes('/admin') ||
    req.headers?.['x-admin'] ||
    req.headers?.referer?.includes('admin') ||
    req.headers?.origin?.includes('admin')

  const staffToken = req.cookies?.[STAFF_COOKIE]
  const standardToken = req.cookies?.[config.sessionCookie]

  if (isStaffRequest && staffToken) {
    const resolvedStaff = await resolveToken(staffToken, res)
    if (resolvedStaff.session && isStaffUser(resolvedStaff.role)) {
      return resolvedStaff
    }
  }

  const resolved = await resolveToken(standardToken, res)
  if (!resolved.session && staffToken) {
    return resolveToken(staffToken, res)
  }
  return resolved
}

/**
 * Slide the session forward on activity.
 */
function renewIfStale(res, user, payload, absolute) {
  if (!res) return
  const issuedAt = Number(payload.iat) * 1000
  if (!Number.isFinite(issuedAt) || Date.now() - issuedAt < RENEW_AFTER_MS) return
  setSessionCookie(res, signToken(user, { absoluteExpiry: absolute }), user.role)
}

/** Attach `req.auth` when a valid session exists; never reject. */
export const optionalAuth = asyncHandler(async (req, res, next) => {
  const resolved = await resolveSession(req, res)
  req.auth = resolved.session
  req.sessionReason = resolved.reason
  req.sessionRole = resolved.role
  next()
})

/** Reject unless a valid session exists. */
export const requireAuth = asyncHandler(async (req, res, next) => {
  if (!req.auth) {
    const resolved = await resolveSession(req, res)
    req.auth = resolved.session
    req.sessionReason = resolved.reason
    req.sessionRole = resolved.role
  }
  if (!req.auth) throw refusal(req.sessionReason, req.sessionRole)
  next()
})

/**
 * Reject unless the signed-in account holds one of `roles`.
 */
export const requireRole =
  (...roles) =>
    asyncHandler(async (req, res, next) => {
      if (!req.auth) {
        const resolved = await resolveSession(req, res)
        req.auth = resolved.session
        req.sessionReason = resolved.reason
        req.sessionRole = resolved.role
      }
      if ((!req.auth || !roles.includes(req.auth.user.role)) && req.cookies?.[STAFF_COOKIE]) {
        const staffResolved = await resolveToken(req.cookies[STAFF_COOKIE], res)
        if (staffResolved.session && roles.includes(staffResolved.session.user.role)) {
          req.auth = staffResolved.session
          req.sessionReason = null
          req.sessionRole = staffResolved.role
        }
      }
      if (!req.auth) throw refusal(req.sessionReason, req.sessionRole)
      if (!roles.includes(req.auth.user.role)) {
        throw forbidden(`This action needs ${roles.length > 1 ? 'one of these roles' : 'the role'}: ${roles.join(', ')}.`)
      }
      next()
    })

    /** Any staff role at all. */
    export const requireStaff = requireRole(...STAFF_ROLES)

    /** Only the owner — used for staff management and settings writes. */
    export const requireOwner = requireRole('owner')

    /**
     * Require a signed-in patron, for `/api/account/*`.
     */
    export const requireCustomer = asyncHandler(async (req, res, next) => {
      if (!req.auth) {
        const resolved = await resolveSession(req, res)
        req.auth = resolved.session
        req.sessionReason = resolved.reason
        req.sessionRole = resolved.role
      }
      if (!req.auth) throw refusal(req.sessionReason, req.sessionRole)
      if (!req.auth.customer) {
        throw forbidden('This account is for staff only. Please sign in with a customer account.')
      }
      next()
    })

    /**
     * The session rules, as the clients are told them.
     */
    export const sessionPolicy = (role) => {
      const isStaff = isStaffUser(role)
      return {
        idleHours: isStaff ? (config.staffSessionDays || 7) * 24 : config.sessionIdleHours,
        maxDays: isStaff ? (config.staffSessionDays || 7) : config.sessionDays,
        isStaff,
      }
    }

    export default { signToken, setSessionCookie, clearSessionCookie, sessionPolicy, optionalAuth, requireAuth, requireRole, requireStaff, requireOwner, requireCustomer }
