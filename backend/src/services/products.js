import { Brand, Order, Product, Review, TIER_COST_RATIO } from '../models/index.js'
import { slugify } from '../lib/format.js'
import { nextSku } from '../lib/sku.js'
import { conflict, notFound } from '../middleware/error.js'
import { adminProduct, publicProduct, publicReview } from '../lib/views.js'
import { logPrice } from './activity.js'

/**
 * The catalogue.
 *
 * Read by both apps and written by one. The two reads are genuinely different —
 * the storefront wants a price ladder and a rating, the admin wants cost, stock
 * and year-to-date sales — so `list()` and `adminList()` both exist rather than
 * one endpoint with a flag, and `views.js` decides what each may see.
 *
 * **Rating and review count are not fields.** The products collection carries a
 * `ratingBaseline` (the reviews that predate this database) and the live reviews
 * are aggregated from the `reviews` collection on each read. Reported
 * `reviewCount` is `baseline.count + authored`, which keeps the fixtures' exact
 * figures true today while staying live to the next review. `reviewStats()`
 * below is the only place that arithmetic happens.
 */

/** Sort keys the storefront may ask for. */
export const SORTS = {
  featured: { featured: -1, bestseller: -1, name: 1 },
  newest: { createdAt: -1 },
  name: { name: 1 },
  'price-asc': { listPrice: 1 },
  'price-desc': { listPrice: -1 },
  'stock-asc': { stock: 1 },
  tier: { tier: 1, name: 1 },
}

/**
 * Aggregate live reviews for a set of products.
 *
 * Returns `id → {rating, reviewCount}` with the product's opening balance folded
 * in. Only `Published` reviews count — a review awaiting moderation must not
 * move the star rating a shopper is looking at.
 *
 * @param {Array<{_id: any, ratingBaseline?: {count: number, sum: number}}>} products
 */
export async function reviewStats(products) {
  if (!products.length) return new Map()

  const rows = await Review.aggregate([
    { $match: { product: { $in: products.map((product) => product._id) }, status: 'Published' } },
    { $group: { _id: '$product', count: { $sum: 1 }, sum: { $sum: '$rating' } } },
  ])

  const authored = new Map(rows.map((row) => [String(row._id), row]))
  const stats = new Map()

  for (const product of products) {
    const live = authored.get(String(product._id)) ?? { count: 0, sum: 0 }
    const count = (product.ratingBaseline?.count ?? 0) + live.count
    const sum = (product.ratingBaseline?.sum ?? 0) + live.sum
    stats.set(String(product._id), {
      count,
      // One decimal, as the storefront displays it (4.8, not 4.8333).
      rating: count > 0 ? Math.round((sum / count) * 10) / 10 : 0,
      reviewCount: count,
    })
  }

  return stats
}

/** Stats for a single product, whether or not it has any reviews yet. */
export async function statsFor(product) {
  const stats = await reviewStats([product])
  return stats.get(String(product._id)) ?? { rating: 0, reviewCount: 0 }
}

/** Turn a filter object into a Mongo query. */
function buildQuery(filters = {}) {
  const query = { status: filters.status ?? 'Active' }

  if (filters.collection) query.collections = filters.collection
  if (filters.tier) query.tier = { $in: [].concat(filters.tier) }
  if (filters.gender) query.gender = { $in: [].concat(filters.gender) }
  if (filters.family) query.family = { $in: [].concat(filters.family) }
  if (filters.concentration) query.concentration = { $in: [].concat(filters.concentration) }
  if (filters.brand) query.brand = filters.brand
  if (filters.category) query.category = filters.category
  if (filters.featured !== undefined) query.featured = filters.featured
  if (filters.bestseller !== undefined) query.bestseller = filters.bestseller
  // Online availability, not the raw shelf: units the counter holds back are
  // not on offer here. `$ifNull` because rows written before the reserve
  // existed carry no field at all.
  if (filters.inStock) query.$expr = { $gt: ['$stock', { $ifNull: ['$shopReserve', 0] }] }
  if (filters.maxPrice) query.listPrice = { ...(query.listPrice ?? {}), $lte: Number(filters.maxPrice) }
  if (filters.minPrice) query.listPrice = { ...(query.listPrice ?? {}), $gte: Number(filters.minPrice) }

  return query
}

/**
 * The refs and the gallery every product read needs, attached to a query.
 *
 * All three belong together, and that is the whole point of these two helpers.
 * `brand` and `category` were here from the start and `images` was forgotten,
 * and the failure was silent in every direction at once:
 *
 *  - `publicMedia()` reads `secureUrl` off whatever it is handed. Given an
 *    unpopulated ref it gets a bare ObjectId, finds no `secureUrl`, and emits an
 *    entry with `url: undefined` — which JSON then drops entirely. The
 *    storefront's `galleryOf()` filters entries with no `url`, so **a photograph
 *    uploaded in the panel never reached a single card, cart line or product
 *    page**. The shop quietly kept its stand-in flacon art and its stand-in
 *    hover shot, and the panel showed the upload as saved.
 *
 *  - It also broke the write round-trip: the edit form loaded a gallery of
 *    entries with no `url`, and `productBody()` maps each to `String(image.id)`
 *    — an empty string for any entry the server had emitted bare — which
 *    `.filter(Boolean)` then dropped. So opening a fragrance and saving it again
 *    could detach photographs nobody had touched.
 *
 * Two helpers rather than one because the two views genuinely differ: the
 * storefront reads `brand.short`, the panel does not.
 */
const withPublicRefs = (query) =>
  query.populate('brand', 'name slug short').populate('category', 'name slug').populate('images')

const withAdminRefs = (query) =>
  query.populate('brand', 'name slug').populate('category', 'name slug').populate('images')

/**
 * The storefront catalogue.
 *
 * `rating` sorting happens in memory after the stats are computed, because the
 * rating is derived and does not exist in the database to sort on. Every other
 * key is a real field and sorts in Mongo.
 */
export async function list(filters = {}) {
  const sortKey = SORTS[filters.sort] ? filters.sort : 'featured'
  const limit = filters.limit ? Math.min(Number(filters.limit), 200) : 0

  let query = withPublicRefs(Product.find(buildQuery(filters)))
  if (sortKey !== 'rating') query = query.sort(SORTS[sortKey])
  if (limit && sortKey !== 'rating') query = query.limit(limit)

  const products = await query
  const stats = await reviewStats(products)

  const views = products.map((product) => publicProduct(product, stats.get(String(product._id))))
  if (sortKey === 'rating') {
    views.sort((a, b) => b.rating - a.rating || b.reviewCount - a.reviewCount)
    return limit ? views.slice(0, limit) : views
  }
  return views
}

/**
 * Draft fragrances shown in the storefront's "Coming Soon" preview shelf.
 *
 * Strictly `status: 'Draft'` (never `Archived`), sorted newest-first so every
 * perfume, attar, combo, or bakhoor saved as a draft by Admin appears there
 * automatically until published as `Active`.
 */
export async function comingSoon(limit = 50) {
  const safeLimit = Math.min(Math.max(1, Number(limit) || 50), 100)
  const products = await withPublicRefs(
    Product.find({ status: 'Draft' })
      .sort({ createdAt: -1, name: 1 })
      .limit(safeLimit),
  )
  const stats = await reviewStats(products)
  return products.map((product) => publicProduct(product, stats.get(String(product._id))))
}

/** One product by its public slug, or `null` — the PDP's own read. */
export async function bySlug(slug) {
  const product = await withPublicRefs(Product.findOne({ slug: String(slug).toLowerCase() }))
  if (!product) return null
  return publicProduct(product, await statsFor(product))
}

/**
 * A whole product page in one round trip: `{product, reviews}`.
 *
 * `null` when the slug is unknown, rather than a 404 — the storefront's
 * `detailBundle` falls back to its bundled catalogue on a non-2xx, and a missing
 * fragrance is a legitimate answer that its own `getProduct()` also returns as
 * `null`.
 */
export async function bundle(slug) {
  const product = await withPublicRefs(Product.findOne({ slug: String(slug).toLowerCase() }))
  if (!product) return null

  const reviews = await Review.find({ product: product._id, status: 'Published' }).sort({ date: -1, createdAt: -1 })
  return {
    product: publicProduct(product, await statsFor(product)),
    reviews: reviews.map(publicReview),
  }
}

/**
 * Free-text search.
 *
 * Uses the `product_search` text index, which weights a name hit at 10 and a
 * note hit at 4 — approximating the storefront's own scorer in
 * `frontend/src/services/productService.js`. Mongo's text search is
 * **word-based**, so `"sauv"` does not match `"Sauvage"` the way the client's
 * `includes()` does. A prefix query is therefore run as a regex fallback when
 * the text search finds nothing, which is what makes the header's instant-search
 * behave while someone is still typing.
 *
 * The ordering will not match the local scorer exactly. That is stated in the
 * README rather than papered over.
 */
export async function search(term, { limit = 20 } = {}) {
  const needle = String(term ?? '').trim()
  if (!needle) return []

  const capped = Math.min(Number(limit) || 20, 50)
  const project = { score: { $meta: 'textScore' } }

  let products = await withPublicRefs(
    Product.find({ status: 'Active', $text: { $search: needle } }, project)
      .sort({ score: { $meta: 'textScore' } })
      .limit(capped),
  )

  if (!products.length) {
    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const pattern = new RegExp(escaped, 'i')
    // Brand is matched through its own collection rather than by copying its
    // name onto every product just to make it greppable.
    const brands = await Brand.find({ name: pattern }).select('_id')
    products = await withPublicRefs(
      Product.find({
        status: 'Active',
        $or: [{ name: pattern }, { family: pattern }, { tier: pattern }, { brand: { $in: brands.map((brand) => brand._id) } }],
      }).limit(capped),
    )
  }

  const stats = await reviewStats(products)
  const views = products.map((product) => publicProduct(product, stats.get(String(product._id))))
  // A rating tiebreak, as the storefront's scorer does.
  return views.sort((a, b) => b.rating - a.rating)
}

/* ──────────────────────────────────────────────────────────── admin ──── */

/** `GET /api/admin/products` — the array behind the `{products}` envelope. */
export async function adminList(filters = {}) {
  const query = {}
  if (filters.status && filters.status !== 'all') query.status = filters.status
  if (filters.tier) query.tier = filters.tier
  if (filters.brand) query.brand = filters.brand
  if (filters.q) {
    const pattern = new RegExp(String(filters.q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
    query.$or = [{ name: pattern }, { sku: pattern }]
  }

  const products = await withAdminRefs(
    Product.find(query).sort(SORTS[filters.sort] ? SORTS[filters.sort] : { updatedAt: -1 }),
  )

  const stats = await reviewStats(products)
  return products.map((product) => adminProduct(product, stats.get(String(product._id))))
}

/** One product for the admin's edit drawer. */
export async function adminOne(id) {
  const product = await withAdminRefs(Product.findById(id))
  if (!product) throw notFound('That fragrance does not exist.')
  return adminProduct(product, await statsFor(product))
}

/**
 * Several products in the admin's shape — the fragrances a counter bill just
 * moved, so the panel can land their new stock without re-reading the catalogue.
 */
export async function adminMany(ids = []) {
  if (!ids.length) return []
  const products = await withAdminRefs(Product.find({ _id: { $in: ids } }))
  const stats = await reviewStats(products)
  return products.map((product) => adminProduct(product, stats.get(String(product._id))))
}

/**
 * Derive the house's headline figures from the volume ladder.
 *
 * The admin form collects sizes and prices; `listPrice` is the largest volume's
 * price, which is what `admin/src/data/products.js` holds (Sauvage's 11500 is its
 * 100 ml price) and what the admin's revenue tiles multiply `salesYtd` by. Cost
 * defaults to the tier's ratio of that price, exactly as the admin derives it —
 * so a fragrance created here reports the same margin the fixture does.
 */
function deriveListFigures(input, existing = null) {
  const volumes = input.volumes ?? existing?.volumes ?? []
  const largest = volumes.reduce((biggest, volume) => (!biggest || volume.price > biggest.price ? volume : biggest), null)

  const listPrice = input.listPrice ?? largest?.price ?? existing?.listPrice ?? 0
  const listMrp = input.listMrp ?? largest?.mrp ?? existing?.listMrp ?? listPrice
  const tier = input.tier ?? existing?.tier ?? 'Original'
  const cost = input.cost ?? existing?.cost ?? Math.round(listPrice * (TIER_COST_RATIO[tier] ?? 0.3))

  return { listPrice, listMrp, cost }
}

/**
 * Create a fragrance.
 *
 * The slug is the storefront's rule — `slugify(name)` alone — because those are
 * the published URLs. `admin/src/data/products.js` slugs `name + brand`
 * (`sauvage-dior-dior-parfums`), which is a derived display string rather than a
 * URL; adopting it would break every link the shop has ever printed.
 *
 * The **barcode is not set here.** `Product.create()` runs the model's
 * `pre('save')` hook, which derives it from whichever SKU this ends up with —
 * the operator's override or the one `nextSku()` just minted. That is the whole
 * reason the derivation lives on the schema: this path, a seed, and any future
 * import all get a barcode without each having to remember.
 */
export async function create(input) {
  const slug = await uniqueSlug(input.slug ? slugify(input.slug) : slugify(input.name))
  const figures = deriveListFigures(input)

  const product = await Product.create({
    ...input,
    ...figures,
    slug,
    sku: input.sku?.trim() || (await nextSku(input.tier ?? 'Original')),
    status: input.status ?? 'Active',
  })

  await logPrice(`New fragrance added: ${product.name} (${product.sku}).`, {
    actor: input.actorLabel ?? 'Catalogue',
    target: product.sku,
  })

  return product
}

/**
 * Update a fragrance.
 *
 * The slug is not regenerated on a rename, for the same reason a category's is
 * not: a published URL that silently changes is a broken link somewhere. And
 * note the honest gap — because `admin/src/data/products.js` derives its slug
 * from `name + brand`, an admin *rename* in the panel would mint a new public
 * slug. That is a one-line follow-up in the product form, which cannot be done
 * from the backend.
 */
export async function update(id, input) {
  const product = await Product.findById(id)
  if (!product) throw notFound('That fragrance does not exist.')

  const fields = [
    'name',
    'brand',
    'category',
    'tier',
    'gender',
    'family',
    'concentration',
    'tagline',
    'description',
    'notes',
    'volumes',
    'stock',
    'safeLimit',
    'status',
    'badges',
    'longevity',
    'projection',
    'bestseller',
    'featured',
    'collections',
    'occasions',
    'images',
    'batch',
    'origin',
    'salesYtd',
    'lastCompounded',
  ]
  for (const field of fields) {
    if (input[field] !== undefined) product[field] = input[field]
  }

  if (input.sku !== undefined && input.sku.trim() && input.sku.trim().toUpperCase() !== product.sku) {
    product.sku = input.sku.trim().toUpperCase()
  }
  // `barcode` is deliberately absent from the field list above and is not
  // copied here. It is not a field an operator edits — it is a function of the
  // SKU, set by the model's `pre('save')` hook on every write. Accepting one
  // from a request body would let a caller store a label that encodes something
  // the catalogue does not contain, which is the one thing a barcode must never
  // do. A corrected SKU re-derives it; nothing else may move it.
  if (input.slug !== undefined) {
    const slug = slugify(input.slug)
    if (slug && slug !== product.slug) product.slug = await uniqueSlug(slug, product._id)
  }

  Object.assign(product, deriveListFigures(input, product))
  await product.save()
  return product
}

/**
 * Archive rather than delete.
 *
 * A product referenced by an order line cannot simply vanish — `admin/src/data/
 * orders.js` points at SKUs, and the order history has to keep resolving. So the
 * default is a status change; `hard` deletes only when nothing references it.
 */
export async function remove(id, { hard = false } = {}) {
  const product = await Product.findById(id)
  if (!product) throw notFound('That fragrance does not exist.')

  if (!hard) {
    product.status = 'Archived'
    await product.save()
    await logPrice(`Fragrance archived: ${product.name} (${product.sku}).`, { target: product.sku })
    return product
  }

  const ordered = await Order.countDocuments({ 'items.product': product._id })
  if (ordered > 0) {
    throw conflict(`${product.name} appears on ${ordered} order${ordered === 1 ? '' : 's'} and cannot be deleted. Archive it instead.`)
  }

  await Review.deleteMany({ product: product._id })
  await product.deleteOne()
  await logPrice(`Fragrance deleted: ${product.name} (${product.sku}).`, { target: product.sku })
  return product
}

/** Move a product between Active, Draft and Archived. */
export async function setStatus(id, status) {
  const product = await Product.findById(id)
  if (!product) throw notFound('That fragrance does not exist.')
  product.status = status
  await product.save()
  return product
}

/** A slug that is not already taken, suffixed only when it has to be. */
async function uniqueSlug(base, excludeId = null) {
  const slug = base || 'fragrance'
  let candidate = slug
  let suffix = 2
  // Bounded, because an unbounded loop against a live collection is a way to
  // hang a request rather than fail it.
  while (suffix < 100) {
    const clash = await Product.findOne({ slug: candidate, ...(excludeId ? { _id: { $ne: excludeId } } : {}) })
    if (!clash) return candidate
    candidate = `${slug}-${suffix}`
    suffix += 1
  }
  throw conflict(`Could not find a free slug based on “${slug}”.`)
}

/**
 * The products a PDP shows underneath itself.
 *
 * Same family scores 3, same brand 2, same tier 2, same gender 1 — the same
 * weights the storefront's local `relatedProducts()` uses, so the rail does not
 * reshuffle when the API comes online.
 */
export async function related(slug, { limit = 4 } = {}) {
  const base = await Product.findOne({ slug: String(slug).toLowerCase() })
  if (!base) return []

  const candidates = await withPublicRefs(
    Product.find({ status: 'Active', _id: { $ne: base._id } }).limit(60),
  )

  const stats = await reviewStats(candidates)
  const scored = candidates
    .map((product) => {
      const stat = stats.get(String(product._id)) ?? { rating: 0 }
      let score = 0
      if (product.family === base.family) score += 3
      if (String(product.brand?._id ?? product.brand) === String(base.brand)) score += 2
      if (product.tier === base.tier) score += 2
      if (product.gender === base.gender) score += 1
      return { product, score, rating: stat.rating }
    })
    .sort((a, b) => b.score - a.score || b.rating - a.rating)

  return scored.slice(0, limit).map((entry) => publicProduct(entry.product, stats.get(String(entry.product._id))))
}

/** Resolve a list of collection keys to their products, counted live. */
export async function byCollection(collection, { limit = 0 } = {}) {
  return list({ collection, limit })
}

export default {
  list,
  bySlug,
  bundle,
  search,
  related,
  byCollection,
  adminList,
  adminOne,
  create,
  update,
  remove,
  setStatus,
  reviewStats,
  statsFor,
  SORTS,
}
