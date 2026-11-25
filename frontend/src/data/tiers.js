/**
 * Provenance tiers. REHMAN sells provenance-tagged fragrances and the tier drives
 * the badge colour, the price-per-ml logic and the copy across the storefront.
 */
export const TIERS = {
  Original: {
    id: 'Original',
    label: 'Original',
    tagline: '100% Authentic',
    description:
      'Genuine branded perfumes bought directly from official French and Italian suppliers.',
    text: 'text-tier-original',
    surface: 'bg-tier-originalSurface',
    border: 'border-tier-original/25',
    solid: 'bg-tier-original text-white',
  },
  Inspired: {
    id: 'Inspired',
    label: 'Inspired',
    tagline: 'Inspired Blend',
    description:
      'Popular designer scents remade by us with pure French oils, at a lower price.',
    text: 'text-tier-inspired',
    surface: 'bg-tier-inspiredSurface',
    border: 'border-tier-inspired/25',
    solid: 'bg-tier-inspired text-white',
  },
  Mixed: {
    id: 'Mixed',
    label: 'Mixing',
    tagline: 'Layer & Mix',
    description:
      'Two or more scents blended together — layer them yourself or let our team make the mix.',
    text: 'text-tier-mixed',
    surface: 'bg-tier-mixedSurface',
    border: 'border-tier-mixed/25',
    solid: 'bg-tier-mixed text-white',
  },
  Attar: {
    id: 'Attar',
    label: 'Pure Attar',
    tagline: 'Alcohol-Free Oil',
    description:
      'Pure concentrated perfume oils, distilled rose, oud and musks crafted without alcohol.',
    text: 'text-amber-800',
    surface: 'bg-amber-50',
    border: 'border-amber-700/25',
    solid: 'bg-amber-800 text-white',
  },
  Celebrity: {
    id: 'Celebrity',
    label: 'Celebrities Perfumes',
    tagline: 'Celebrity Edition',
    description:
      'Iconic fragrances worn and inspired by world-famous celebrities and style icons.',
    text: 'text-purple-800',
    surface: 'bg-purple-50',
    border: 'border-purple-700/25',
    solid: 'bg-purple-800 text-white',
  },
  'Car Perfume': {
    id: 'Car Perfume',
    label: 'Car Perfumes',
    tagline: 'Car & Diffuser',
    description:
      'Long-lasting artisan hanging diffusers and car fragrances crafted for your automobile.',
    text: 'text-sky-800',
    surface: 'bg-sky-50',
    border: 'border-sky-700/25',
    solid: 'bg-sky-800 text-white',
  },
  Combo: {
    id: 'Combo',
    label: 'Combo Sets',
    tagline: 'Curated 2-Pack Sets',
    description:
      'Specially paired perfume combos and gift box sets curated by our fragrance atelier.',
    text: 'text-emerald-800',
    surface: 'bg-emerald-50',
    border: 'border-emerald-700/25',
    solid: 'bg-emerald-800 text-white',
  },
  Bakhoor: {
    id: 'Bakhoor',
    label: 'Bakhoor',
    tagline: 'Aromatic Oud Incense',
    description:
      'Fragrant oud wood chips steeped in natural oils and resins for rich home scenting.',
    text: 'text-amber-900',
    surface: 'bg-amber-50',
    border: 'border-amber-800/25',
    solid: 'bg-amber-900 text-white',
  },
}

// Non-enumerable alias so TIERS.CarPerfume continues to work without duplicating Object.values(TIERS)
Object.defineProperty(TIERS, 'CarPerfume', {
  value: TIERS['Car Perfume'],
  enumerable: false,
  configurable: true,
})

/** Extra merchandising flags that sit beside the tier badge. */
export const FLAGS = {
  Bestseller: { label: 'Bestseller', className: 'bg-amber-600 text-white' },
  New: { label: 'New In', className: 'bg-brand-charcoal text-brand-gold' },
  Limited: { label: 'Limited', className: 'bg-brand-gold text-brand-charcoal' },
  'Back in Stock': { label: 'Back in Stock', className: 'bg-emerald-700 text-white' },
}

export const TIER_LIST = Array.from(new Map(Object.values(TIERS).map((t) => [t.id, t])).values())

export function getTier(id) {
  if (!id) return TIERS.Original
  if (id === 'CarPerfume' || id === 'car-perfume' || id === 'car-perfumes') return TIERS['Car Perfume']
  return TIERS[id] ?? TIERS.Original
}
