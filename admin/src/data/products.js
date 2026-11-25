/**
 * Product vocabulary — enums and pure helpers, not rows.
 *
 * The catalogue itself comes from the server; nothing here is a fragrance. What
 * stays is the fixed vocabulary the product form and the tables need to render
 * and validate a record: the provenance tiers and their cost model, the status
 * list, the badge/collection/note bands the storefront actually routes on, and
 * the two stock helpers that derive from a row's own fields.
 */

/** Label prefix per provenance tier, used to build the SKU. */
export const TIER_CODE = {
  Original: 'ORG',
  Inspired: 'INS',
  Mixed: 'MIX',
  Attar: 'ATT',
  Combo: 'CMB',
  Bakhoor: 'BKH',
  'Car Perfume': 'CAR',
}

/** Share of the selling price that goes on the cost of goods, per tier. */
export const TIER_COST_RATIO = {
  Original: 0.62,
  Inspired: 0.28,
  Mixed: 0.34,
  Attar: 0.4,
  Combo: 0.55,
  Bakhoor: 0.45,
  'Car Perfume': 0.35,
}

/**
 * What a fragrance at this tier *should* cost at this price. Exported so the
 * product form can pre-fill the cost field from the same ratio the server's
 * pricing model uses rather than from a second copy that could drift — the
 * field stays editable, because a real supplier invoice beats a house rule.
 */
export function suggestedCost(tier, price) {
  return Math.round((Number(price) || 0) * (TIER_COST_RATIO[tier] ?? 0.45))
}

export const PRODUCT_STATUSES = ['Active', 'Draft', 'Archived']

/*
 * There is deliberately no category list here. Shelves are records in the
 * database, created on the Categories & Brands screen and read from the panel
 * store — a fixed vocabulary here would offer names the server does not know
 * and hide names it does.
 */

/**
 * The collection slugs a fragrance can be filed under, grouped by what they do.
 *
 * **This list is not invented here — it is read off the storefront.** A
 * collection slug is a *route*: `/shop/attars`, `/shop/best-sellers`, and the
 * home page's rails each ask the API for a collection by name. A slug the shop
 * has no page for is invisible; a page with no products is empty. So the panel
 * offers exactly the slugs the storefront actually routes on, taken from
 * `COLLECTION_RULES` in `frontend/src/pages/ShopPage.jsx` and the vault rail in
 * `OffersPage.jsx`, rather than a free-text field that invites a typo neither
 * side would report.
 *
 * The last two groups are editorial rather than navigational: `unisex`, `men`
 * and `women` mirror the `gender` field and keep a fragrance in the right
 * audience rail, and the notes at the end are the scent families the shop's
 * facet sidebar and landing tiles already link to.
 *
 * Free-text would also have made `collections` a place for spelling variants of
 * the same idea. There is one spelling of "best-sellers" here, and it is the
 * one that has a page.
 */
export const OCCASIONS = [
  { id: 'everyday', label: 'Everyday', blurb: 'Daily wear, versatile, fresh & clean signature' },
  { id: 'office', label: 'Office', blurb: 'Work, meetings, refined, subtle & professional' },
  { id: 'party', label: 'Party', blurb: 'Club, celebrations, bold projection & evening' },
  { id: 'sports', label: 'Sports', blurb: 'Gym, activewear, refreshing aquatic & energetic' },
  { id: 'date-night', label: 'Date Night', blurb: 'Romantic, sensual, warm amber & close encounters' },
  { id: 'college', label: 'College', blurb: 'Casual, vibrant, trendy & youthful' },
]

export const OCCASION_IDS = OCCASIONS.map((o) => o.id)

export const PRODUCT_COLLECTIONS = [
  { group: 'Shop pages', slugs: ['originals', 'inspired', 'mixing', 'attars', 'combos', 'celebrities', 'bakhoor', 'car-perfumes'] },
  { group: 'Audience', slugs: ['men', 'women', 'unisex'] },
  { group: 'Scent families', slugs: ['fresh', 'floral', 'woody', 'oriental', 'oud', 'leather'] },
]

/** Every slug above, flat — for validating a record that arrived from elsewhere. */
export const COLLECTION_SLUGS = [
  ...PRODUCT_COLLECTIONS.flatMap((entry) => entry.slugs),
  ...OCCASION_IDS,
  'best-sellers',
  'vault',
]

/** User-friendly display names for collection chips in Admin Product Form. */
export const COLLECTION_LABELS = {
  originals: 'Original Perfumes',
  inspired: 'Inspired Perfumes',
  mixing: 'Mixing Perfumes',
  attars: 'Pure Attars',
  combos: 'Combos & Gift Sets',
  celebrities: 'Celebrities Perfumes',
  bakhoor: 'Bakhoor',
  'car-perfumes': 'Car Perfumes',
  vault: 'Special Offers (Vault)',
  'best-sellers': 'Best Sellers',
  everyday: 'Everyday',
  office: 'Office',
  party: 'Party',
  sports: 'Sports',
  'date-night': 'Date Night',
  college: 'College',
  men: 'Perfume for Men',
  women: 'Perfume for Women',
  unisex: 'Unisex',
  fresh: 'Fresh',
  floral: 'Floral',
  woody: 'Woody',
  oriental: 'Oriental',
  oud: 'Oud',
  leather: 'Leather',
}

/**
 * The longevity and projection bands the product page prints.
 *
 * Free strings on the server (`String`, no enum), so these are the house's own
 * vocabulary rather than a constraint — taken from the values the catalogue
 * already uses, so a new fragrance is described in the same words as the
 * existing ones instead of a near-miss like "10-12 hrs".
 */
export const LONGEVITY_BANDS = [
  'Room Longevity (2-3 Hours)',
  'Moderate (4-8 Hours)',
  'Moderate Longevity (4-8 Hours)',
  'Long Lasting (8-10 Hours)',
  'Long Lasting (10-12 Hours)',
  'Beast Mode (12-16 Hours)',
  'Beast Mode (16+ Hours)',
]

/** The projection bands, in the words the catalogue's tiles already use. */
export const PROJECTION_BANDS = ['Moderate', 'Moderate to High', 'High Projection', 'High Projection & Lasting', 'Room Filling']

/**
 * The badge labels a card can draw.
 *
 * **Not free text, and the reason is visible in the storefront:**
 * `ProductCard` renders only the badges it finds in `FLAGS`
 * (`frontend/src/data/tiers.js`) and silently drops every other word. A badge
 * spelled "Best Seller" here would be stored, published, and then drawn as
 * nothing at all — with no error anywhere to explain why. So the four the card
 * knows are the four on offer.
 *
 * `bestseller` and `featured` are separate booleans and are not badges: they
 * drive the home rail and the sort order, and are edited as their own switches.
 */
export const PRODUCT_BADGES = ['Bestseller', 'New', 'Limited', 'Back in Stock']

/**
 * Stock health, derived rather than stored — the same rule drives the
 * Inventory screen, the Products table and the dashboard's low-stock panel, so
 * they can never disagree.
 */
export function stockState({ stock, safeLimit }) {
  if (stock <= 0) return 'Out of Stock'
  if (stock <= safeLimit) return 'Low'
  if (stock <= safeLimit * 1.5) return 'Watch'
  return 'Healthy'
}

/** Unit margin in rupees. */
export function unitMargin({ price, cost }) {
  return (Number(price) || 0) - (Number(cost) || 0)
}
