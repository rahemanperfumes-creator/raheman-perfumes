/**
 * Order-status chip styles.
 *
 * The account's orders, addresses and archive used to be bundled demo rows.
 * They are gone: everything on the account surfaces now comes from the server
 * through `authStore`. What is left here is only the label→tone map the order
 * chips paint with.
 */

export const ORDER_STATUS = {
  Delivered: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  Shipped: 'bg-sky-50 text-sky-800 border-sky-200',
  'In Transit': 'bg-sky-50 text-sky-800 border-sky-200',
  'Order Confirmed': 'bg-emerald-50 text-emerald-800 border-emerald-200',
  Confirmed: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  Processing: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  Packaging: 'bg-amber-50 text-amber-800 border-amber-200',
  'Mixing in Lab': 'bg-violet-50 text-violet-800 border-violet-200',
  Cancelled: 'bg-rose-50 text-rose-800 border-rose-200',
}

export function formatOrderStatus(status) {
  if (!status) return ''
  const s = String(status).trim()
  if (s.toLowerCase() === 'processing' || s.toLowerCase() === 'pending') {
    return 'Order Confirmed'
  }
  return s
}
