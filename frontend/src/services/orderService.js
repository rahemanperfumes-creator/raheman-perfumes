import api from '@/lib/api'

/**
 * Public order lookups — no session, no account.
 *
 * Kept out of `authService` on purpose. That service's order calls
 * (`orders()`, `placeOrder()`) are **account** reads: they answer for the
 * signed-in patron and are meaningless without a session. This one answers for
 * anybody holding an order number, which is what the tracking page is for, and
 * the two must not drift into each other.
 */
export const orderService = {
  /**
   * Look up one consignment. Optionally verify with mobile phone number to unlock full details.
   */
  track: (number, phone = '') => {
    const q = phone ? `?phone=${encodeURIComponent(phone)}` : ''
    return api.get(`/orders/track/${encodeURIComponent(number)}${q}`)
  },
}

export default orderService
