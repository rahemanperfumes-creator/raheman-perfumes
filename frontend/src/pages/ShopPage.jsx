import { useMemo } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { CatalogueView } from '@/components/product/CatalogueView'
import { ShopBanner } from '@/components/product/ShopBanner'
import { useCatalogue } from '@/hooks/useCatalogue'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import {
  useCatalogueProducts,
  useCategories,
  useCelebrities,
  useCarPerfumes,
  useBestsellers,
  useCombos,
  useCatalogueLoading,
} from '@/store/catalogueStore'
import { SHOP_NOTES } from '@/data/content'

/** Collection slug -> how to narrow the catalogue. */
const COLLECTION_RULES = {
  men: { filters: { gender: ['Men'] }, title: "Men's Perfumes" },
  women: { filters: { gender: ['Women'] }, title: "Women's Perfumes" },
  unisex: { filters: { gender: ['Unisex'] }, title: 'Unisex Signatures' },
  original: { filters: { tier: ['Original'] }, title: 'Original Perfumes' },
  originals: { filters: { tier: ['Original'] }, title: 'Original Perfumes' },
  inspired: { filters: { tier: ['Inspired', 'Mixed'] }, title: 'Inspired Perfumes' },
  mixing: { filters: { tier: ['Mixed'] }, title: 'Mixing Perfumes' },
  mixed: { filters: { tier: ['Mixed'] }, title: 'Mixing Perfumes' },
  attar: { filters: { tier: ['Attar'] }, title: 'Pure Attars & Oils' },
  attars: { filters: { tier: ['Attar'] }, title: 'Pure Attars & Oils' },
  celebrities: {
    filters: {},
    title: 'Celebrities Perfumes',
    lockTier: true,
  },
  celebrity: {
    filters: {},
    title: 'Celebrities Perfumes',
    lockTier: true,
  },
  'celebrity-perfumes': {
    filters: {},
    title: 'Celebrities Perfumes',
    lockTier: true,
  },
  'car-perfumes': {
    filters: {},
    title: 'Car Perfumes',
    lockTier: true,
  },
  'car-perfume': {
    filters: {},
    title: 'Car Perfumes',
    lockTier: true,
  },
  car: {
    filters: {},
    title: 'Car Perfumes',
    lockTier: true,
  },
  combo: { filters: { tier: ['Combo'] }, title: 'Combos & Gift Sets' },
  combos: { filters: { tier: ['Combo'] }, title: 'Combos & Gift Sets' },
  bakhoor: { filters: { tier: ['Bakhoor'] }, title: 'Bakhoor' },
  'best-sellers': { filters: { bestseller: true }, title: 'Bestsellers' },
  bestsellers: { filters: { bestseller: true }, title: 'Bestsellers' },
  bestseller: { filters: { bestseller: true }, title: 'Bestsellers' },
  'new-arrivals': { filters: { isNew: true }, title: 'New Arrivals' },
  new: { filters: { isNew: true }, title: 'New Arrivals' },
  everyday: {
    filters: {},
    title: 'Everyday Perfumes',
    occasionKeywords: ['everyday', 'daily', 'fresh', 'citrus', 'floral', 'musk', 'clean', 'bergamot', 'aqua', 'vetiver'],
  },
  office: {
    filters: {},
    title: 'Office Perfumes',
    occasionKeywords: ['office', 'work', 'woody', 'vetiver', 'citrus', 'fresh', 'cedar', 'musk', 'aromatic', 'bergamot'],
  },
  party: {
    filters: {},
    title: 'Party Perfumes',
    occasionKeywords: ['party', 'night', 'club', 'oriental', 'oud', 'spicy', 'amber', 'gourmand', 'sweet', 'vanilla', 'leather', 'tobacco'],
  },
  sports: {
    filters: {},
    title: 'Sports Perfumes',
    occasionKeywords: ['sport', 'sports', 'gym', 'fresh', 'citrus', 'aqua', 'aquatic', 'marine', 'ice', 'mint', 'lemon', 'bergamot'],
  },
  'date-night': {
    filters: {},
    title: 'Date Night Perfumes',
    occasionKeywords: ['date', 'romantic', 'evening', 'oriental', 'oud', 'rose', 'vanilla', 'amber', 'gourmand', 'musk', 'floral', 'jasmine', 'saffron'],
  },
  college: {
    filters: {},
    title: 'College Perfumes',
    occasionKeywords: ['college', 'casual', 'youth', 'fresh', 'citrus', 'fruity', 'sweet', 'gourmand', 'floral', 'ice', 'aqua'],
  },
}

/**
 * Strict note-pyramid filter: ONLY shows perfumes whose Top, Heart, or Base
 * notes actually contain the requested note/oil (never falls back to unrelated
 * perfumes).
 */
function filterByNote(products, noteTerms) {
  if (!noteTerms?.length) return []
  const patterns = noteTerms.map(
    (term) => new RegExp(`\\b${String(term).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'),
  )
  return products.filter((p) => {
    const pyramid = [
      ...(p.notes?.top ?? []),
      ...(p.notes?.heart ?? []),
      ...(p.notes?.base ?? []),
    ]
    return pyramid.some((entry) => {
      const text = String(entry ?? '').trim()
      return text && patterns.some((re) => re.test(text))
    })
  })
}

/** Match live catalogue items suited to an occasion (by admin explicit occasion tag, collection tag, family, notes, or copy). */
function filterByOccasion(products, slug, keywords) {
  if (!keywords?.length) return products
  const target = String(slug).toLowerCase()

  // 1. Explicit admin occasion matches:
  // If the admin explicitly marked fragrances for this occasion (in p.occasions or p.collections),
  // those explicitly justified perfumes take top priority!
  const explicitMatches = products.filter((p) => {
    if (Array.isArray(p.occasions) && p.occasions.some((o) => String(o).toLowerCase() === target)) {
      return true
    }
    if (Array.isArray(p.collections) && p.collections.some((c) => String(c).toLowerCase() === target)) {
      return true
    }
    return false
  })

  if (explicitMatches.length > 0) {
    return explicitMatches
  }

  // Fallback to keyword matching if admin has not yet assigned any products to this occasion
  const matched = products.filter((p) => {
    const haystack = [
      p.family,
      p.tagline,
      p.description,
      p.name,
      ...(p.notes?.top ?? []),
      ...(p.notes?.heart ?? []),
      ...(p.notes?.base ?? []),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return keywords.some((kw) => haystack.includes(kw))
  })
  return matched
}

/**
 * The catalogue.
 *
 * `/shop` shows everything, `/shop/:collection` narrows to one of the curated
 * collections, and `?brand=` / `?family=` deep links pre-apply a facet.
 */
export function ShopPage() {
  const { collection } = useParams()
  const [searchParams] = useSearchParams()

  const rule = collection ? COLLECTION_RULES[collection] : null
  // Collection copy comes from the live taxonomy, so an admin-created category
  // gets its proper title and blurb without a code change.
  const categories = useCategories()
  const category = collection ? categories.find((entry) => entry.slug === collection) : null

  const brandParam = searchParams.get('brand')
  const familyParam = searchParams.get('family')
  const noteParam = searchParams.get('note')
  const activeNote = noteParam ? SHOP_NOTES.find((n) => n.id === noteParam.toLowerCase()) : null

  const initialFilters = useMemo(() => {
    const base = { ...(rule?.filters ?? {}) }
    if (brandParam) base.brand = [brandParam]
    if (familyParam) base.family = [familyParam]
    return base
    // Recompute only when the route or the deep-link params actually change.
  }, [rule, brandParam, familyParam])

  const title = activeNote
    ? `${activeNote.label} Perfumes`
    : (rule?.title ?? (category ? category.label : 'All Fragrances'))
  useDocumentTitle(title)

  // Deep-link params stay in the URL so filter links remain shareable; the
  // `key` below remounts the catalogue with fresh filters whenever they change.
  return (
    <ShopCatalogue
      key={`${collection ?? 'all'}-${brandParam ?? ''}-${familyParam ?? ''}-${noteParam ?? ''}`}
      title={title}
      subtitle={category?.blurb ?? rule?.subtitle}
      initialFilters={initialFilters}
      collection={collection}
      activeNote={activeNote}
      occasionKeywords={activeNote ? null : rule?.occasionKeywords}
      bannerOverride={activeNote?.image}
      lockTierOverride={rule?.lockTier}
    />
  )
}

function ShopCatalogue({ title, initialFilters, collection, activeNote, occasionKeywords, bannerOverride, lockTierOverride }) {
  const allProducts = useCatalogueProducts()
  const celebrityProducts = useCelebrities()
  const carPerfumeProducts = useCarPerfumes()
  const bestsellers = useBestsellers()
  const combos = useCombos()
  const catalogueLoading = useCatalogueLoading()
  const scopedProducts = useMemo(() => {
    if (activeNote) return filterByNote(allProducts, activeNote.keywords)
    if (collection === 'celebrities' || collection === 'celebrity' || collection === 'celebrity-perfumes') {
      return celebrityProducts
    }
    if (collection === 'car-perfumes' || collection === 'car-perfume' || collection === 'car') {
      return carPerfumeProducts
    }
    if (collection === 'best-sellers' || collection === 'bestsellers' || collection === 'bestseller') {
      return bestsellers
    }
    if (collection === 'combos' || collection === 'combo') {
      return combos
    }
    if (collection === 'new-arrivals' || collection === 'new') {
      return allProducts.filter((p) => p.isNew || p.badges?.includes('New'))
    }
    if (occasionKeywords) return filterByOccasion(allProducts, collection ?? '', occasionKeywords)
    return null
  }, [allProducts, activeNote, collection, occasionKeywords, celebrityProducts, carPerfumeProducts, bestsellers, combos])

  // No `baseProducts` for normal pages so the hook reads the live catalogue
  // directly; note routes strictly match Top/Heart/Base notes with zero fallback.
  const catalogue = useCatalogue({
    baseProducts: scopedProducts,
    initialFilters,
    pageSize: 24,
  })

  return (
    <>
      <ShopBanner
        collection={collection}
        title={title}
        imageOverride={bannerOverride}
      />

      <CatalogueView
        catalogue={catalogue}
        loading={catalogueLoading}
        emptyTitle={
          activeNote
            ? `No perfumes with ${activeNote.label} notes right now`
            : collection === 'best-sellers' || collection === 'bestsellers' || collection === 'bestseller'
              ? 'No bestsellers available right now'
              : 'Nothing in this collection matches those filters'
        }
        lockTier={lockTierOverride ?? !!initialFilters.tier}
      />
    </>
  )
}

/** Dedicated Originals page (route `/shop/originals` renders ShopPage). */
export function OriginalPerfumesPage() {
  const products = useCatalogueProducts()
  const catalogueLoading = useCatalogueLoading()
  const originals = useMemo(() => products.filter((product) => product.tier === 'Original'), [products])

  const catalogue = useCatalogue({
    baseProducts: originals,
    initialFilters: { tier: ['Original'] },
    pageSize: 24,
  })

  useDocumentTitle('Original Branded Perfumes')

  return (
    <>
      <ShopBanner
        title="Original Branded Perfumes"
        collection="originals"
      />

      <CatalogueView
        catalogue={catalogue}
        loading={catalogueLoading}
        lockTier
      />
    </>
  )
}

/** Dedicated Inspired & Mixing page. */
export function InspiredMixingPage() {
  const products = useCatalogueProducts()
  const catalogueLoading = useCatalogueLoading()
  const inspired = useMemo(
    () => products.filter((product) => product.tier === 'Inspired' || product.tier === 'Mixed'),
    [products],
  )

  const catalogue = useCatalogue({ baseProducts: inspired, pageSize: 24 })

  useDocumentTitle('Inspired & Mixing Perfumes')

  return (
    <>
      <ShopBanner
        title="Inspired Blends & Mixing Perfumes"
        collection="inspired"
      />

      <CatalogueView
        catalogue={catalogue}
        loading={catalogueLoading}
        lockTier
      />
    </>
  )
}

export default ShopPage
