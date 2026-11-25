import { Counter } from '../models/index.js'
import { TIER_CODE } from '../models/Product.js'

/**
 * Stock-keeping unit codes, e.g. `RP-ORG-1061`.
 *
 * The shape is the admin's, because `admin/src/data/orders.js` references SKUs
 * directly on order lines and the Inventory screen groups by them — the
 * storefront's own `RP-ORG-101` style codes were adopted from the same scheme,
 * so one format serves both. The middle segment is the provenance tier, which is
 * what makes a SKU self-describing: `RP-INS-…` is an inspired interpretation and
 * `RP-ATT-…` an attar, readable without a lookup.
 *
 * Uniqueness comes from a `Counter` per tier rather than from scanning for the
 * highest existing number. Scanning is what a fixture file can get away with and
 * a server cannot: two staff members creating a fragrance at the same moment
 * would read the same maximum and mint the same code.
 */

/** The counter key for a tier, e.g. `sku:ORG`. */
export const skuCounterKey = (tier) => `sku:${TIER_CODE[tier] ?? 'GEN'}`

/** Build a SKU from a tier and a sequence number. */
export function formatSku(tier, sequence) {
  return `RP-${TIER_CODE[tier] ?? 'GEN'}-${String(sequence).padStart(3, '0')}`
}

/**
 * Reserve the next SKU for a tier.
 *
 * Called outside any transaction, deliberately: a number allocated to a create
 * that then fails is simply skipped. Reusing it would be worse — an aborted
 * insert would hand the same code to the next product, and any invoice or note
 * that quoted the first one would silently point at the wrong fragrance.
 */
export async function nextSku(tier) {
  const sequence = await Counter.next(skuCounterKey(tier))
  return formatSku(tier, sequence)
}

/**
 * Split a SKU back into its parts, for the seed's reconciliation.
 *
 * @returns {{tier: string|null, sequence: number|null, prefix: string}}
 */
export function parseSku(sku) {
  const match = /^([A-Z]+)-([A-Z]+)-(\d+)$/.exec(String(sku ?? '').toUpperCase())
  if (!match) return { tier: null, sequence: null, prefix: String(sku ?? '').toUpperCase() }
  const tier = Object.keys(TIER_CODE).find((name) => TIER_CODE[name] === match[2]) ?? null
  return { tier, sequence: Number(match[3]), prefix: `${match[1]}-${match[2]}` }
}

export default { nextSku, formatSku, parseSku, skuCounterKey }
