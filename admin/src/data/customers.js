/**
 * Customer vocabulary.
 *
 * The customer book is read from the server; nothing here is a patron. These
 * are the status values the Customers screen filters on, and the lifetime-value
 * band the drawer prints from a row's own `totalSpent`.
 */

export const CUSTOMER_STATUSES = ['Active', 'VIP', 'Blocked']

/** Lifetime value band, used for the drawer's headline figure. */
export function customerBand({ totalSpent }) {
  if (totalSpent >= 200000) return 'Platinum'
  if (totalSpent >= 100000) return 'Gold'
  if (totalSpent >= 40000) return 'Silver'
  return 'Bronze'
}
