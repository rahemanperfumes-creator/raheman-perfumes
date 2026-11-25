/**
 * Single gateway to the backend service.
 *
 * Every read the storefront performs goes through `api.get`/`api.post`, and the
 * backend is the **only** source: there is no bundled catalogue and no local
 * stand-in. A call that fails — refused or unreachable — rejects, and the screen
 * that made it says so. The shop's data is whatever the admin has actually
 * listed, and nothing else.
 *
 * The base URL comes from VITE_API_BASE_URL (default `/api`, proxied by Vite
 * to the backend origin in dev). Nothing here is admin-facing: admin pages
 * live in the separate `admin/` app and consume the same backend.
 */

function sanitizeBaseUrl(raw) {
  if (!raw) return '/api'
  let url = String(raw).trim().replace(/\/$/, '')
  // Guard against accidental double paste in hosting env (e.g., domain.comhttps://domain.com/api)
  const httpsIdx = url.lastIndexOf('https://')
  const httpIdx = url.lastIndexOf('http://')
  const protocolIdx = Math.max(httpsIdx, httpIdx)
  if (protocolIdx > 0) {
    url = url.slice(protocolIdx)
  } else if (!/^https?:\/\//i.test(url) && !url.startsWith('/')) {
    url = `https://${url}`
  }
  return url
}

const BASE_URL = sanitizeBaseUrl(import.meta.env.VITE_API_BASE_URL)

/**
 * The absolute origin the API is reached at, for the handful of things that
 * cannot be a relative fetch.
 *
 * **"Continue with Google" is one of those.** The flow is browser navigations
 * rather than `fetch` calls, so the URL has to be absolute or the SPA's own route
 * table would try to handle it. Deriving it from `location.origin` rather than
 * hard-coding `http://localhost:8000` is what makes the flow work in both
 * arrangements without a config line:
 *
 *   • **Through the Vite dev proxy (the default).** The browser goes to
 *     `http://localhost:5173/api/auth/google`, Vite forwards it to the API, and
 *     the same session cookie is written against `localhost` — so the storefront
 *     and the callback are one origin and the cookie is sent by both.
 *   • **Straight at a deployed API.** `VITE_API_BASE_URL` is an absolute URL like
 *     `https://api.example.com/api`, and that is used as-is.
 *
 * With the proxy, `GOOGLE_REDIRECT_URI` on the backend must point at the
 * **dev-server** origin (`http://localhost:5173/api/auth/google/callback`) rather
 * than at port 8000 — see the note in `backend/.env.example`. It still needs to be
 * an origin the API itself sees the callback on, which the proxy guarantees.
 */
export const API_ORIGIN = /^https?:\/\//i.test(BASE_URL) ? BASE_URL.replace(/\/api$/, '') : ''

/** Absolute, navigable URL for a backend path. */
export function apiUrl(path) {
  const suffix = path.startsWith('/') ? path : `/${path}`
  return `${BASE_URL}${suffix}`
}

/**
 * Who to tell when the server answers **401**.
 *
 * A shopper's session can end while a tab sits open — it idles out after four
 * hours — and the account surfaces read from `useAuthStore`, which would go on
 * holding the last known patron. Without this, a shopper would be looking at
 * their own orders after the server had stopped recognising them, and only find
 * out on the click that mattered.
 *
 * The store registers itself here rather than this file importing the store,
 * which would be a cycle: the store already imports this module.
 *
 * Deliberately one slot and not an event bus — there is exactly one session, and
 * a second listener would be a second opinion about it.
 */
let sessionEndedHandler = null

/** Register the one listener called on a 401. */
export function setSessionEndedHandler(handler) {
  sessionEndedHandler = handler
}

export class ApiError extends Error {
  constructor(message, { status = 0, payload = null } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.payload = payload
  }
}

async function attempt(path, { method = 'GET', body, headers, signal, timeout = 12000 } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  // Let a caller-supplied signal also abort the request (used by live search).
  signal?.addEventListener('abort', () => controller.abort(), { once: true })

  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      method,
      // Never read from or write to the HTTP cache. The backend sends
      // `Cache-Control: no-store` for every API route; asking for it on the
      // request side too means a reload always shows what the server holds
      // right now — never a replayed catalogue, cart, or session answer.
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
      credentials: 'include',
    })

    const isJson = response.headers.get('content-type')?.includes('application/json')
    const payload = isJson ? await response.json() : await response.text()

    if (!response.ok) {
      /*
       * 401 — and only 401 — is the session being *gone*. A 403 is the opposite
       * (signed in, but this account may not do that) and must not sign anyone
       * out.
       *
       * Notified before the throw so the store has settled by the time the
       * caller's catch runs and decides what to show.
       */
      if (response.status === 401) sessionEndedHandler?.()
      throw new ApiError(payload?.message || `Request failed (${response.status})`, {
        status: response.status,
        payload,
      })
    }
    return payload
  } catch (error) {
    if (error instanceof ApiError) throw error
    if (error.name === 'AbortError') throw new ApiError('Request timed out', { status: 408 })
    throw new ApiError(error.message || 'Network error', { status: 0 })
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Did the server fail to *answer*, as opposed to answering "no"?
 *
 * `npm run dev` restarts the API whenever a source file changes, and the shop
 * reaches it through Vite's proxy. For the second or two a restart takes — plus
 * the time to re-open the Atlas connection — the proxy has nothing to talk to
 * and answers **500** for every request the page made, so a catalogue that is
 * perfectly healthy looks for a moment like a shop that has lost it. The shapes
 * a restart makes are therefore named and only they are treated as blips:
 * **0** (never got there), **408** (our own abort), and the 5xx family. A 401
 * is absent on purpose — a refusal is a verdict, and asking twice only says it
 * twice.
 */
const isBlip = (error) =>
  error instanceof ApiError &&
  (error.status === 0 || error.status === 408 || error.status >= 500)

/** Long enough for a restart to finish, short enough to feel instant. */
const BLIP_DELAY_MS = 900

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Send a request, giving a restarting server one chance to come back.
 *
 * Reads only. A **write is never retried**: a request that vanished into a
 * restart may well have landed before the process died, and a second copy of
 * an order is a real error rather than a cosmetic one. A retried read can only
 * ever be stale for a moment longer.
 */
async function request(path, { method = 'GET', body, headers, signal, timeout = 12000, retries } = {}) {
  const attempts = retries ?? (method === 'GET' ? 1 : 0)

  for (let attemptNumber = 0; ; attemptNumber += 1) {
    try {
      return await attempt(path, { method, body, headers, signal, timeout })
    } catch (error) {
      // A cancelled call (live search, or a screen unmounted mid-flight) is the
      // caller withdrawing the question, not the server failing to answer it.
      if (attemptNumber >= attempts || signal?.aborted || !isBlip(error)) throw error
      await sleep(BLIP_DELAY_MS)
    }
  }
}

/**
 * Resolve a **write**.
 *
 * Returns `{live: true, data}` when the server took the change, and **throws**
 * otherwise — a refusal (4xx) or an unreachable backend are both failures the
 * caller must surface, because there is no local stand-in any more. An order
 * the shop believes it placed but the server never took is the one outcome a
 * store cannot be built on.
 *
 * Writes are not retried after a restart blip unless the caller says so: a
 * request that vanished mid-restart may already have landed, and a second
 * `POST /orders` is a duplicate order.
 *
 * @param {string} path
 * @param {{method?: string, body?: any, retries?: number}} [options] `retries`
 *   opts a write into the restart retry. Only for a request that is safe to send
 *   twice — sign-in is, an order is not.
 * @returns {Promise<{live: true, data: any}>}
 */
async function mutate(path, { method = 'POST', body, headers, retries } = {}) {
  return { live: true, data: await request(path, { method, body, headers, retries }) }
}

export const api = {
  get: (path, options) => request(path, { ...options, method: 'GET' }),
  post: (path, body, options) => request(path, { ...options, method: 'POST', body }),
  put: (path, body, options) => request(path, { ...options, method: 'PUT', body }),
  patch: (path, body, options) => request(path, { ...options, method: 'PATCH', body }),
  delete: (path, options) => request(path, { ...options, method: 'DELETE' }),
  mutate,
  BASE_URL,
}

export default api
