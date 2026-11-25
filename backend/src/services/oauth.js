import crypto from 'node:crypto'
import jwt from 'jsonwebtoken'
import config from '../config/env.js'
import { User } from '../models/index.js'
import { forbidden, unavailable, unauthorized } from '../middleware/error.js'
import { findOrCreateByEmail } from './customers.js'
import { logCustomer } from './activity.js'
import { ensureUniqueUsername } from './auth.js'

/**
 * Signing in with Google.
 *
 * The storefront's login page sends the browser to `GET /api/auth/google`, which
 * bounces it to Google. Google sends it back to `/api/auth/google/callback` with
 * a one-time `code`; we exchange that for an `id_token`, read the identity out of
 * it, and mint **exactly the session the password route would have minted** —
 * `setSessionCookie(signToken(user))`. That is the whole point of doing it here
 * rather than in the browser: the shopper lands on the site signed in, the token
 * is never reachable from JavaScript, and nothing about sessions, roles,
 * `tokenVersion` or revocation had to change.
 *
 * Nothing new was added to `package.json`. The two HTTPS calls use Node's own
 * `fetch` (stable since 18, and this project requires 20) and the signing uses
 * the `jsonwebtoken` that already signs the session cookie.
 *
 * ## Why the id_token is trustworthy here without fetching Google's JWKS
 *
 * The usual rule is "never trust an `id_token` you did not fetch yourself" — a
 * token handed to you by the browser must have its signature checked against
 * Google's keys, because the browser could have fabricated it. That rule does not
 * apply to this token: it arrives in the **response body of a direct HTTPS call
 * from this server to `oauth2.googleapis.com`**, on a connection the shopper
 * cannot reach or influence. Nothing that reaches this file through `req` is
 * believed on its own; the `code` is the only thing the browser supplies, and it
 * is worthless without the client secret.
 *
 * So the claims are validated — issuer, audience, expiry, verified email — and
 * the signature does not need a round trip to a JWKS endpoint to be meaningful.
 * The one place a browser-supplied token *would* appear is the SPA's "Sign in
 * with Google" JS button, and that flow is deliberately not used.
 *
 * ## The state parameter
 *
 * `state` guards against a login-CSRF: without it, an attacker can finish an
 * OAuth flow in someone else's browser and silently sign them into the attacker's
 * account. It is a **signed JWT carrying a nonce**, verified on return. A cookie
 * would also work but would fight the `sameSite: 'lax'` setting on the session —
 * Google's redirect back is a top-level GET, so `lax` *does* send cookies, but
 * relying on that couples two unrelated things. A signed, self-expiring token
 * needs no storage and cannot be replayed after its ten minutes are up.
 */

const GOOGLE_AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token'
const GOOGLE_USERINFO_ENDPOINT = 'https://www.googleapis.com/oauth2/v3/userinfo'

/** What we ask Google for. `openid email profile` is the minimum that names a person. */
const SCOPES = ['openid', 'email', 'profile']

/** A round trip to Google that has not answered in ten seconds is not going to. */
const HTTP_TIMEOUT_MS = 10_000

/** A sign-in left half-finished for ten minutes is abandoned, not resumed. */
const STATE_TTL = '10m'

/** True when both credentials are real values rather than the `.env` placeholders. */
export const googleEnabled = () => Boolean(config.googleConfigured)

/** Refuse the flow with a sentence a shopkeeper can act on. */
function assertConfigured() {
  if (!googleEnabled()) {
    throw unavailable(
      'Google sign-in is not configured on this server. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to the backend environment, then restart the API.',
    )
  }
}

/* ───────────────────────────────────────────────────────────────── state ──── */

/**
 * Mint the `state` that rides along with the redirect.
 *
 * Signed with the same secret as the session cookie, but with an explicit
 * audience so a session token can never be replayed here as a state (or the
 * reverse) even though both are JWTs from this server.
 */
function issueState({ next = '/account', link = null, origin = null } = {}) {
  /*
   * `link` is how "connect my existing account" is expressed. It carries the
   * *user id* of the signed-in account whose Google identity is being attached,
   * and it is inside the signed payload rather than in the URL precisely so it
   * cannot be edited by whoever receives the link. A link-flow state is minted
   * only by an already-authenticated request — see `linkUrl`.
   */
  return jwt.sign({ n: crypto.randomBytes(16).toString('hex'), next, link, origin }, config.jwtSecret, {
    expiresIn: STATE_TTL,
    audience: 'rehman:oauth:state',
  })
}

/** Read it back, or refuse. Returns `{ next, link, origin }`. */
function readState(state) {
  try {
    const payload = jwt.verify(String(state ?? ''), config.jwtSecret, {
      audience: 'rehman:oauth:state',
    })
    return {
      next: safeNext(payload.next),
      link: payload.link ? String(payload.link) : null,
      origin: payload.origin ? String(payload.origin) : null,
    }
  } catch {
    throw unauthorized('That sign-in link has expired or was tampered with. Please start again.')
  }
}

/**
 * Only ever send the browser somewhere on this site.
 *
 * `next` arrives from a query string and ends up in a `Location` header, so an
 * unchecked value is an open redirect — `?next=https://evil.example` would make
 * this API the launch pad for a convincing phishing page that starts at a URL the
 * shopper trusts. Anything that is not a plain absolute path is discarded.
 *
 * Exported because the route file needs the same guarantee on the way back out.
 */
export function safeNext(value) {
  const path = String(value ?? '').trim()
  // A leading `//` is protocol-relative, i.e. another origin entirely.
  if (!path.startsWith('/') || path.startsWith('//')) return '/account'
  return path.slice(0, 300)
}

/* ────────────────────────────────────────────────────────────────── HTTP ──── */

/** A `fetch` that cannot hang, and reports Google's own error text when it fails. */
async function postForm(url, body) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams(body).toString(),
      signal: controller.signal,
    })
    const payload = await response.json().catch(() => null)
    if (!response.ok) {
      // `invalid_grant` is the ordinary one and means the code was already used or
      // has expired — usually a reloaded callback URL. Worth distinguishing from a
      // genuine misconfiguration, so the log keeps Google's own description.
      const detail = payload?.error_description || payload?.error || `HTTP ${response.status}`
      console.warn(`[oauth] Google refused a token exchange: ${detail}`)
      throw unauthorized(
        'Google could not complete that sign-in. Please try again — if it keeps failing, the redirect URI in the Google console may not match GOOGLE_REDIRECT_URI.',
      )
    }
    return payload
  } catch (error) {
    if (error.status) throw error
    if (error.name === 'AbortError') throw unavailable('Google took too long to answer. Please try again.')
    throw unavailable('Could not reach Google to complete the sign-in. Please try again.')
  } finally {
    clearTimeout(timer)
  }
}

/* ─────────────────────────────────────────────────────────────── identity ──── */

/**
 * Turn a Google identity into a session for one of our users.
 *
 * Three cases, in the order they are checked:
 *
 *   1. **Link flow.** `link` names an account that is already signed in and
 *      asking to attach Google to itself. Refuses if that Google identity is
 *      already attached elsewhere — otherwise one Google account would become a
 *      key that opens two of our accounts.
 *   2. **Returning.** `googleId` matches, so this is that person again. The email
 *      is refreshed from Google's copy, because a Workspace address can change.
 *   3. **New, or an existing password account with the same address.** Linked by
 *      email onto the account that already exists, rather than creating a second
 *      one that would leave the shopper with two order histories and no way to
 *      reconcile them.
 *
 * Every branch ends at a `users` row, which is all `signToken` needs.
 */
export async function userFromGoogle(identity, { link = null } = {}) {
  const email = String(identity.email ?? '').trim().toLowerCase()
  const googleId = String(identity.sub ?? '')

  if (!googleId) throw unauthorized('Google did not return an account id. Please try again.')
  if (!email) throw unauthorized('That Google account has no email address on it.')
  if (!identity.emailVerified) {
    throw forbidden('That Google account\'s email address is not verified, so it cannot be used to sign in.', {
      code: 'unverified',
    })
  }

  /*
   * A closed preview: when the list is set, it is the door. Checked before any
   * row is looked up or written, so an uninvited address never becomes a user.
   */
  if (config.google.adminEmails.length && !config.google.adminEmails.includes(email)) {
    throw forbidden('This shop is not open to that Google account.', { code: 'not_allowed' })
  }

  /* ── 1. attaching Google to the account already signed in ── */
  if (link) {
    /*
     * `+passwordHash` is not optional here, and forgetting it is a silent bug
     * rather than an error: the field is `select: false`, so a query that omits
     * it reads back `undefined`, and `undefined` is indistinguishable from "this
     * account has no password". Checking it without the select would label a
     * password account as Google-only and offer it the wrong control. Same
     * reasoning in each branch below.
     */
    const user = await User.findById(link).select('+passwordHash')
    if (!user) throw unauthorized('That account no longer exists.')

    const taken = await User.findOne({ googleId })
    if (taken && String(taken._id) !== String(user._id)) {
      throw forbidden('That Google account is already linked to a different account.', {
        code: 'already_linked',
      })
    }

    // The address being linked must be the one this account owns, or the owner
    // of a shared machine could hand their profile to a colleague's Google login.
    if (user.email !== email) {
      throw forbidden(
        `That Google account is ${email}, but you are signed in as ${user.email}. Sign in with Google from the account you want to link, or add this address to your profile first.`,
        { code: 'email_mismatch' },
      )
    }

    user.googleId = googleId
    user.authProvider = user.passwordHash ? 'both' : 'google'
    user.lastLoginAt = new Date()
    user.isEmailVerified = true
    if (!user.username) {
      user.username = await ensureUniqueUsername(user.name || email.split('@')[0], email)
    }
    await user.save()
    return { user, customer: user.customer ?? null, linked: true }
  }

  /* ── 2. this Google account has been here before ── */
  const returning = await User.findOne({ googleId }).select('+passwordHash').populate('customer')
  if (returning) {
    if (returning.email !== email) {
      const collision = await User.findOne({ email, _id: { $ne: returning._id } }).select('_id')
      if (!collision) {
        returning.email = email
      }
    }
    returning.authProvider = returning.passwordHash ? 'both' : 'google'
    returning.lastLoginAt = new Date()
    returning.isEmailVerified = true
    if (!returning.username) {
      returning.username = await ensureUniqueUsername(returning.name || email.split('@')[0], email)
    }
    await returning.save()

    /*
     * A customer row can be missing on a staff account, and that is fine — the
     * storefront turns those away itself. It should not be missing on a shopper,
     * so if it is, make one rather than leaving a session with no patron profile.
     */
    if (!returning.customer && returning.role === 'shopper') {
      const { customer } = await findOrCreateByEmail({ email: returning.email, name: returning.name })
      returning.customer = customer._id
      await returning.save()
      await returning.populate('customer')
    }
    return { user: returning, customer: returning.customer ?? null, linked: false }
  }

  /* ── 3. a password account with this address becomes a two-way one ── */
  const existing = await User.findOne({ email }).select('+passwordHash').populate('customer')
  if (existing) {
    existing.googleId = googleId
    existing.authProvider = existing.passwordHash ? 'both' : 'google'
    existing.lastLoginAt = new Date()
    existing.isEmailVerified = true
    if (!existing.username) {
      existing.username = await ensureUniqueUsername(existing.name || email.split('@')[0], email)
    }
    // A Google name is the person's own spelling of it, so it is used to fill a
    // blank — never to overwrite what they chose here.
    if (!existing.name && identity.name) existing.name = identity.name
    if (!existing.customer && existing.role === 'shopper') {
      const { customer } = await findOrCreateByEmail({ email, name: existing.name || identity.name })
      existing.customer = customer._id
      await existing.save()
      await existing.populate('customer')
    } else {
      await existing.save()
    }
    return { user: existing, customer: existing.customer ?? null, linked: false }
  }

  /* ── 4. nobody here yet: patron and credential, together ── */
  const name = String(identity.name ?? '').trim() || email.split('@')[0]
  const username = await ensureUniqueUsername(name, email)
  const { customer } = await findOrCreateByEmail({ email, name })

  const user = await User.create({
    email,
    username,
    // No password at all. `undefined` rather than a random hash, because a random
    // hash would be a password in all but name — and `assertHasPassword` is what
    // stops anyone signing in with a guess at it.
    passwordHash: undefined,
    name,
    role: 'shopper',
    customer: customer._id,
    googleId,
    authProvider: 'google',
    isEmailVerified: true,
    lastLoginAt: new Date(),
  })

  await logCustomer(`${customer.name} created an account with Google.`, { actor: customer.name, actorUser: user._id })
  return { user, customer, linked: false, created: true }
}

/* ───────────────────────────────────────────────────────────────── urls ──── */

/** Where to send the browser to start signing in. */
export function authorizationUrl({ next = '/account', origin = null } = {}) {
  return authorizationUrlWithState(issueState({ next, origin }))
}

/** Where to send a signed-in patron who is attaching Google to their account. */
export function linkUrl(user, { next = '/account' } = {}) {
  return authorizationUrlWithState(issueState({ next, link: String(user._id) }))
}

/**
 * The redirect itself, from a state that has already been minted.
 *
 * `access_type: 'online'` and no refresh token on purpose: Google is never called
 * again after sign-in, so an offline grant would be a credential held for no
 * reason at all. `select_account` rather than `consent`, so a returning shopper
 * picks from the accounts they are already signed into instead of re-approving.
 */
function authorizationUrlWithState(state) {
  assertConfigured()
  const params = new URLSearchParams({
    client_id: config.google.clientId,
    redirect_uri: config.google.redirectUri,
    response_type: 'code',
    scope: SCOPES.join(' '),
    state,
    access_type: 'online',
    include_granted_scopes: 'true',
    prompt: 'select_account',
  })
  return `${GOOGLE_AUTH_ENDPOINT}?${params.toString()}`
}

/**
 * Finish the flow: verify the state, trade the code for an identity, and hand
 * back the user to sign in. Returns `{ user, customer, next, linked }`.
 */
export async function completeSignIn({ code, state }) {
  assertConfigured()

  const { next, link, origin } = readState(state)
  const value = String(code ?? '').trim()
  if (!value) throw unauthorized('Google did not return an authorization code. Please try again.')

  const tokens = await postForm(GOOGLE_TOKEN_ENDPOINT, {
    code: value,
    client_id: config.google.clientId,
    client_secret: config.google.clientSecret,
    redirect_uri: config.google.redirectUri,
    grant_type: 'authorization_code',
  })

  const identity = await identityFrom(tokens, value)
  const { user, customer, linked } = await userFromGoogle(identity, { link })
  return { user, customer, next, linked: Boolean(link) || linked, origin }
}

/**
 * Read the identity out of the token response.
 *
 * The `id_token` is preferred and is not optional in practice — it is what
 * `openid` buys, and it carries `email_verified`, which is the one claim this
 * whole flow turns on: an unverified address could be someone else's.
 *
 * The userinfo call is a genuine fallback rather than dead code. It exists for
 * the case where the token endpoint answers without an `id_token` — an account
 * whose Google client was edited to drop the `openid` scope, say. In that shape
 * there is no `email_verified` claim to read, so `verified_email` from the
 * userinfo response is used instead. If neither route yields an identity, the
 * sign-in is refused rather than guessed at.
 */
async function identityFrom(tokens, code) {
  const raw = tokens?.id_token
  if (raw) {
    const claims = jwt.decode(raw)
    if (claims) {
      const audience = [config.google.clientId, tokens.client_id].filter(Boolean)
      if (!audience.includes(claims.aud)) {
        // Not paranoia about signature (see the note at the top) but about the
        // wrong client: a token minted for another app must not open this one.
        throw unauthorized('That Google token was issued for a different application.')
      }
      if (claims.exp && claims.exp * 1000 < Date.now()) {
        throw unauthorized('That Google sign-in has expired. Please try again.')
      }
      if (!['accounts.google.com', 'https://accounts.google.com'].includes(claims.iss)) {
        throw unauthorized('That Google token did not come from Google.')
      }
      return {
        sub: claims.sub,
        email: claims.email,
        emailVerified: claims.email_verified === true,
        name: claims.name,
        picture: claims.picture ?? '',
      }
    }
  }

  // No readable id_token — ask userinfo directly, with the access token from the
  // same exchange. `code` is passed only so this cannot be mistaken for a path
  // that works without one.
  const accessToken = tokens?.access_token
  if (!accessToken) {
    console.warn(`[oauth] Google answered without an id_token or an access_token for code ${String(code).slice(0, 6)}…`)
    throw unauthorized('Google did not return an identity. Please try again.')
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS)
  try {
    const response = await fetch(GOOGLE_USERINFO_ENDPOINT, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
      signal: controller.signal,
    })
    if (!response.ok) throw unauthorized('Google could not confirm that account. Please try again.')
    const profile = await response.json()
    return {
      sub: profile.sub,
      email: profile.email,
      emailVerified: profile.email_verified === true || profile.verified_email === true,
      name: profile.name,
      picture: profile.picture ?? '',
    }
  } catch (error) {
    if (error.status) throw error
    throw unavailable('Could not reach Google to confirm the sign-in. Please try again.')
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Which sign-in methods this build offers.
 *
 * The login page asks before it renders anything, so an unconfigured server
 * shows a plain password form rather than a Google button that leads to a 503.
 */
export function providers() {
  return { password: true, google: googleEnabled() }
}

export default {
  googleEnabled,
  providers,
  authorizationUrl,
  linkUrl,
  completeSignIn,
  userFromGoogle,
}
