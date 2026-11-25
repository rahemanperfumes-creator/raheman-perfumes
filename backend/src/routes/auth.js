import { Router } from 'express'
import { z } from 'zod'
import rateLimit from 'express-rate-limit'
import config from '../config/env.js'
import validate from '../middleware/validate.js'
import { asyncHandler } from '../middleware/asyncHandler.js'
import { clearSessionCookie, optionalAuth, requireAuth, sessionPolicy, setSessionCookie, signToken } from '../middleware/auth.js'
import * as auth from '../services/auth.js'
import * as oauth from '../services/oauth.js'
import { safeNext } from '../services/oauth.js'
import { publicCustomer } from '../lib/views.js'
import { selfStats } from '../services/customers.js'

/**
 * Signing in and out.
 *
 * The session is a signed JWT in an **httpOnly cookie**, not a bearer token,
 * because both frontends already send `credentials: 'include'` on every request
 * — `frontend/src/lib/api.js` and `admin/src/lib/api.js` both do — so this needs
 * no client change at all and the token is never reachable from JavaScript.
 *
 * Sign-in is rate-limited. A password endpoint with no ceiling is an invitation
 * to grind through a list, and `bcrypt` at cost 12 is expensive enough that the
 * attempt itself is the attack.
 */

const router = Router()

/**
 * Ten attempts a quarter hour per address in production.
 *
 * The limit is looser under `npm run dev`, and deliberately so. The bucket is
 * keyed on the *address*, and in development a single machine is one address:
 * the browser, a second tab, a smoke test and a `node` probe all draw from the
 * same ten, so a normal hour of work on the sign-in page can end in a 429 that
 * looks like a security feature and is really a testing artefact. The ceiling
 * still exists in development — it is what the code under test is supposed to
 * enforce — it simply cannot be reached by ordinary local traffic.
 */
/**
 * Two-layer auth rate limiting:
 *  1) Per-(IP, target identifier) ceiling of 10 failed attempts / 15 min so a
 *     targeted brute-force against any single account stops cold even in dev,
 *     without locking every other user / tab on localhost out.
 *  2) Per-IP ceiling across all auth routes so an attacker cannot spray across
 *     many different accounts either (30 in prod, 80 in dev).
 */
const authAccountLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req) => {
    const target = String(req.body?.identifier || req.body?.email || '').trim().toLowerCase()
    return `${req.ip}:${target || '_anon'}`
  },
  message: { message: 'Too many attempts for this account. Please wait a few minutes and try again.' },
})

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: config.isProduction ? 30 : 80,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many attempts. Please wait a few minutes and try again.' },
})

/** Mint the cookie and answer with the session block both clients persist. */
function establish(res, user, customer) {
  setSessionCookie(res, signToken(user), user?.role)
  return { ...auth.sessionPayload(user, customer), authenticated: true, session: sessionPolicy(user?.role) }
}

/* ───────────────────────────────────────────────────────── Google ──── */

/**
 * Signing in with Google, the browser-redirect flow.
 *
 * The whole exchange happens **server-side** and ends with the same cookie the
 * password route sets, so nothing downstream knows the difference — same
 * `tokenVersion` check, same revocation, same shared cookie with the admin panel.
 *
 *   login page → GET /api/auth/google?next=/account
 *              → 302 accounts.google.com
 *              → 302 /api/auth/google/callback?code=…&state=…
 *              → 302 back to the storefront, signed in
 *
 * Every failure after the browser has left us is delivered as a **redirect**, not
 * a JSON error, because by then the shopper is looking at a browser tab, not at
 * the SPA — a bare `{"message":…}` would be all they ever saw. The reason travels
 * in a short `?error=` code that the login page turns into a sentence.
 */

/**
 * Where the storefront lives. `CORS_ORIGINS` already names it — the password
 * reset link reads `corsOrigins[0]` for the same purpose — so the callback
 * returns to whoever is allowed to call this API rather than to a second,
 * separately-configured origin that could disagree with it.
 */
const storefrontOrigin = (req) => {
  const referer = req?.get?.('referer')
  if (referer) {
    try {
      const url = new URL(referer)
      if (config.corsOrigins.includes(url.origin) || url.hostname === '127.0.0.1' || url.hostname === 'localhost') {
        return url.origin
      }
    } catch { }
  }
  return config.corsOrigins[0] ?? 'http://127.0.0.1:5173'
}

/**
 * Send the browser back to the sign-in page with a reason it can explain.
 *
 * `next` is carried through so a shopper who was headed for checkout lands there
 * after retrying, and it is passed through `safeNext` on the way out for the same
 * reason the service uses it on the way in — this value came from a query string
 * and is about to be a path on our own site.
 */
function bounceBack(res, reason, { next = '/account', req } = {}) {
  const params = new URLSearchParams({ error: reason })
  if (next && next !== '/account') params.set('next', safeNext(next))
  res.redirect(302, `${storefrontOrigin(req)}/sign-in?${params.toString()}`)
}

/** A short, non-identifying code for the sign-in page to interpret. */
function reasonFor(error) {
  if (error?.details?.code) return error.details.code
  if (error?.status === 503) return 'not_configured'
  if (error?.status === 403) return 'not_allowed'
  return 'failed'
}

/**
 * Start the flow.
 *
 * In production, redirects to Google's OAuth consent screen.
 * In development, if Google credentials are not yet configured, provides a
 * seamless simulated Google login so developers/testers can test Google auth
 * without blocking on Google Cloud Console setup.
 */
router.get(
  '/google',
  authLimiter,
  asyncHandler(async (req, res) => {
    const next = safeNext(req.query.next ?? '/account')
    const referer = req.get('referer')
    let origin = null
    if (referer) {
      try {
        origin = new URL(referer).origin
      } catch { }
    }
    if (!oauth.googleEnabled()) {
      return bounceBack(res, 'not_configured', { next, req })
    }
    res.redirect(302, oauth.authorizationUrl({ next, origin }))
  }),
)

/**
 * Google sends the shopper back here.
 *
 * `error` in the query is Google itself refusing — the shopper pressed Cancel on
 * the account chooser, or denied the scope — which is a normal thing to do and
 * not an error worth logging loudly.
 */
router.get(
  '/google/callback',
  asyncHandler(async (req, res) => {
    const { code, state, error: denied } = req.query

    if (denied) {
      return bounceBack(res, denied === 'access_denied' ? 'cancelled' : 'failed', { req })
    }

    try {
      const { user, customer, next, origin } = await oauth.completeSignIn({ code, state })
      /*
       * The cookie is set on the *response to Google's redirect into the API*,
       * and this is a top-level navigation on the API's own origin — so the
       * cookie is written against localhost:8000 and sent from then on by the
       * proxied `/api` calls the SPA makes. It is the same host the password
       * route sets it on, so the two flows cannot drift apart.
       */
      setSessionCookie(res, signToken(user))
      const targetOrigin = origin || storefrontOrigin(req)
      return res.redirect(302, `${targetOrigin}${next}`)
    } catch (error) {
      if (error.status && error.status < 500) {
        return bounceBack(res, reasonFor(error))
      }
      // A 5xx here is ours, not the shopper's, so it is worth a line in the log
      // before the shopper is handed something generic.
      console.error('[oauth] sign-in failed', error)
      return bounceBack(res, 'failed')
    }
  }),
)

/**
 * Attach Google to the account already signed in.
 *
 * Offered on the account page to a patron who signed up with a password. Note
 * what the state does here: it carries the user id, signed, so the callback can
 * only ever attach Google to the account that asked for it.
 */
router.get(
  '/google/link',
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!oauth.googleEnabled()) return bounceBack(res, 'not_configured', { next: '/account' })
    res.redirect(302, oauth.linkUrl(req.auth.user, { next: '/account' }))
  }),
)

/** Which methods this build offers, so the login page renders only the real ones. */
router.get(
  '/providers',
  asyncHandler(async (_req, res) => {
    res.json(oauth.providers())
  }),
)

/**
 * Set a password on an account that has none — the Google patron's way back to a
 * self-contained login. The session is the proof of identity here, so there is no
 * current password to supply; `requireAuth` is what makes that safe.
 */
router.post(
  '/password/set',
  requireAuth,
  validate('body', z.object({ password: z.string().min(8, 'A password needs at least 8 characters.') }).strip()),
  asyncHandler(async (req, res) => {
    await auth.setPassword(req.auth.user, req.body.password)
    // The version was just bumped, so this session is one of the dead ones.
    clearSessionCookie(res)
    res.status(201).json({ ok: true, message: 'Password set. Please sign in with it from now on.' })
  }),
)

/** Check if email or username is available in real time */
router.get(
  '/check-availability',
  asyncHandler(async (req, res) => {
    const { email, username } = req.query
    res.json(await auth.checkAvailability({ email, username }))
  }),
)

router.post(
  '/register',
  authLimiter,
  validate(
    'body',
    z
      .object({
        name: z.string().trim().min(1, 'A name is required.').max(80),
        email: z.string().trim().email('That is not a valid email address.'),
        username: z.string().trim().min(3, 'Username must be at least 3 characters.').max(30).optional(),
        password: z.string().min(8, 'A password needs at least 8 characters.'),
        phone: z.string().trim().min(10, 'A valid 10-digit mobile number is required.').max(24),
        city: z.string().trim().min(1, 'City is required.').max(60),
      })
      .strip(),
  ),
  asyncHandler(async (req, res) => {
    const { user, customer, emailDelivered, emailProvider, requiresEmailVerification, emailError } =
      await auth.register(req.body)
    const session = establish(res, user, customer)
    res.status(201).json({
      ...session,
      requiresEmailVerification,
      emailDelivered,
      emailProvider,
      emailError,
    })
  }),
)

router.post(
  '/login',
  authLimiter,
  authAccountLimiter,
  validate(
    'body',
    z
      .object({
        identifier: z.string().trim().optional(),
        email: z.string().trim().optional(),
        password: z.string().min(1, 'A password is required.'),
      })
      .strip(),
  ),
  asyncHandler(async (req, res) => {
    const { user, customer, requiresEmailVerification } = await auth.login(req.body)
    const session = establish(res, user, customer)
    res.json({
      ...session,
      requiresEmailVerification,
    })
  }),
)

/** Request or resend 6-digit email verification code */
router.post(
  '/email/send-code',
  optionalAuth,
  authLimiter,
  asyncHandler(async (req, res) => {
    const target = req.auth?.user || req.body?.email || req.body?.identifier
    if (!target) {
      return res.status(422).json({ message: 'An email address or account is required.' })
    }
    const result = await auth.sendEmailVerification(target)
    res.json(result)
  }),
)

/** Verify email with 6-digit PIN code */
router.post(
  '/email/verify',
  optionalAuth,
  authLimiter,
  authAccountLimiter,
  validate('body', z.object({ code: z.string().min(4, 'Enter the verification code.'), email: z.string().optional() }).strip()),
  asyncHandler(async (req, res) => {
    const target = req.auth?.user || req.body?.email
    if (!target) {
      return res.status(422).json({ message: 'An email address or sign-in session is required.' })
    }
    const result = await auth.verifyEmail(target, req.body.code)
    res.json(result)
  }),
)

/**
 * Sign out.
 *
 * Clears the cookie. Note what this does *not* do: it does not bump
 * `tokenVersion`, because that would sign the account out of every other device
 * too, and that is a separate, deliberate action (`/logout-all`).
 */
router.post(
  '/logout',
  asyncHandler(async (_req, res) => {
    clearSessionCookie(res)
    res.json({ authenticated: false })
  }),
)

/** Sign out of every device, by invalidating every token already issued. */
router.post(
  '/logout-all',
  requireAuth,
  asyncHandler(async (req, res) => {
    await auth.revokeSessions(req.auth.user)
    clearSessionCookie(res)
    res.json({ authenticated: false, message: 'Signed out on every device.' })
  }),
)

/**
 * Who am I?
 *
 * Always 200, with `authenticated: false` when there is no session. The
 * storefront asks this on load to restore a session, and a 401 would make its
 * strict `restore()` read a signed-out visitor as a backend outage.
 *
 * `session` is the idle policy (see `sessionPolicy`), sent here because both
 * apps already make this call on every load and both need the number to know
 * when to check back. `reason: 'session_expired'` says a cookie *was* sent and
 * had run out — the one case the sign-in screens have something useful to say
 * about, since "we signed you out for being away" is otherwise indistinguishable
 * from never having signed in.
 */
router.get(
  '/me',
  optionalAuth,
  asyncHandler(async (req, res) => {
    // `Cache-Control: no-store` is set for the whole API in `app.js` — this
    // endpoint especially must never be replayed from cache, because a stale
    // answer here is a stale session on screen.
    const session = sessionPolicy(req.auth?.user?.role || req.sessionRole)
    if (!req.auth) {
      return res.json({
        authenticated: false,
        user: null,
        customer: null,
        session,
        ...(req.sessionReason === 'expired' ? { reason: 'session_expired' } : {}),
      })
    }

    const { user } = req.auth
    if (!user.customer) {
      return res.json({ authenticated: true, ...auth.sessionPayload(user, null), session })
    }

    const profile = publicCustomer(user.customer, await selfStats(user.customer._id))
    return res.json({ authenticated: true, ...auth.sessionPayload(user, user.customer), profile, session })
  }),
)

router.post(
  '/password/forgot',
  authLimiter,
  validate(
    'body',
    z
      .object({
        email: z.string().trim().optional(),
        identifier: z.string().trim().optional(),
      })
      .refine((data) => Boolean(data.email || data.identifier), {
        message: 'Enter your email address or username.',
      }),
  ),
  asyncHandler(async (req, res) => {
    const identifier = req.body.identifier || req.body.email
    res.json(await auth.forgotPassword(identifier))
  }),
)

router.post(
  '/password/reset',
  authLimiter,
  authAccountLimiter,
  validate(
    'body',
    z
      .object({
        token: z.string().optional(),
        code: z.string().optional(),
        identifier: z.string().trim().optional(),
        email: z.string().trim().optional(),
        password: z.string().min(8, 'A password needs at least 8 characters.'),
      })
      .refine((data) => Boolean(data.token || (data.code && (data.identifier || data.email))), {
        message: 'Provide either a reset link token or a 6-digit code with your email/username.',
      }),
  ),
  asyncHandler(async (req, res) => {
    const user = await auth.resetPassword(req.body)
    clearSessionCookie(res)
    res.json({ ok: true, message: 'Your password has been changed. Please sign in again.', email: user.email })
  }),
)

/** Change a password from inside the account. */
router.post(
  '/password/change',
  requireAuth,
  validate('body', z.object({ current: z.string().min(1), next: z.string().min(8, 'A password needs at least 8 characters.') }).strip()),
  asyncHandler(async (req, res) => {
    await auth.changePassword(req.auth.user, req.body)
    // Every session was just invalidated, including this one.
    clearSessionCookie(res)
    res.json({ ok: true, message: 'Password changed. Please sign in again.' })
  }),
)

export default router
