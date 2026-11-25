/**
 * Category vocabulary.
 *
 * The shelves themselves come from the server. What stays here is the status
 * list a category can hold and the rollup that derives a shelf's product count,
 * units and revenue from the live catalogue at render time — so those numbers
 * move on their own when a fragrance is added and can never drift out of sync.
 */

export const CATEGORY_STATUSES = ['Active', 'Hidden', 'Archived']

/**
 * Per-category rollup from a catalogue: how many fragrances sit in it, how many
 * units they moved and what they earned. Shared revenue across a multi-category
 * product would double-count, which is why a product carries exactly one.
 */
export function categoryStats(products = []) {
  const stats = new Map()
  for (const product of products) {
    const current = stats.get(product.category) ?? { products: 0, units: 0, revenue: 0, lowStock: 0 }
    current.products += 1
    current.units += product.salesYtd ?? 0
    current.revenue += (product.salesYtd ?? 0) * product.price
    if (product.stock <= product.safeLimit) current.lowStock += 1
    stats.set(product.category, current)
  }
  return stats
}
