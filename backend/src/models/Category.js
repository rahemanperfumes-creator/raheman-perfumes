import { Schema, model } from 'mongoose'
import { baseOptions } from './options.js'

/**
 * A named grouping of fragrances — in two different senses.
 *
 * `kind: 'shelf'` is the admin's editorial taxonomy: Originals, Inspired Blends,
 * Attars, Custom Atelier, Combos, Gift Sets, Discovery. A product sits on
 * exactly one shelf.
 *
 * `kind: 'facet'` is the storefront's browse list: Men, Women, Unisex, Original,
 * Inspired, Custom, Attars, Combos. A product may belong to several, and they
 * group by gender and provenance as well as by shelf. Note the facet id and slug
 * genuinely differ for one entry — `key: 'custom'`, `slug: 'atelier'` — which is
 * why a facet carries both rather than one identifier doing two jobs.
 *
 * `count` is **not** a field. The storefront fixture bakes a count into each
 * facet (`count: 16`) and that number is a claim about the catalogue that nothing
 * keeps true; it is counted from the products at read time instead.
 */
export const CATEGORY_KINDS = ['shelf', 'facet']
export const CATEGORY_STATUSES = ['Active', 'Hidden', 'Archived']

const categorySchema = new Schema(
  {
    kind: { type: String, enum: CATEGORY_KINDS, required: true, index: true },
    /** `name` for a shelf, `label` for a facet — the same field either way. */
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, lowercase: true, trim: true },
    /**
     * A facet's public id, where it differs from the slug. The storefront's
     * `productsByCollection()` matches on this, so it has to survive verbatim.
     */
    key: { type: String, default: null },
    /** Shelf: a sentence of editorial copy. Facet: the one-line `blurb`. */
    description: { type: String, default: '' },
    status: { type: String, enum: CATEGORY_STATUSES, default: 'Active' },
    /** Shelf display order. Facets sort by this too, so the rail is stable. */
    shelf: { type: Number, default: 0 },
    legacyId: { type: String, default: null },
  },
  baseOptions,
)

// Unique per kind, not globally: a shelf and a facet may legitimately share a
// slug, and `originals` exists as both.
categorySchema.index({ kind: 1, slug: 1 }, { unique: true })
categorySchema.index({ kind: 1, shelf: 1 })

/**
 * Does a product belong to this category?
 *
 * Used to derive facet counts. A product's `collections` array holds the facet
 * keys the storefront wrote, and the fixture is not consistent about whether
 * that means the key or the slug, so both are accepted. Counting is done over
 * products rather than matches, so a product carrying both is not counted twice.
 */
categorySchema.methods.holds = function holds(product) {
  if (!product) return false
  if (this.kind === 'shelf') {
    const id = product.category?._id ?? product.category
    return String(id) === String(this._id)
  }
  const keys = new Set((product.collections ?? []).map(String))
  return keys.has(this.key ?? this.slug) || keys.has(this.slug)
}

export const Category = model('Category', categorySchema)
export default Category
