import api from '@/lib/api'

/**
 * Catalogue reads.
 *
 * The backend is the only source. There is no bundled catalogue to degrade to:
 * a read that fails throws, and the screen that made it says so. Everything the
 * shop shows is whatever the admin has actually listed.
 */

export const productService = {
  /** The full catalogue. */
  list: (params = {}) => api.get(`/products?${new URLSearchParams(params)}`),

  /** One product by slug. */
  detail: (slug) => api.get(`/products/${encodeURIComponent(slug)}`),

  /** Everything needed to render a PDP in a single round trip. */
  detailBundle: (slug) => api.get(`/products/${encodeURIComponent(slug)}/bundle`),

  /** Free-text search across name, brand, notes and family. */
  search: (query) => api.get(`/products/search?q=${encodeURIComponent(query)}`),

  /** Draft products surfaced in the homepage "Coming Soon" preview shelf. */
  comingSoon: (limit = 50) => api.get(`/products/coming-soon?limit=${limit}`),

  categories: () => api.get('/categories'),
  brands: () => api.get('/brands'),
  coupons: () => api.get('/coupons'),
  pricing: () => api.get('/pricing'),
  showcase: () => api.get('/showcase'),
}

/**
 * Local search across an **already-loaded** catalogue.
 *
 * Matches on name, brand, tier, family and every note in the pyramid. The
 * callers pass the live list from `catalogueStore`, because instant search has
 * to run against what the shop actually stocks. It scores one in-memory list so
 * the header's dropdown and the full results page can never disagree about
 * what matches; with an unloaded catalogue it simply finds nothing.
 */
export function searchCatalogue(query, { limit, products = [] } = {}) {
  const needle = String(query ?? '').trim().toLowerCase()
  if (!needle) return []

  const scored = products.map((product) => {
    const haystacks = {
      name: product.name.toLowerCase(),
      brand: product.brand.toLowerCase(),
      tier: product.tier.toLowerCase(),
      family: product.family.toLowerCase(),
      notes: [...(product.notes?.top ?? []), ...(product.notes?.heart ?? []), ...(product.notes?.base ?? [])]
        .join(' ')
        .toLowerCase(),
    }
    let score = 0
    if (haystacks.name.includes(needle)) score += 10
    if (haystacks.name.startsWith(needle)) score += 6
    if (haystacks.brand.includes(needle)) score += 5
    if (haystacks.family.includes(needle)) score += 4
    if (haystacks.notes.includes(needle)) score += 4
    if (haystacks.tier.includes(needle)) score += 2
    return { product, score }
  })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || b.product.rating - a.product.rating)

  const results = scored.map((entry) => entry.product)
  return limit ? results.slice(0, limit) : results
}

/** Products sharing a collection, most relevant first. */
export function productsByCollection(collectionId, { limit, products = [] } = {}) {
  const results = products.filter((p) => p.collections?.includes(collectionId))
  return limit ? results.slice(0, limit) : results
}

/**
 * Products related to `slug` — same family or tier, never the product itself.
 *
 * `products` is the live catalogue to draw the relatives from; a relative that
 * no longer exists in stock must not be linked.
 */
export function relatedProducts(slug, { limit = 4, products = [] } = {}) {
  const base = products.find((entry) => entry.slug === slug)
  if (!base) return products.slice(0, limit)
  return products
    .filter((p) => p.slug !== slug)
    .map((p) => {
      let score = 0
      if (p.family === base.family) score += 3
      if (p.tier === base.tier) score += 2
      if (p.gender === base.gender) score += 1
      if (p.brand === base.brand) score += 2
      return { p, score }
    })
    .sort((a, b) => b.score - a.score || b.p.rating - a.p.rating)
    .slice(0, limit)
    .map((entry) => entry.p)
}

/** Check a coupon code against a basket. The server owns the arithmetic. */
export const couponService = {
  validate: (code, subtotal) => api.post('/coupons/validate', { code, subtotal }),
}

export default productService
