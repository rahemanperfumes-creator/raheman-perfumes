/**
 * Stock-adjustment vocabulary.
 *
 * The ledger is written by the server and read through `hydrate()`; nothing here
 * is a movement. These are the reasons the adjustment modal offers and the staff
 * roles that can authorise one.
 */

/** Reasons offered by the stock-adjustment modal. */
export const ADJUSTMENT_REASONS = [
  'Restock — supplier delivery',
  'Fresh Stock Blended',
  'Damaged in transit',
  'Stock count correction',
  'Sample given',
  'Cancelled order restocked',
]

/** Staff who can authorise an adjustment. */
export const AUTHORISERS = ['Superadmin', 'Store Manager']
