import { useMemo } from 'react'
import { create } from 'zustand'
import { productService } from '@/services/productService'

/**
 * The shop's catalogue, as the website shows it.
 *
 * One home for the list every surface reads — the shop grid, the home rails,
 * instant search, the cart's cross-sell — and its only source is the backend.
 * There is no bundled catalogue any more: what the admin lists is what the
 * shop shows, and if the server does not answer, `status` says `unavailable`
 * and the screens say so too.
 *
 * **Indexes travel with the list.** `byId`/`bySlug` are derived in the same
 * `set` that swaps the products, so a lookup can never answer from one catalogue
 * while the grid renders another. A cart line, an order's "Buy Again" button and
 * the recently-viewed rail all resolve admin-created fragrances through these
 * maps.
 *
 * Categories and brands hydrate alongside — the filter rails and the nav read
 * them from here so the taxonomy on screen is the admin's, not a frozen list.
 */

export const DEFAULT_SHOWCASE = {
  codEnabled: true,
  showBestsellers: true,
  showHomeDeals: true,
  showOffersProducts: true,
  showCouponsSection: true,
  showMultiBottleOffers: false,
  showCombos: true,
  showCelebrities: true,
  showCarPerfumes: true,
  offerProductIds: [],
  bestsellerProductIds: [],
  homeDealProductIds: [],
  comboProductIds: [],
  celebrityProductIds: [],
  carPerfumeProductIds: [],
}

function normalizeShowcase(raw) {
  if (!raw || typeof raw !== 'object') return DEFAULT_SHOWCASE
  const list = (val) => (Array.isArray(val) ? val.map(String).filter(Boolean) : [])
  return {
    codEnabled: typeof raw.codEnabled === 'boolean' ? raw.codEnabled : true,
    showBestsellers: typeof raw.showBestsellers === 'boolean' ? raw.showBestsellers : true,
    showHomeDeals: typeof raw.showHomeDeals === 'boolean' ? raw.showHomeDeals : true,
    showOffersProducts: typeof raw.showOffersProducts === 'boolean' ? raw.showOffersProducts : true,
    showCouponsSection: typeof raw.showCouponsSection === 'boolean' ? raw.showCouponsSection : true,
    showMultiBottleOffers: typeof raw.showMultiBottleOffers === 'boolean' ? raw.showMultiBottleOffers : false,
    showCombos: typeof raw.showCombos === 'boolean' ? raw.showCombos : true,
    showCelebrities: typeof raw.showCelebrities === 'boolean' ? raw.showCelebrities : true,
    showCarPerfumes: typeof raw.showCarPerfumes === 'boolean' ? raw.showCarPerfumes : true,
    offerProductIds: list(raw.offerProductIds),
    bestsellerProductIds: list(raw.bestsellerProductIds),
    homeDealProductIds: list(raw.homeDealProductIds),
    comboProductIds: list(raw.comboProductIds),
    celebrityProductIds: list(raw.celebrityProductIds),
    carPerfumeProductIds: list(raw.carPerfumeProductIds),
  }
}

/** The starting shape — nothing until the server answers. */
const EMPTY = {
  products: [],
  byId: {},
  bySlug: {},
  comingSoon: [],
  categories: [],
  brands: [],
  showcase: DEFAULT_SHOWCASE,
  showcaseLoadedAt: 0,
}

/** A product list plus the two lookup maps, built together. */
function index(products) {
  return {
    products,
    byId: Object.fromEntries(products.map((product) => [product.id, product])),
    bySlug: Object.fromEntries(products.map((product) => [product.slug, product])),
  }
}

export const useCatalogueStore = create((set, get) => ({
  ...EMPTY,

  /** `idle` → `loading` → `live` or `unavailable`. */
  status: 'idle',

  /** Why the catalogue could not be read, when it could not. */
  error: '',

  /**
   * Pull the catalogue from the API, once.
   *
   * Idempotent by design — React 18 mounts effects twice in development, and a
   * second call while one is in flight would double the request for no gain.
   * A completed hydration is not repeated either, so navigating between shop
   * pages does no further work.
   */
  hydrate: async () => {
    const { status } = get()
    if (status === 'loading' || status === 'live') return

    set({ status: 'loading', error: '' })
    try {
      const [rows, comingSoonRows, categories, brands, showcase] = await Promise.all([
        productService.list(),
        productService.comingSoon().catch(() => []),
        productService.categories().catch(() => []),
        productService.brands().catch(() => []),
        productService.showcase().catch(() => null),
      ])
      // An empty array is a real answer — a shop whose every fragrance is still
      // a draft has nothing to sell, and showing anything else would advertise
      // stock that does not exist. Only a malformed response is a failure.
      if (!Array.isArray(rows)) throw new Error('The catalogue came back malformed.')
      set({
        ...index(rows),
        comingSoon: Array.isArray(comingSoonRows) ? comingSoonRows : [],
        categories: Array.isArray(categories) ? categories : [],
        brands: Array.isArray(brands) ? brands : [],
        showcase: normalizeShowcase(showcase),
        showcaseLoadedAt: Date.now(),
        status: 'live',
        error: '',
      })
    } catch (error) {
      console.warn('[catalogue] the API did not answer — the shop has no catalogue to show.')
      set({ status: 'unavailable', error: error.message || 'The shop could not reach the server.' })
    }
  },

  /** Re-read admin showcase toggles & curated product lists (throttled every 1.5s). */
  refreshShowcase: async ({ force = false } = {}) => {
    const { showcaseLoadedAt, status } = get()
    if (status === 'loading') return
    if (!force && Date.now() - showcaseLoadedAt < 1500) return
    try {
      const [raw, comingSoonRows] = await Promise.all([
        productService.showcase(),
        productService.comingSoon().catch(() => null),
      ])
      const next = normalizeShowcase(raw)
      const current = get()
      const anyMissing = [
        ...next.offerProductIds,
        ...next.bestsellerProductIds,
        ...next.homeDealProductIds,
      ].some((id) => !current.byId[id])

      let productPatch = {}
      if (anyMissing && current.status === 'live') {
        const rows = await productService.list().catch(() => null)
        if (Array.isArray(rows)) productPatch = index(rows)
      }

      set({
        ...productPatch,
        ...(Array.isArray(comingSoonRows) ? { comingSoon: comingSoonRows } : {}),
        showcase: next,
        showcaseLoadedAt: Date.now(),
      })
    } catch {
      // Keep the last known showcase rules if the transient refresh fails.
    }
  },
}))

/** The catalogue list, for components that only need to render it. */
export const useCatalogueProducts = () => useCatalogueStore((state) => state.products)

/** The live taxonomy, for filters, nav and search chips. */
export const useCategories = () => useCatalogueStore((state) => state.categories)
export const useBrands = () => useCatalogueStore((state) => state.brands)

/** True while catalogue is loading from the server. */
export const useCatalogueLoading = () =>
  useCatalogueStore((state) => state.status === 'idle' || state.status === 'loading')

/** True once a hydrate attempt has finished and the server never answered. */
export const useCatalogueUnavailable = () => useCatalogueStore((state) => state.status === 'unavailable')

/** Website display flags & COD setting curated from Admin -> Website Display. */
export const useShowcase = () => useCatalogueStore((state) => state.showcase)

const isAvailableProduct = (product) =>
  Boolean(product && product.inStock !== false && (product.stockLeft == null || product.stockLeft > 0))

/** Manually ordered product list for a given showcase slot (`offerProductIds`, `bestsellerProductIds`, `homeDealProductIds`). */
export function useShowcaseProducts(slotKey) {
  const ids = useCatalogueStore((state) => state.showcase?.[slotKey])
  const byId = useCatalogueStore((state) => state.byId)
  const inStockOnly = slotKey === 'offerProductIds' || slotKey === 'homeDealProductIds'
  return useMemo(
    () =>
      (ids ?? [])
        .map((id) => byId[id])
        .filter((product) => (inStockOnly ? isAvailableProduct(product) : Boolean(product))),
    [ids, byId, inStockOnly],
  )
}

/** Products manually selected or marked as Bestsellers for the Home page. */
export function useBestsellers() {
  const curated = useShowcaseProducts('bestsellerProductIds')
  const products = useCatalogueProducts()
  return useMemo(() => {
    const curatedIds = new Set((curated ?? []).map((p) => p.id || p._id))
    const tagged = (products ?? []).filter(
      (p) => (p.bestseller || p.badges?.includes('Bestseller')) && !curatedIds.has(p.id || p._id),
    )
    return [...(curated ?? []), ...tagged]
  }, [curated, products])
}

/** Products manually selected or marked as Combos for the Combos page. */
export function useCombos() {
  const curated = useShowcaseProducts('comboProductIds')
  const products = useCatalogueProducts()
  return useMemo(() => {
    const curatedIds = new Set((curated ?? []).map((p) => p.id || p._id))
    const tagged = (products ?? []).filter(
      (p) => (p.tier === 'Combo' || p.collections?.includes('combos')) && !curatedIds.has(p.id || p._id),
    )
    return [...(curated ?? []), ...tagged]
  }, [curated, products])
}

/** Products manually selected or marked as Celebrities Perfumes. */
export function useCelebrities() {
  const curated = useShowcaseProducts('celebrityProductIds')
  const products = useCatalogueProducts()
  return useMemo(() => {
    const curatedIds = new Set((curated ?? []).map((p) => p.id || p._id))
    const tagged = (products ?? []).filter(
      (p) =>
        (p.collections?.includes('celebrities') ||
          p.collections?.includes('celebrity') ||
          String(p.category ?? '').toLowerCase().includes('celebr') ||
          String(p.categoryName ?? '').toLowerCase().includes('celebr')) &&
        !curatedIds.has(p.id || p._id),
    )
    return [...(curated ?? []), ...tagged]
  }, [curated, products])
}

/** Products manually selected or marked as Car Perfumes. */
export function useCarPerfumes() {
  const curated = useShowcaseProducts('carPerfumeProductIds')
  const products = useCatalogueProducts()
  return useMemo(() => {
    const curatedIds = new Set((curated ?? []).map((p) => p.id || p._id))
    const tagged = (products ?? []).filter(
      (p) =>
        (p.tier === 'Car Perfume' ||
          p.collections?.includes('car-perfumes') ||
          p.collections?.includes('car-perfume') ||
          p.collections?.includes('car') ||
          String(p.category ?? '').toLowerCase().includes('car') ||
          String(p.categoryName ?? '').toLowerCase().includes('car')) &&
        !curatedIds.has(p.id || p._id),
    )
    return [...(curated ?? []), ...tagged]
  }, [curated, products])
}

/** Draft products saved by admin, surfaced in the homepage Coming Soon shelf. */
export const useComingSoon = () => useCatalogueStore((state) => state.comingSoon)

export default useCatalogueStore
