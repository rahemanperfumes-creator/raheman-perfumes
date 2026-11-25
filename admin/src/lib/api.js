/**
 * Single gateway to the backend service.
 *
 * Every admin read goes through `api.get`/`api.post` and every write through
 * `api.mutate`, and all of them are **strict**: if the backend does not answer,
 * the call fails. There are no local fixtures to degrade to — the panel shows
 * an empty state and says the server is unreachable rather than rendering rows
 * nobody listed.
 *
 * The base URL comes from VITE_API_BASE_URL (default `/api`, proxied by Vite to
 * the backend origin in dev).
 */

const BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '/api').replace(/\/$/, '')

export const API_ORIGIN = /^https?:\/\//i.test(BASE_URL) ? BASE_URL.replace(/\/api$/, '') : ''

/** Turn local backend uploads into absolute reachable URLs when running on deployed hosting. */
export function resolveImageUrl(url) {
  if (!url || typeof url !== 'string') return ''
  if (url.startsWith('/api/uploads/')) {
    return API_ORIGIN ? `${API_ORIGIN}${url}` : url
  }
  return url
}

/**
 * Who to tell when the server answers **401**.
 *
 * A session can end *mid-shift* rather than at a page load: the token idles out
 * after four hours, so an owner who leaves the panel open over lunch comes back
 * to a session that is already gone. Every screen would otherwise meet that at
 * its own error panel — `useServerResource` would say "your session has ended"
 * inside one card while the rest of the panel went on rendering, and the tables
 * backed by `useAdminStore` would show their fixtures as though nothing had
 * happened. One panel-wide reaction is the honest one.
 *
 * The store registers itself here rather than this file importing the store,
 * which would be a cycle: the store already imports this module.
 *
 * It is deliberately a single slot and not an event bus — there is exactly one
 * session, and a second listener would be a second opinion about it.
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
  signal?.addEventListener('abort', () => controller.abort(), { once: true })

  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      method,
      // Never read from or write to the HTTP cache. The backend sends
      // `Cache-Control: no-store` for every API route; asking for it on the
      // request side too means a reload always shows what the server holds
      // right now — never a replayed table, ledger, or session answer.
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
      // The admin session cookie is httpOnly and set by the backend.
      credentials: 'include',
    })

    const isJson = response.headers.get('content-type')?.includes('application/json')
    const payload = isJson ? await response.json() : await response.text()

    if (!response.ok) {
      /*
       * 401 — and only 401 — is the session being *gone*. A 403 is the opposite
       * (signed in, not senior enough) and must not close the panel.
       *
       * Notified before the throw so the store has already flipped to the
       * sign-in screen by the time the screen that made the call renders its
       * failure; that screen is about to be unmounted anyway.
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
 * `npm run dev` restarts the API whenever a source file changes, and the
 * storefront reaches it through Vite's proxy. For the second or two a restart
 * takes — plus the time to re-open the Atlas connection — the proxy has nothing
 * to talk to and answers **500** for *every* request on the page at once. The
 * result used to be a console full of failures and eight separately panicked
 * error panels, none of which described anything that had gone wrong with the
 * data or with the operator's own actions.
 *
 * So the shapes a restart makes are named, and only they are treated as
 * blips: **0** (never got there), **408** (our own abort), and the 5xx family
 * the proxy emits on the gap. A 401 is deliberately absent — the session is a
 * verdict, and asking twice only says it twice.
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
 * Reads only, by default. A **write is never retried**, because a request that
 * vanished into a restart may well have landed before the process died, and a
 * second copy of "adjust stock" or "take payment" is a real error rather than a
 * cosmetic one. A retried read can only ever be stale for a moment longer.
 *
 * Signing in is the one write that opts in, per call: a second `/auth/login`
 * asks for the same session and costs nothing, while the alternative is the
 * operator watching a 500 on the sign-in door because a source file was saved
 * half a second before they pressed the button.
 */
async function request(path, { method = 'GET', body, headers, signal, timeout = 12000, retries } = {}) {
  const attempts = retries ?? (method === 'GET' ? 1 : 0)

  for (let attemptNumber = 0; ; attemptNumber += 1) {
    try {
      return await attempt(path, { method, body, headers, signal, timeout })
    } catch (error) {
      // Someone cancelled the call (a screen unmounted mid-flight): the failure
      // is the point, and waiting to repeat it would be worse.
      if (attemptNumber >= attempts || signal?.aborted || !isBlip(error)) throw error
      await sleep(BLIP_DELAY_MS)
    }
  }
}

/**
 * Is this failure the backend saying *"not you"* rather than *"not here"*?
 *
 * The distinction still matters with no fallback to decide: `requireStaff`
 * answers **401** to a request with no session and **403** to one that has a
 * session but not the rank. Screens read this to say "your session has ended"
 * instead of "the change was refused".
 */
const isAuthRefusal = (error) => error.status === 401 || error.status === 403

/**
 * Send a **write**, strictly.
 *
 * Resolves `{live: true, data}` when the backend took the change, and throws
 * otherwise — whether the server refused it (4xx) or never answered at all.
 * There is no offline branch any more: a write the server has not taken is a
 * write that did not happen, and the panel must not look like it happened.
 *
 * @param {string} path
 * @param {{method?: string, body?: any, retries?: number}} [options] `retries`
 *   opts a write into the restart retry. Only for a request that is safe to send
 *   twice — sign-in is, an order is not.
 * @returns {Promise<{live: true, data: any}>}
 */
async function mutate(path, { method = 'POST', body, retries } = {}) {
  return { live: true, data: await request(path, { method, body, retries }) }
}

/**
 * Send a **multipart** body. File uploads, and only file uploads.
 *
 * Separate from `request` for a reason that cannot be worked around: `request`
 * sets `Content-Type: application/json` and `JSON.stringify`s whatever it is
 * given. A `FormData` body must be sent with **no** `Content-Type` of its own,
 * because only the browser knows the multipart boundary it generated — setting
 * one by hand produces a body the server cannot parse, and the failure looks
 * like a corrupt file rather than a wrong header.
 *
 * It throws, like every other call here: there is nowhere local for a
 * photograph to go that the website could later load it from, so a fallback
 * could only invent a URL for a file nobody stored. The failure is reported,
 * at the drop zone, where the operator can retry it.
 *
 * The timeout is much longer than a JSON call's: a 5 MB photograph on a domestic
 * uplink takes far longer than a query, and the twelve-second default would
 * abort a perfectly healthy upload.
 */
async function upload(path, formData, { timeout = 120000 } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)

  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      // A POST response is never served from cache anyway; `no-store` keeps
      // the rule uniform across every request the panel makes.
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      body: formData,
      signal: controller.signal,
      credentials: 'include',
    })

    const isJson = response.headers.get('content-type')?.includes('application/json')
    const payload = isJson ? await response.json() : await response.text()

    if (!response.ok) {
      if (response.status === 401) sessionEndedHandler?.()
      throw new ApiError(payload?.message || `Upload failed (${response.status})`, {
        status: response.status,
        payload,
      })
    }
    return payload
  } catch (error) {
    if (error instanceof ApiError) throw error
    if (error.name === 'AbortError') throw new ApiError('The upload timed out', { status: 408 })
    throw new ApiError(error.message || 'Network error', { status: 0 })
  } finally {
    clearTimeout(timer)
  }
}

export const api = {
  get: (path, options) => request(path, { ...options, method: 'GET' }),
  post: (path, body, options) => request(path, { ...options, method: 'POST', body }),
  put: (path, body, options) => request(path, { ...options, method: 'PUT', body }),
  patch: (path, body, options) => request(path, { ...options, method: 'PATCH', body }),
  delete: (path, options) => request(path, { ...options, method: 'DELETE' }),
  upload,
  mutate,
  isAuthRefusal,
  BASE_URL,
}

export default api
