/**
 * Maison vocabulary.
 *
 * Like the categories, this holds only what a human decides about *naming* —
 * the house types and the status list. The maisons themselves are read from the
 * server, and each one's product count and revenue are derived from the live
 * catalogue by `brandStats`, so those columns follow the data rather than being
 * typed twice.
 */

export const BRAND_STATUSES = ['Stocked', 'Paused', 'Discontinued']

/** Where a maison sits in the business — drives the tier mix column. */
export const BRAND_HOUSES = ['Designer Original', 'Own Brand', 'Attar Brand']

/** Per-maison rollup from a catalogue. */
export function brandStats(products = []) {
  const stats = new Map()
  for (const product of products) {
    const current = stats.get(product.brand) ?? { products: 0, units: 0, revenue: 0, tiers: new Set() }
    current.products += 1
    current.units += product.salesYtd ?? 0
    current.revenue += (product.salesYtd ?? 0) * product.price
    current.tiers.add(product.tier)
    stats.set(product.brand, current)
  }
  return stats
}
