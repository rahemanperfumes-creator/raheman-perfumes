import { useCallback, useMemo, useState } from 'react'
import { useCatalogueStore } from '@/store/catalogueStore'

/**
 * Catalogue filtering, sorting and pagination.
 *
 * The filter facets are derived from the catalogue itself rather than from a
 * hand-written list, so a new family or maison in `data/products.js` shows up
 * in the sidebar automatically and can never drift out of sync with the stock.
 *
 * The catalogue filtered here is the one in `catalogueStore` — the live one when
 * the API has answered, the bundled one until then. That default is the whole
 * point: a surface that renders "the catalogue" should not have to know where
 * the catalogue came from, and any page that hard-coded the bundle would keep
 * hiding every fragrance added in the admin panel.
 *
 * `baseProducts` is still accepted as an explicit override for the surfaces that
 * genuinely narrow first and paginate second — search results hand in the
 * matched subset so the facet counts describe the matches rather than the whole
 * shop.
 */

const isEmpty = (value) => value == null || (Array.isArray(value) && value.length === 0)

/** Facet values for one field, with live counts, ordered by frequency. */
function buildFacet(products, accessor) {
  const counts = new Map()
  products.forEach((product) => {
    const raw = accessor(product)
    const values = Array.isArray(raw) ? raw : [raw]
    values.filter(Boolean).forEach((value) => counts.set(value, (counts.get(value) ?? 0) + 1))
  })
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
    .map(([id, count]) => ({ id, label: id, count }))
}

/** Counts for one facet, constrained by every *other* active filter. */
function countsFor(products, key, accessor, filters) {
  const scoped = products.filter((product) =>
    Object.entries(filters).every(([filterKey, value]) => {
      if (filterKey === key || filterKey === 'price' || isEmpty(value)) return true
      return matchesFilter(product, filterKey, value)
    }),
  )
  const facet = buildFacet(scoped, accessor)
  return Object.fromEntries(facet.map((entry) => [entry.id, entry.count]))
}

export function resolveProductTier(p) {
  const tiers = []
  if (p?.tier) tiers.push(p.tier)
  if (
    p?.collections?.includes('celebrities') ||
    p?.collections?.includes('celebrity') ||
    /celebr/i.test(p?.category ?? '') ||
    /celebr/i.test(p?.categoryName ?? '')
  ) {
    tiers.push('Celebrity')
  }
  if (
    p?.collections?.includes('car-perfumes') ||
    p?.collections?.includes('car-perfume') ||
    p?.collections?.includes('car') ||
    /car/i.test(p?.category ?? '') ||
    /car/i.test(p?.categoryName ?? '') ||
    p?.tier === 'Car Perfume'
  ) {
    tiers.push('Car Perfume')
  }
  if (p?.collections?.includes('combos')) tiers.push('Combo')
  if (p?.collections?.includes('attars') || /attar/i.test(p?.category ?? '')) tiers.push('Attar')
  if (p?.collections?.includes('inspired')) tiers.push('Inspired')
  if (p?.collections?.includes('originals')) tiers.push('Original')
  if (!tiers.length) tiers.push('Original')
  return [...new Set(tiers)]
}

function matchesFilter(product, key, value) {
  switch (key) {
    case 'tier':
      return value.some((v) => {
        const tiers = resolveProductTier(product)
        if (v === 'Attar') return tiers.includes('Attar') || /attar/i.test(product.category ?? '') || product.collections?.includes('attars')
        if (v === 'Combo') return tiers.includes('Combo') || product.collections?.includes('combos')
        if (v === 'Celebrity' || v === 'celebrities') {
          return (
            tiers.includes('Celebrity') ||
            product.tier === 'Celebrity' ||
            product.collections?.includes('celebrities') ||
            product.collections?.includes('celebrity') ||
            /celebr/i.test(product.category ?? '') ||
            /celebr/i.test(product.categoryName ?? '')
          )
        }
        if (v === 'Car Perfume' || v === 'car-perfumes' || v === 'car-perfume' || v === 'CarPerfume') {
          return (
            tiers.includes('Car Perfume') ||
            product.tier === 'Car Perfume' ||
            product.collections?.includes('car-perfumes') ||
            product.collections?.includes('car-perfume') ||
            product.collections?.includes('car') ||
            /car/i.test(product.category ?? '') ||
            /car/i.test(product.categoryName ?? '')
          )
        }
        if (v === 'Inspired') return tiers.includes('Inspired') || product.tier === 'Inspired' || product.collections?.includes('inspired')
        if (v === 'Original') return tiers.includes('Original') || product.tier === 'Original' || product.collections?.includes('originals')
        return tiers.includes(v)
      })
    case 'family':
      return value.includes(product.family)
    case 'brand':
      return value.includes(product.brand)
    case 'gender':
      return value.includes(product.gender)
    case 'concentration': {
      const prodConc = (product.concentration || '').toLowerCase()
      return value.some((v) => {
        const needle = String(v).toLowerCase()
        return prodConc.includes(needle) || needle.includes(prodConc) || (needle === 'edp' && prodConc.includes('parfum'))
      })
    }
    case 'inStock':
      return !value || product.inStock
    case 'price': {
      const [min, max] = value
      return product.price >= min && product.price <= max
    }
    case 'bestseller':
      return !value || Boolean(product.bestseller || product.badges?.includes('Bestseller'))
    case 'isNew':
      return !value || Boolean(product.isNew || product.badges?.includes('New'))
    default:
      return true
  }
}

const SORTERS = {
  popular: (a, b) => (b.bestseller ? 1 : 0) - (a.bestseller ? 1 : 0) || b.reviewCount - a.reviewCount,
  newest: (a, b) => (b.badges?.includes('New') ? 1 : 0) - (a.badges?.includes('New') ? 1 : 0) || b.rating - a.rating,
  'price-asc': (a, b) => a.price - b.price,
  'price-desc': (a, b) => b.price - a.price,
  rating: (a, b) => b.rating - a.rating || b.reviewCount - a.reviewCount,
  savings: (a, b) => (b.mrp - b.price) / b.mrp - (a.mrp - a.price) / a.mrp,
}

export function useCatalogue({
  baseProducts: explicitBase = null,
  initialFilters = {},
  initialSort = 'popular',
  pageSize: initialPageSize = 24,
} = {}) {
  // Read through to the store's list rather than taking it as a parameter: this
  // is what lets an admin-created fragrance appear in a grid that was mounted
  // before the API answered.
  const liveBase = useCatalogueStore((state) => state.products)
  const baseProducts = explicitBase ?? liveBase

  const [filters, setFilters] = useState(initialFilters)
  const [sort, setSort] = useState(initialSort)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(initialPageSize)

  const priceBounds = useMemo(() => {
    const prices = baseProducts.map((product) => product.price)
    const low = Math.floor(Math.min(...prices, 0) / 100) * 100
    const high = Math.ceil(Math.max(...prices, 1000) / 100) * 100
    return [low, high]
  }, [baseProducts])

  const filtered = useMemo(
    () =>
      baseProducts.filter((product) =>
        Object.entries(filters).every(([key, value]) => isEmpty(value) || matchesFilter(product, key, value)),
      ),
    [baseProducts, filters],
  )

  const sorted = useMemo(() => {
    const sorter = SORTERS[sort] ?? SORTERS.popular
    return [...filtered].sort(sorter)
  }, [filtered, sort])

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const pageItems = useMemo(
    () => sorted.slice((safePage - 1) * pageSize, safePage * pageSize),
    [sorted, safePage, pageSize],
  )

  const facets = useMemo(
    () => ({
      tier: buildFacet(baseProducts, resolveProductTier),
      family: buildFacet(baseProducts, (p) => p.family),
      brand: buildFacet(baseProducts, (p) => p.brand),
      gender: buildFacet(baseProducts, (p) => p.gender),
      concentration: buildFacet(baseProducts, (p) => p.concentration),
    }),
    [baseProducts],
  )

  const counts = useMemo(
    () => ({
      tier: countsFor(baseProducts, 'tier', resolveProductTier, filters),
      family: countsFor(baseProducts, 'family', (p) => p.family, filters),
      brand: countsFor(baseProducts, 'brand', (p) => p.brand, filters),
      gender: countsFor(baseProducts, 'gender', (p) => p.gender, filters),
      concentration: countsFor(baseProducts, 'concentration', (p) => p.concentration, filters),
    }),
    [baseProducts, filters],
  )

  const updateFilters = useCallback((next) => {
    setFilters(next)
    setPage(1)
  }, [])

  const clearFilters = useCallback(() => {
    setFilters({})
    setPage(1)
  }, [])

  const activeChips = useMemo(
    () =>
      Object.entries(filters).flatMap(([key, value]) => {
        if (isEmpty(value)) return []
        if (key === 'price') return [{ key, value, label: `Under ₹${value[1].toLocaleString('en-IN')}` }]
        if (key === 'inStock') return [{ key, value, label: 'In stock' }]
        if (key === 'bestseller') return value ? [{ key, value, label: 'Bestseller' }] : []
        if (key === 'isNew') return value ? [{ key, value, label: 'New Arrivals' }] : []
        if (typeof value === 'boolean') return value ? [{ key, value, label: key }] : []
        if (!Array.isArray(value)) return [{ key, value, label: String(value) }]
        return value.map((entry) => ({ key, value: entry, label: entry }))
      }),
    [filters],
  )

  const removeChip = useCallback(
    (chip) => {
      if (chip.key === 'price' || chip.key === 'inStock' || typeof filters[chip.key] === 'boolean') {
        updateFilters({ ...filters, [chip.key]: undefined })
        return
      }
      if (!Array.isArray(filters[chip.key])) {
        updateFilters({ ...filters, [chip.key]: undefined })
        return
      }
      const next = (filters[chip.key] ?? []).filter((entry) => entry !== chip.value)
      updateFilters({ ...filters, [chip.key]: next.length ? next : undefined })
    },
    [filters, updateFilters],
  )

  return {
    filters,
    setFilters: updateFilters,
    clearFilters,
    activeChips,
    removeChip,
    sort,
    setSort: (next) => {
      setSort(next)
      setPage(1)
    },
    page: safePage,
    setPage,
    pageSize,
    setPageSize: (next) => {
      setPageSize(next)
      setPage(1)
    },
    totalPages,
    total: sorted.length,
    products: pageItems,
    allFiltered: sorted,
    facets,
    counts,
    priceBounds,
  }
}

export default useCatalogue
