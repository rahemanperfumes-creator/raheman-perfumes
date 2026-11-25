import { Schema, model } from 'mongoose'
import { baseOptions } from './options.js'

/**
 * A fragrance house.
 *
 * The two frontends name these differently and this document has to satisfy
 * both. `admin/src/data/brands.js` uses the names the **catalogue actually
 * groups by** — `Dior Parfums`, which is what every product record's `brand`
 * field says — while `frontend/src/data/brands.js` lists `Christian Dior`,
 * `Chanel Paris`, `House of Creed`. Those storefront names disagree with the
 * storefront's own products, so the admin's naming is the authority here.
 *
 * What the storefront genuinely needs from a brand record is its display
 * `short` (`YSL`, `Dior`) and an `origin` label (`UAE`, not `United Arab
 * Emirates`), so both are carried on the document rather than dropped in favour
 * of the admin's vocabulary.
 *
 * `count` is deliberately **not** a field: the storefront fixture bakes one in
 * (`count: 7`) and it drifts the moment a product is added. It is counted from
 * the catalogue at read time.
 */
export const BRAND_HOUSES = ['Designer Original', 'Own Brand', 'Attar Brand']
export const BRAND_STATUSES = ['Stocked', 'Paused', 'Discontinued']

const brandSchema = new Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    /** Short display form for the storefront's brand strip — `YSL`, `Dior`. */
    short: { type: String, default: '' },
    house: { type: String, enum: BRAND_HOUSES, default: 'Designer Original' },
    country: { type: String, default: '' },
    /** Compact origin label the storefront renders: `UAE`, `USA`, `France`. */
    origin: { type: String, default: '' },
    logo: { type: String, default: '' },
    status: { type: String, enum: BRAND_STATUSES, default: 'Stocked' },
    since: { type: Number, default: null },
    /** The id this brand had in the frontend fixtures, kept for traceability. */
    legacyId: { type: String, default: null },
  },
  baseOptions,
)

brandSchema.index({ status: 1, name: 1 })

export const Brand = model('Brand', brandSchema)
export default Brand
