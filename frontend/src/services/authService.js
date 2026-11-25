import api, { apiUrl } from '@/lib/api'

/**
 * The shopper's session and account, against the backend.
 *
 * Every call here is a **write or a private read**, and every one is strict:
 * no server means no session, no orders, no coupon — a local fixture standing
 * in for any of them would be a lie rather than a convenience. `api.mutate`
 * resolves only a real `{live: true, data}` and throws otherwise, so callers
 * surface the failure instead of degrading to made-up rows.
 *
 * The session itself is an **httpOnly cookie**, which is why nothing here
 * handles or stores a token. `credentials: 'include'` in `lib/api.js` is the
 * whole of the client's involvement, and the token is never reachable from
 * JavaScript.
 */

/**
 * Where to send the browser to sign in with Google.
 *
 * Not a `fetch` and not a `mutate`: this is a **navigation**, because the whole
 * OAuth exchange happens between the browser and Google. The API redirects there
 * itself and comes back with the session cookie already set, so there is no
 * response for this to await — the page simply leaves. A relative URL is enough
 * (the dev proxy and any production reverse proxy both serve `/api` on this
 * origin), and it keeps the flow correct under whatever host the shop is reached
 * at, `localhost` or not.
 */
export const googleSignInUrl = (next = '/account') =>
  apiUrl(`/auth/google?${new URLSearchParams({ next })}`)

/** Which sign-in methods the backend offers. Google is absent until it is configured. */
export const signInProviders = () => api.get('/auth/providers')

/** Sign in, register, and the session questions around them. */
export const authService = {
  /**
   * Who is signed in?
   *
   * Always 200 — `optionalAuth` on the server answers `{authenticated: false}`
   * rather than 401, precisely so that "signed out" and "server down" stay
   * distinguishable here. A rejection therefore means the server never answered.
   */
  me: () => api.get('/auth/me'),

  /**
   * Ask for a session.
   *
   * Accepts identifier (email or username) and password.
   */
  login: (identifier, password) =>
    api.mutate('/auth/login', { method: 'POST', body: { identifier, password }, retries: 1 }),

  register: (draft) => api.mutate('/auth/register', { method: 'POST', body: draft }),

  logout: () => api.mutate('/auth/logout', { method: 'POST' }),

  checkAvailability: ({ email, username }) => {
    const params = new URLSearchParams()
    if (email) params.set('email', email)
    if (username) params.set('username', username)
    return api.get(`/auth/check-availability?${params.toString()}`)
  },

  sendVerificationCode: (identifier) =>
    api.mutate('/auth/email/send-code', { method: 'POST', body: { identifier } }),

  verifyEmail: (code, email) =>
    api.mutate('/auth/email/verify', { method: 'POST', body: { code, email } }),

  forgotPassword: (identifier) =>
    api.mutate('/auth/password/forgot', { method: 'POST', body: { identifier } }),

  resetPassword: (payload) =>
    api.mutate('/auth/password/reset', { method: 'POST', body: payload }),

  /**
   * Give a password to an account that signed up with Google.
   *
   * No current password — the session is the proof. The server bumps
   * `tokenVersion`, so this session ends with it and the shopper signs in again.
   */
  setPassword: (password) => api.mutate('/auth/password/set', { method: 'POST', body: { password } }),

  /** Attach Google to the account already signed in. A navigation, like `googleSignInUrl`. */
  googleLinkUrl: (next = '/account') =>
    apiUrl(`/auth/google/link?${new URLSearchParams({ next })}`),

  providers: () => api.get('/auth/providers'),

  /* ─────────────────────────────────────────────────────── profile ──── */

  profile: () => api.get('/account/profile'),
  saveProfile: (patch) => api.mutate('/account/profile', { method: 'PATCH', body: patch }),

  /* ───────────────────────────────────────────────────── addresses ──── */

  addresses: () => api.get('/account/addresses'),
  addAddress: (address) => api.mutate('/account/addresses', { method: 'POST', body: address }),
  updateAddress: (id, patch) => api.mutate(`/account/addresses/${id}`, { method: 'PATCH', body: patch }),
  setDefaultAddress: (id) => api.mutate(`/account/addresses/${id}/default`, { method: 'POST' }),
  removeAddress: (id) => api.mutate(`/account/addresses/${id}`, { method: 'DELETE' }),

  /* ────────────────────────────────────────────────────────── orders ──── */

  orders: () => api.get('/account/orders'),

  cancelOrder: (orderNumber, { upiId = '', reason = '' } = {}) =>
    api.mutate(`/account/orders/${encodeURIComponent(orderNumber)}/cancel`, {
      method: 'POST',
      body: { upiId, reason },
    }),

  /**
   * Place an order.
   *
   * The basket goes up as **slugs and sizes, never prices** — the server reads
   * each price off its own volume ladder, because a price the browser supplied is
   * a price the browser could have edited. It answers `{order, tracking}`.
   */
  placeOrder: (payload, { idempotencyKey } = {}) =>
    api.mutate('/orders', {
      method: 'POST',
      body: payload,
      ...(idempotencyKey ? { headers: { 'Idempotency-Key': idempotencyKey } } : {}),
    }),

  /** Check a code against the basket. The server owns the coupon arithmetic. */
  validateCoupon: (code, subtotal) =>
    api.mutate('/coupons/validate', { method: 'POST', body: { code, subtotal } }),

  /* ──────────────────────────────────────────────────────── payments ──── */

  getRazorpayConfig: () => api.get('/payments/razorpay/config'),

  createRazorpayOrder: (payload) =>
    api.mutate('/payments/razorpay/create-order', { method: 'POST', body: payload }),

  /* ──────────────────────────────────────────────────────── wishlist ──── */

  wishlist: () => api.get('/account/wishlist'),

  /** Replace the whole list — the shape for a client that keeps one locally. */
  setWishlist: (productIds) => api.mutate('/account/wishlist', { method: 'PUT', body: { productIds } }),
}

export default authService
