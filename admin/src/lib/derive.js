/**
 * Derivations.
 *
 * Every figure the panel shows more than once is computed here from the raw
 * store slices, and nowhere else. Keeping them as pure functions of plain data
 * (rather than zustand selectors that build a new array on every call) means a
 * component can subscribe to the slice it needs and memoise on that — which
 * avoids the re-render loop that a fresh-array selector causes.
 */

/** Products at or below their safe limit, worst first. */
export function lowStockProducts(products = []) {
  return products
    .filter((p) => p.stock <= p.safeLimit && p.status !== 'Archived')
    .sort((a, b) => a.stock / (a.safeLimit || 1) - b.stock / (b.safeLimit || 1))
}

/** Units sold × price for the whole catalogue. */
export function catalogueRevenue(products = []) {
  return products.reduce((sum, p) => sum + (p.salesYtd ?? 0) * p.price, 0)
}

/** Best sellers by units moved. */
export function topSellers(products = [], limit = 5) {
  return [...products]
    .sort((a, b) => (b.salesYtd ?? 0) - (a.salesYtd ?? 0))
    .slice(0, limit)
}

/** Orders that still need staff attention, newest first. */
export function openOrders(orders = []) {
  return orders
    .filter((o) => o.status !== 'Delivered' && o.status !== 'Cancelled')
    .sort((a, b) => (a.placedAt < b.placedAt ? 1 : -1))
}

/** The most recent orders, newest first. */
export function recentOrders(orders = [], limit = 6) {
  return [...orders].sort((a, b) => (a.placedAt < b.placedAt ? 1 : -1)).slice(0, limit)
}

/** Order count per status, for the Orders tab strip. */
export function orderStatusCounts(orders = []) {
  const counts = { All: orders.length }
  for (const order of orders) {
    counts[order.status] = (counts[order.status] ?? 0) + 1
  }
  return counts
}

/** The newest day the ledger has a row for, as `YYYY-MM-DD`. */
function ledgerLatestDay(ledger) {
  return ledger.reduce((max, row) => (row.at.slice(0, 10) > max ? row.at.slice(0, 10) : max), '')
}

/** Everything the dashboard's six tiles and its secondary panels need. */
export function dashboardTotals({ products = [], orders = [], customers = [], ledger = [] } = {}) {
  const live = orders.filter((o) => o.status !== 'Cancelled')
  const revenue = live.reduce((sum, o) => sum + o.amount, 0)
  const units = live.reduce((sum, o) => sum + o.itemCount, 0)
  const active = products.filter((p) => p.status === 'Active')

  return {
    revenue,
    orders: live.length,
    averageOrder: live.length ? Math.round(revenue / live.length) : 0,
    units,
    customers: customers.length,
    activeProducts: active.length,
    draftProducts: products.filter((p) => p.status === 'Draft').length,
    archivedProducts: products.filter((p) => p.status === 'Archived').length,
    lowStock: lowStockProducts(products),
    // Stock on hand valued at cost — what is sitting in the safe, not what it
    // would sell for. That is the figure a stock manager actually acts on.
    stockValueAtCost: products.reduce((sum, p) => sum + p.stock * p.cost, 0),
    stockValueAtRetail: products.reduce((sum, p) => sum + p.stock * p.price, 0),
    pendingOrders: orders.filter((o) => o.status === 'Pending').length,
    inFlightOrders: orders.filter((o) => o.status === 'Packed' || o.status === 'Shipped').length,
    // Read against the ledger's own newest day rather than the wall clock: real
    // ledger rows are historical, so anchoring on today's date would report zero
    // moves on a ledger that visibly has rows.
    ledgerDay: ledgerLatestDay(ledger),
    adjustmentsToday: ledger.filter((row) => row.at.slice(0, 10) === ledgerLatestDay(ledger)).length,
  }
}

/** One customer's orders, newest first. */
export function ordersForCustomer(orders = [], customerName) {
  return orders
    .filter((o) => o.customer.toLowerCase() === String(customerName ?? '').toLowerCase())
    .sort((a, b) => (a.placedAt < b.placedAt ? 1 : -1))
}

/** Products that can still be sold. */
export function sellableProducts(products = []) {
  return products.filter((p) => p.status === 'Active')
}

/**
 * Daily revenue/order buckets for the last `days` calendar days, ending today.
 *
 * Derived from the live order book rather than a seeded series: a day with no
 * orders reads `{ orders: 0, revenue: 0 }` and draws a flat bar, which is the
 * truth. Cancellations are excluded, so the figure agrees with the tiles.
 * Reads an order's date from `placedAt` (falling back to `date`), bucketed on
 * the `YYYY-MM-DD` prefix both are written with.
 */
export function dailySeries(orders = [], days = 30) {
  const live = orders.filter((o) => o.status !== 'Cancelled')
  const buckets = new Map()
  for (const order of live) {
    const day = String(order.placedAt ?? order.date ?? '').slice(0, 10)
    if (!day) continue
    const bucket = buckets.get(day) ?? { date: day, orders: 0, revenue: 0 }
    bucket.orders += 1
    bucket.revenue += order.amount ?? 0
    buckets.set(day, bucket)
  }

  const out = []
  const end = new Date()
  for (let i = days - 1; i >= 0; i -= 1) {
    const date = new Date(end)
    date.setDate(end.getDate() - i)
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    out.push(buckets.get(key) ?? { date: key, orders: 0, revenue: 0 })
  }
  return out
}

/**
 * Share of revenue by the channel an order was placed on. Percentages are of
 * the whole order book on screen, so the dashboard's mix always sums honestly.
 */
export function channelMix(orders = []) {
  const live = orders.filter((o) => o.status !== 'Cancelled')
  const total = live.reduce((sum, o) => sum + (o.amount ?? 0), 0)
  const byChannel = new Map()
  for (const order of live) {
    const raw = order.channel ?? 'Website'
    const label = raw === 'Storefront' ? 'Website' : raw
    const cur = byChannel.get(label) ?? { id: label, label, revenue: 0, orders: 0 }
    cur.revenue += order.amount ?? 0
    cur.orders += 1
    byChannel.set(label, cur)
  }
  return [...byChannel.values()]
    .map((row) => ({ ...row, share: total > 0 ? Math.round((row.revenue / total) * 100) : 0 }))
    .sort((a, b) => b.revenue - a.revenue)
}

/**
 * Share of revenue by provenance tier. An order line carries a name/SKU, not a
 * tier, so each line is resolved against the catalogue and attributed to the
 * tier of the fragrance it sold; anything that no longer resolves is `Other`.
 */
export function tierMix(orders = [], products = []) {
  const tierOf = new Map()
  for (const product of products) {
    if (product.sku) tierOf.set(product.sku, product.tier)
    if (product.name) tierOf.set(product.name, product.tier)
  }

  const live = orders.filter((o) => o.status !== 'Cancelled')
  const byTier = new Map()
  let total = 0
  for (const order of live) {
    for (const line of order.items ?? []) {
      const tier = tierOf.get(line.sku) ?? tierOf.get(line.name) ?? 'Other'
      const revenue = line.total ?? (line.qty ?? 0) * (line.price ?? 0)
      const cur = byTier.get(tier) ?? { id: tier, label: tier, revenue: 0, units: 0 }
      cur.revenue += revenue
      cur.units += line.qty ?? 0
      total += revenue
      byTier.set(tier, cur)
    }
  }
  return [...byTier.values()]
    .map((row) => ({ ...row, share: total > 0 ? Math.round((row.revenue / total) * 100) : 0 }))
    .sort((a, b) => b.revenue - a.revenue)
}
