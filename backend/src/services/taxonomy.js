import { Brand, Category, Product } from '../models/index.js'
import { slugify } from '../lib/format.js'
import { conflict, notFound } from '../middleware/error.js'
import {
  adminBrand,
  adminCategory,
  publicBrand,
  publicCategory,
} from '../lib/views.js'

/**
 * Categories and brands, and the counts neither of them stores.
 *
 * The storefront fixtures bake a `count` into every brand and every facet
 * (`count: 16`, `count: 7`) and those numbers are claims about the catalogue that
 * nothing keeps true — add one fragrance and both are wrong. Here they are
 * counted from the products on every read.
 *
 * **One catalogue read, three count maps.** Rather than a `$group` per relation,
 * the products' three index fields are selected once and the maps are built in
 * memory. That is a single query regardless of how many categories exist, and —
 * the reason it is done this way rather than with `$unwind` on `collections` —
 * a product whose `collections` array happens to carry both `custom` and
 * `atelier` for the same facet is counted **once**, because counting goes
 * through `Category.holds()` rather than over array elements.
 */

/** Build `id → count` maps for brands, shelves and facets in one pass. */
async function countCatalogue() {
  const products = await Product.find({ status: 'Active' }).select('brand category collections').lean()
  const [brands, shelves, facets] = await Promise.all([
    Brand.find().lean(),
    Category.find({ kind: 'shelf' }).lean(),
    Category.find({ kind: 'facet' }).lean(),
  ])

  const brandCounts = new Map()
  for (const product of products) {
    const id = String(product.brand ?? '')
    if (id) brandCounts.set(id, (brandCounts.get(id) ?? 0) + 1)
  }

  const countOf = (list) =>
    new Map(
      list.map((category) => {
        const model = Category.hydrate(category)
        return [String(category._id), products.reduce((total, product) => total + (model.holds(product) ? 1 : 0), 0)]
      }),
    )

  return {
    brands: brandCounts,
    shelves: countOf(shelves),
    facets: countOf(facets),
  }
}

/**
 * The membership rule, applied to a lean product.
 *
 * Delegates to the model's own `holds()` so there is exactly one definition of
 * what belongs to a category — a lean document has `category` and `collections`
 * and nothing else `holds()` reads, so it works unchanged. Reimplementing the
 * rule here would be the beginning of the two drifting apart.
 *
 * (No helper of its own: `countOf` hydrates each category **once** and calls
 * `holds()` per product, rather than hydrating a document per comparison.)
 */

/* ──────────────────────────────────────────────────────── storefront ──── */

/** The browse facets, each with a live count. `/api/categories`. */
export async function publicCategories() {
  const [facets, counts] = await Promise.all([Category.find({ kind: 'facet', status: 'Active' }).sort({ shelf: 1 }), countCatalogue()])
  return facets.map((facet) => publicCategory(facet, counts.facets.get(String(facet._id)) ?? 0))
}

/** The fragrance houses, each with a live count. `/api/brands`. */
export async function publicBrands() {
  const [brands, counts] = await Promise.all([Brand.find({ status: { $ne: 'Discontinued' } }).sort({ name: 1 }), countCatalogue()])
  return brands.map((brand) => publicBrand(brand, counts.brands.get(String(brand._id)) ?? 0))
}

/* ────────────────────────────────────────────────────────── admin ──── */

/** `GET /api/admin/taxonomy` — `{categories, brands, facets}`, envelope and all. */
export async function adminTaxonomy() {
  const [shelves, facets, brands, counts] = await Promise.all([
    Category.find({ kind: 'shelf' }).sort({ shelf: 1, name: 1 }),
    Category.find({ kind: 'facet' }).sort({ shelf: 1, name: 1 }),
    Brand.find().sort({ name: 1 }),
    countCatalogue(),
  ])

  return {
    // The admin's Categories screen manages the editorial shelves.
    categories: shelves.map((shelf) => ({
      ...adminCategory(shelf),
      count: counts.shelves.get(String(shelf._id)) ?? 0,
    })),
    brands: brands.map((brand) => ({
      ...adminBrand(brand),
      count: counts.brands.get(String(brand._id)) ?? 0,
    })),
    // The storefront's browse facets, so the same screen can show both — and so
    // the difference between a shelf and a facet is visible rather than implied.
    facets: facets.map((facet) => ({
      ...adminCategory(facet),
      kind: 'facet',
      key: facet.key,
      count: counts.facets.get(String(facet._id)) ?? 0,
    })),
  }
}

/* ────────────────────────────────────────────────────── categories ──── */

export async function createCategory(input) {
  const kind = input.kind ?? 'shelf'
  const slug = (input.slug ? slugify(input.slug) : slugify(input.name)) || null
  if (!slug) throw conflict('A category needs a name or slug that produces a usable URL.')

  const existing = await Category.findOne({ kind, slug })
  if (existing) throw conflict(`A ${kind} with the slug “${slug}” already exists.`)

  return Category.create({
    kind,
    name: input.name,
    slug,
    key: input.key ?? null,
    description: input.description ?? '',
    status: input.status ?? 'Active',
    shelf: input.shelf ?? 0,
  })
}

/**
 * Update a category.
 *
 * The slug is **not** regenerated from a renamed category. Changing a slug
 * breaks every published URL that points at it, so it is only changed when the
 * caller asks for a new one explicitly. Note also what does not happen here:
 * nothing rewrites products. Membership is a reference, so a rename cannot
 * orphan a shelf — the bug the admin's `upsertCategory` used to patch around.
 */
export async function updateCategory(id, input) {
  const category = await Category.findById(id)
  if (!category) throw notFound('That category does not exist.')

  if (input.name !== undefined) category.name = input.name
  if (input.description !== undefined) category.description = input.description
  if (input.status !== undefined) category.status = input.status
  if (input.shelf !== undefined) category.shelf = input.shelf
  if (input.key !== undefined) category.key = input.key || null

  if (input.slug !== undefined) {
    const slug = slugify(input.slug)
    if (!slug) throw conflict('That slug does not produce a usable URL.')
    if (slug !== category.slug) {
      const clash = await Category.findOne({ kind: category.kind, slug, _id: { $ne: category._id } })
      if (clash) throw conflict(`A ${category.kind} with the slug “${slug}” already exists.`)
      category.slug = slug
    }
  }

  await category.save()
  return category
}

/** Delete a category, refusing while anything still sits on it. */
export async function deleteCategory(id) {
  const category = await Category.findById(id)
  if (!category) throw notFound('That category does not exist.')

  const held = await countHeld(category)
  if (held > 0) {
    throw conflict(
      `“${category.name}” still holds ${held} fragrance${held === 1 ? '' : 's'}. Move or archive them before deleting it.`,
    )
  }

  await category.deleteOne()
  return category
}

/** How many products a category holds — the deletion guard's one query. */
async function countHeld(category) {
  if (category.kind === 'shelf') return Product.countDocuments({ category: category._id })
  const keys = [...new Set([category.key, category.slug].filter(Boolean))]
  return Product.countDocuments({ collections: { $in: keys } })
}

/* ────────────────────────────────────────────────────────── brands ──── */

export async function createBrand(input) {
  const slug = (input.slug ? slugify(input.slug) : slugify(input.name)) || null
  if (!slug) throw conflict('A brand needs a name or slug that produces a usable URL.')
  if (await Brand.findOne({ slug })) throw conflict(`A brand with the slug “${slug}” already exists.`)

  return Brand.create({
    name: input.name,
    slug,
    short: input.short ?? '',
    house: input.house ?? 'Designer Original',
    country: input.country ?? '',
    origin: input.origin ?? '',
    status: input.status ?? 'Stocked',
    since: input.since ?? null,
    logo: input.logo ?? '',
  })
}

export async function updateBrand(id, input) {
  const brand = await Brand.findById(id)
  if (!brand) throw notFound('That brand does not exist.')

  for (const field of ['name', 'short', 'house', 'country', 'origin', 'status', 'since', 'logo']) {
    if (input[field] !== undefined) brand[field] = input[field]
  }

  if (input.slug !== undefined) {
    const slug = slugify(input.slug)
    if (!slug) throw conflict('That slug does not produce a usable URL.')
    if (slug !== brand.slug) {
      if (await Brand.findOne({ slug, _id: { $ne: brand._id } })) throw conflict(`A brand with the slug “${slug}” already exists.`)
      brand.slug = slug
    }
  }

  await brand.save()
  return brand
}

export async function deleteBrand(id) {
  const brand = await Brand.findById(id)
  if (!brand) throw notFound('That brand does not exist.')

  const held = await Product.countDocuments({ brand: brand._id })
  if (held > 0) {
    throw conflict(
      `“${brand.name}” still has ${held} fragrance${held === 1 ? '' : 's'} in the catalogue. Reassign or archive them before deleting it.`,
    )
  }

  await brand.deleteOne()
  return brand
}

export default {
  publicCategories,
  publicBrands,
  adminTaxonomy,
  createCategory,
  updateCategory,
  deleteCategory,
  createBrand,
  updateBrand,
  deleteBrand,
}
