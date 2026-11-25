/**
 * Order vocabulary.
 *
 * The order book itself comes from the server; nothing here is an order. These
 * are the fulfilment-path statuses the Orders screen filters and advances
 * through, the payment states a row can carry, and the helper that reads which
 * step an order sits on.
 */

/** The fulfilment path. Cancelled is a terminal state off this path, not a step. */
export const ORDER_FLOW = ['Pending', 'Packed', 'Shipped', 'Delivered']
export const ORDER_STATUSES = [...ORDER_FLOW, 'Cancelled']

export const PAYMENT_STATUSES = ['Paid', 'COD Pending', 'Refunded', 'Failed']

/** Which step of the fulfilment path an order sits on, or -1 when cancelled. */
export function flowIndex(status) {
  return ORDER_FLOW.indexOf(status)
}
