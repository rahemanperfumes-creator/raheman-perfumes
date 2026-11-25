/**
 * Review helpers.
 *
 * The bundled review table is gone — reviews come from the server with the
 * product bundle. What remains is the arithmetic the PDP does on whatever
 * list it was handed.
 */

/** Rating histogram shown on the PDP review summary. */
export function ratingBreakdown(reviews = []) {
  const counts = [5, 4, 3, 2, 1].map((star) => ({
    star,
    count: reviews.filter((r) => Math.round(r.rating) === star).length,
  }))
  const total = reviews.length || 1
  return counts.map((row) => ({ ...row, percent: Math.round((row.count / total) * 100) }))
}
