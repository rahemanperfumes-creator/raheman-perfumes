import { Schema, model } from 'mongoose'
import { baseOptions, ref } from './options.js'
import { barcodeFor } from '../lib/barcode.js'
import './Media.js'

/**
 * A fragrance.
 *
 * This one document serves both frontends, which is why it holds fields that
 * only staff care about (`cost`, `stock`, `safeLimit`, `salesYtd`) alongside the
 * ones a shopper sees. `src/lib/views.js` decides which half goes where —
 * `publicProduct()` must never emit `cost`.
 *
 * **Money.** `volumes[]` is the truth for a shopper: the storefront prices and
 * sells by size, and its top-level `price`/`mrp` are simply `volumes[0]`'s
 * (`frontend/src/data/products.js` sets them that way, and the PDP quotes it as
 * "from ₹8,999"). The admin works from a different figure: its
 * `admin/src/data/products.js` sets `price: 11500` for Sauvage, which is the
 * *hundred-millilitre* price, and derives `cost` from a tier ratio and revenue
 * from `salesYtd × price`. Those are two genuinely different questions — what a
 * shopper pays for a size, versus the house's headline price for a line — so
 * both are stored. Collapsing them would swing the admin's revenue figures by
 * about a fifth the moment the API went live.
 *
 * **Derived, never stored:** `price`/`mrp` (from `volumes[0]`), `inStock` (from
 * `stock`), and `rating`/`reviewCount` (from `ratingBaseline` plus the reviews
 * collection). The last of those needs explaining: the fixtures quote
 * `reviewCount: 120` for Sauvage while only a handful of reviews are authored,
 * so the difference is kept as an opening balance and the reported total is
 * `baseline + authored`. That keeps 120 exactly right today, and lets a new
 * review move the number tomorrow.
 *
 * **`barcode` is the exception to that list.** It is *derived from the SKU* yet
 * genuinely stored, because a barcode is not a display value — it is an artifact
 * that gets printed on a label and scanned for years. Re-deriving it on every
 * read would mean a later change to the encoder silently invalidating every
 * label already on a shelf. `barcodeOf()` below is the only place that decides
 * what it is, and the `pre('validate')` hook is the only place that sets it.
 */

export const TIERS = ['Original', 'Inspired', 'Mixed', 'Attar', 'Combo', 'Bakhoor', 'Car Perfume']
export const GENDERS = ['Men', 'Women', 'Unisex']
export const PRODUCT_STATUSES = ['Active', 'Draft', 'Archived']

/** Label prefix per provenance tier, used to build a SKU. Mirrors the admin. */
export const TIER_CODE = {
  Original: 'ORG',
  Inspired: 'INS',
  Mixed: 'MIX',
  Attar: 'ATT',
  Combo: 'CMB',
  Bakhoor: 'BKH',
  'Car Perfume': 'CAR',
}

/** Share of the selling price that goes on cost of goods, per tier. */
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
 * The barcode a SKU gets.
 *
 * A barcode is a scannable restatement of the SKU — `RP-ORG-1061` encodes as
 * `RP-ORG-1061` — so the two can never disagree about which bottle is which. The
 * floor never has to scan one code and look up another, and the label's human
 * readout is already the thing staff search the catalogue by.
 *
 * This is a **derivation, not a second identifier.** Minting a separate number
 * would mean a second sequence to keep in step with `sku`'s, and two records
 * that can drift apart. Uniqueness and permanence both come free: `nextSku()`
 * hands the SKU out from an atomic counter, and the SKU is fixed once assigned.
 *
 * Declared once, here, because the model hook, the admin's create path and the
 * seed's backfill all have to agree on it.
 */
export const barcodeOf = (sku) => barcodeFor(sku)

const volumeSchema = new Schema(
  {
    size: { type: String, required: true },
    price: { type: Number, required: true, min: 0 },
    mrp: { type: Number, min: 0 },
    label: { type: String, default: '' },
  },
  { _id: false },
)

const notesSchema = new Schema(
  {
    top: { type: [String], default: [] },
    heart: { type: [String], default: [] },
    base: { type: [String], default: [] },
  },
  { _id: false },
)

const productSchema = new Schema(
  {
    sku: { type: String, required: true, unique: true, uppercase: true, trim: true },
    /**
     * The staff-facing barcode, mirrored from the SKU — see `barcodeOf` above.
     *
     * Staff-only by construction: `adminProduct()` emits it and `publicProduct()`
     * does not, so the storefront never publishes a shelf code to a shopper.
     * Unique-indexed like the SKU it copies, which makes a duplicate label a
     * write the database refuses rather than two bottles wearing one code.
     *
     * Filled in by the `pre('validate')` hook below, so callers do not pass it —
     * a create that also set it by hand could only ever disagree with the SKU.
     */
    barcode: { type: String, unique: true, uppercase: true, trim: true, sparse: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true },

    // References, not names. The fixtures join products to their shelf and house
    // *by name*, which is why renaming a category in the admin silently orphaned
    // every fragrance on it — a whole class of bug that a ref cannot have.
    brand: ref('Brand'),
    category: ref('Category'),

    tier: { type: String, enum: TIERS, default: 'Original' },
    gender: { type: String, enum: GENDERS, default: 'Unisex' },
    family: { type: String, default: '' },
    concentration: { type: String, default: 'Eau de Parfum' },
    tagline: { type: String, default: '' },
    description: { type: String, default: '' },
    notes: { type: notesSchema, default: () => ({}) },

    /** The size ladder. Index 0 is the default the public price comes from. */
    volumes: {
      type: [volumeSchema],
      required: true,
      validate: {
        validator: (volumes) => volumes.length > 0,
        message: 'A fragrance needs at least one volume to be sellable.',
      },
    },

    // The house's own headline figures. See the note at the top of this file.
    listPrice: { type: Number, required: true, min: 0 },
    listMrp: { type: Number, min: 0 },
    cost: { type: Number, default: 0, min: 0 },

    stock: { type: Number, default: 0, min: 0 },
    /**
     * Units held back for the shop counter. `stock` is still the one physical
     * count — there are not two shelves — and this is a floor the storefront may
     * not sell below: with 20 on hand and 4 reserved, the counter can sell all
     * 20 while an online shopper sees 16. See `onlineStockOf()`.
     */
    shopReserve: { type: Number, default: 0, min: 0 },
    safeLimit: { type: Number, default: 15, min: 0 },
    status: { type: String, enum: PRODUCT_STATUSES, default: 'Active' },

    badges: { type: [String], default: [] },
    longevity: { type: String, default: '' },
    projection: { type: String, default: '' },
    bestseller: { type: Boolean, default: false },
    featured: { type: Boolean, default: false },

    /** Storefront facet keys. See `Category.holds()` for how they are matched. */
    collections: { type: [String], default: [], index: true },
    occasions: { type: [String], default: [], index: true },
    images: { type: [ref('Media', { required: false })], default: [] },

    batch: { type: String, default: '' },
    origin: { type: String, default: '' },

    salesYtd: { type: Number, default: 0, min: 0 },
    lastCompounded: { type: Date, default: null },

    /**
     * Reviews that predate this database: their count and the sum of their
     * ratings. Reported `reviewCount` is `count + authored` and reported
     * `rating` is `(sum + Σ authored) / reviewCount`, so the fixture's figures
     * stay exact while remaining live to new reviews.
     */
    ratingBaseline: {
      count: { type: Number, default: 0, min: 0 },
      sum: { type: Number, default: 0, min: 0 },
    },

    /** Provenance of the fixture merge — see the seed's reconciliation table. */
    legacyId: { type: String, default: null },
    legacySku: { type: String, default: null },
  },
  baseOptions,
)

/**
 * Mint the barcode from the SKU, on every save that has a SKU to read.
 *
 * A hook rather than a line in `services/products.create()` because the barcode
 * has to appear on *every* write path that can introduce a fragrance — the
 * admin's create, the panel's offline fallback, a future import — and a field
 * that only one of them remembers to set is a field that is null on half the
 * catalogue. Putting it on the schema makes it structural.
 *
 * `pre('save')` rather than `pre('validate')`, deliberately: `validateSync()` and
 * `validate()` do not run save hooks, so anything that validates a document
 * without saving it would come back with a barcode of `undefined` while
 * reporting no error — the worst shape of bug, because it is silent. Save hooks
 * cover `create()` and `save()`, which are the paths that actually persist.
 * `updateOne` and `replaceOne` bypass them, which is why `update()` in
 * `services/products.js` skips `barcode` explicitly and the seed backfills.
 *
 * A plain assignment rather than a "generate once" guard, so the code always
 * tracks the SKU. That sounds like it weakens "fixed", but the SKU is itself
 * fixed once assigned — `update()` only changes it when an operator deliberately
 * overrides it. And if a SKU *is* corrected, a barcode still pointing at the old
 * one would be the actual bug: the printed label would scan to a code the
 * catalogue no longer has.
 *
 * Skipped when there is no SKU, so Mongoose reports the missing required field
 * rather than this hook throwing about an empty string.
 */
productSchema.pre('save', function deriveBarcode(next) {
  if (this.sku) {
    try {
      this.barcode = barcodeOf(this.sku)
    } catch (error) {
      return next(error)
    }
  }
  return next()
})

/**
 * Refuse a SKU that cannot be encoded, at validation time.
 *
 * The save hook above throws on a bad SKU, but a throw from a save hook arrives
 * as a bare error rather than as a field error the admin's form can point at.
 * Checking here puts the sentence on the `sku` path, so `POST /admin/products`
 * with `RP_ORG_1` answers 422 naming the field — which is what the panel needs
 * to show it under the input.
 */
productSchema.path('sku').validate(function skuIsEncodable(value) {
  if (!value) return true
  try {
    barcodeOf(value)
    return true
  } catch {
    return false
  }
}, 'A SKU may only use A–Z, 0–9, spaces and hyphens — a barcode cannot carry anything else.')

// Search. A `$text` index rather than Atlas Search, which needs a paid tier.
// Weights approximate the storefront's own scorer in
// `frontend/src/services/productService.js`, where a name hit counts 10 and a
// note hit 4. Brand is matched separately by id, so the brand's name is never
// copied onto a product just to be searchable.
productSchema.index(
  { name: 'text', family: 'text', tier: 'text', concentration: 'text', 'notes.top': 'text', 'notes.heart': 'text', 'notes.base': 'text' },
  {
    name: 'product_search',
    weights: { name: 10, family: 6, 'notes.top': 4, 'notes.heart': 4, 'notes.base': 4, tier: 3, concentration: 2 },
  },
)

productSchema.index({ status: 1, tier: 1 })
productSchema.index({ status: 1, brand: 1 })
productSchema.index({ status: 1, category: 1 })
productSchema.index({ status: 1, gender: 1 })
productSchema.index({ status: 1, collections: 1 })
productSchema.index({ status: 1, featured: 1, bestseller: 1 })
productSchema.index({ status: 1, createdAt: -1 })
productSchema.index({ status: 1, stock: 1 })
productSchema.index({ status: 1, 'volumes.price': 1 })

/**
 * The default volume — what the public `price` and `mrp` come from, and the
 * figure the shop quotes as "from ₹…". Index 0, exactly as the storefront reads
 * it.
 */
productSchema.virtual('defaultVolume').get(function defaultVolume() {
  return this.volumes?.[0] ?? null
})

/**
 * What the storefront may sell: the shelf minus the counter's reserve, never
 * below zero. Derived rather than stored, so a counter sale or a restock moves
 * it without anyone having to keep a second number in step.
 *
 * A plain function as well as a virtual because aggregation results and
 * `lean()` rows have no virtuals.
 */
export const onlineStockOf = (doc) => Math.max(0, (doc?.stock ?? 0) - (doc?.shopReserve ?? 0))

productSchema.virtual('onlineStock').get(function onlineStock() {
  return onlineStockOf(this)
})

/** Unit margin in rupees. Derived, so it can never disagree with its inputs. */
productSchema.virtual('unitMargin').get(function unitMargin() {
  return (this.listPrice ?? 0) - (this.cost ?? 0)
})

export const Product = model('Product', productSchema)
export default Product
