/**
 * Catalogue filter vocabulary.
 *
 * These are the *shape* of the filters the shop exposes — sort orders, price
 * bands, concentrations, genders, scent families. The category list itself is
 * no longer here: it comes from the backend (`GET /api/categories`) and lands
 * in `catalogueStore`. Counts are never hard-coded any more — where a filter
 * shows one, it is computed from the live catalogue.
 */

/** The "Inspired & Mixing" scent-family filters. */
export const SCENT_FAMILIES = [
  { id: 'fresh', label: 'Fresh' },
  { id: 'woody', label: 'Woody' },
  { id: 'floral', label: 'Floral' },
  { id: 'gourmand', label: 'Sweet / Gourmand' },
  { id: 'citrus', label: 'Citrus' },
  { id: 'oud', label: 'Oud' },
  { id: 'musk', label: 'Musk' },
  { id: 'oriental', label: 'Oriental' },
]

/** Price bands used by the catalogue sidebar. */
export const PRICE_BANDS = [
  { id: 'under-500', label: 'Under ₹500', min: 0, max: 499 },
  { id: '500-1000', label: '₹500 – ₹1,000', min: 500, max: 1000 },
  { id: '1000-3000', label: '₹1,000 – ₹3,000', min: 1000, max: 3000 },
  { id: '3000-plus', label: '₹3,000+', min: 3000, max: Infinity },
]

/** Flacon volumes offered across the catalogue. */
export const SIZE_OPTIONS = ['6ml', '12ml', '30ml', '50ml', '100ml']

/** Concentration tiers offered across the catalogue. */
export const CONCENTRATIONS = [
  { id: 'Eau de Parfum', label: 'Eau de Parfum', oil: '18–25%' },
  { id: 'Extrait de Parfum', label: 'Extrait de Parfum', oil: 'Up to 40%' },
  { id: 'Grand Extrait Intense', label: 'Grand Extrait Intense', oil: 'Up to 40%' },
]

export const SORT_OPTIONS = [
  { id: 'popular', label: 'Sort: Most Popular' },
  { id: 'newest', label: 'Sort: Newest Perfumes' },
  { id: 'price-asc', label: 'Price: Low to High' },
  { id: 'price-desc', label: 'Price: High to Low' },
  { id: 'rating', label: 'Top Rated' },
  { id: 'savings', label: 'Highest Savings' },
]

export const GENDERS = [
  { id: 'Men', label: 'Men' },
  { id: 'Women', label: 'Women' },
  { id: 'Unisex', label: 'Unisex' },
]
