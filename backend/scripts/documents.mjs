/**
 * Fixtures → database documents. The reconciliation.
 *
 * The two frontends describe the same business and disagree in places. Every
 * disagreement needs a stated winner, and this file is where each one is
 * decided and written down. The three that matter:
 *
 *   1. **Money.** `frontend/src/data/offers.js` stores each coupon's discount as
 *      a *function* (`pct(10, 999, 500)`), which cannot go in a database. It is
 *      translated to `{type, value, minOrder, cap}` in `COUPON_RULES` below. The
 *      two apps also disagreed about the free-delivery threshold — the
 *      storefront's cart uses ₹999 and publishes it in `OFFER_TERMS.dispatch`,
 *      while `admin/src/data/orders.js` uses ₹2,999. ₹999 wins, because it is
 *      the figure a shopper is actually charged. The seeded orders keep the
 *      amounts the admin fixtures state regardless, because an order stores the
 *      rule it was priced under.
 *
 *   2. **Identity.** `cust-1042` is one person in two shapes. The admin's
 *      `orders: 14` / `totalSpent: 148900` are documented as lifetime figures
 *      that are *not* the sum of its own order book, so they are seeded as an
 *      **opening balance** of exactly `lifetime − Σ seeded orders`. The number a
 *      staff member reads today is therefore unchanged, and it stays live
 *      tomorrow when the patron places another order.
 *
 *   3. **Catalogue.** The two catalogues overlap by only four fragrances
 *      (`Sauvage Dior`, `Tobacco Vanille Tribute`, `Baccarat Rouge Tribute`,
 *      `Vanilla Wood Artisanal Mix`) — the plan expected them to be near-duplicates,
 *      and reading them showed they are not. So the catalogue is seeded as the
 *      **union**, merged on a normalised name, and each app contributes the
 *      fields it actually owns: the storefront supplies the public slug, the
 *      editorial copy, the volume ladder and the facet keys; the admin supplies
 *      the SKU, the shelf, cost, stock and the sales figures. A fragrance that
 *      exists on only one side is seeded from that side alone.
 *
 * **Nothing here touches the database.** Every document refers to the others by
 * a string — a slug, or a fixture id — carried in a `$`-prefixed field, and
 * `scripts/seed.mjs` resolves those to ObjectIds once the rows exist. That is
 * what lets `scripts/export-fixtures.mjs` dump the same documents as readable
 * JSON without a connection, and it keeps the reconciliation testable on its own.
 */

import { loadFixtures } from './fixtures.mjs'
import { slugify } from '../src/lib/format.js'
import { TIER_COST_RATIO, TIER_CODE, barcodeOf } from '../src/models/Product.js'

/** The password every seeded account gets. Printed by the seed. */
export const DEVELOPMENT_PASSWORD = 'Rehman@2026'

/**
 * The staff logins. There is one category — the owner — and one account in it.
 *
 * Deliberately not drawn from the customer fixtures. The `by` labels in
 * `admin/src/data/inventory.js` ('Superadmin', 'Atelier Lead', 'Store Manager')
 * are historical prose; every one of them resolves to the owner in
 * `LEDGER_AUTHORS` now that the other staff roles are gone.
 */
export const STAFF = [
  { email: 'pratikdash9938@gmail.com', name: 'Pratik Dash', role: 'owner', label: 'Superadmin' },
]

/** The fixture's `by` value → the staff account that stands behind it. */
const LEDGER_AUTHORS = {
  Superadmin: 'pratikdash9938@gmail.com',
  'Store Manager': 'pratikdash9938@gmail.com',
}

/**
 * `admin/src/data/inventory.js` uses prose reasons; `src/models/StockLedger.js`
 * has a fixed enum. The prose is kept verbatim in `reasonNote` so nothing is
 * lost, and the enum carries the closest meaning.
 */
const LEDGER_REASONS = {
  Compounding: 'New Batch Made',
  'Atelier compounding': 'New Batch Made',
  'New Batch Made': 'New Batch Made',
  'Stock count correction': 'Stock count correction',
  'Restock — supplier delivery': 'Stock received',
  'Damaged in transit': 'Damaged or expired',
  'Customer return restocked': 'Return to stock',
  'Sample dispatched': 'Manual adjustment',
  'Sample given': 'Manual adjustment',
}

/**
 * The coupon translation — the single most important table in the seed.
 *
 * Each entry is the literal reading of the `pct()` / `flat()` call in
 * `frontend/src/data/offers.js`:
 *
 *     pct(10, 999, 500)   →  { type: 'percent', value: 10, minOrder: 999,  cap: 500 }
 *     flat(200, 1499)     →  { type: 'flat',    value: 200, minOrder: 1499, cap: null }
 *
 * `scope` is carried because the fixture's own terms already promise it — the
 * FRAGRANCE15 terms say it "excludes Original branded flacons and Pure Attars",
 * and the OUD200 terms say it is "valid on custom atelier commissions only".
 * Neither is enforced by anything today; the model says so, and this is the data
 * those rules would need.
 */
const COUPON_RULES = {
  WELCOME10: { type: 'percent', value: 10, minOrder: 999, cap: 500 },
  FIRSTORDER: { type: 'percent', value: 15, minOrder: 1499, cap: 200 },
  FRAGRANCE15: {
    type: 'percent',
    value: 15,
    minOrder: 999,
    cap: 900,
    scope: { excludeTiers: ['Original', 'Attar'] },
  },
  FESTIVE30: { type: 'percent', value: 30, minOrder: 2500, cap: 2500 },
}

/**
 * The rule the seeded orders were priced under.
 *
 * Frozen onto each order rather than read from settings, which is the entire
 * point of `pricing` being a snapshot: these orders were placed when delivery
 * was free above ₹2,999, and a change to the live threshold must not silently
 * re-price history. Order placement from the API uses today's settings.
 */
const SEEDED_RULE = { shippingFee: 79, freeShippingOver: 2999, giftWrapFee: 149, gstRate: 18 }

/**
 * What a storefront-only fragrance gets for a shelf count.
 *
 * `frontend/src/data/products.js` carries no stock figure at all — only an
 * `inStock` boolean. A storefront-only line is therefore seeded with a working
 * shelf when that flag is set and an empty one when it is not, so `inStock`
 * survives the migration. The figure itself is arbitrary and is the one number
 * in this seed that is: a real deployment would replace it with a stock count.
 */
const DERIVED_STOCK = 48

/** Sizes used when an admin-only line names none. */
const ATTAR_VOLUME = '12ml'
const DEFAULT_VOLUME = '50ml'

/** Shelf slug → the facet key the same fragrance belongs to, where one exists. */
const SHELF_FACETS = {
  originals: 'originals',
  inspired: 'inspired',
  attars: 'attars',
  combos: 'combos',
}

/** Tier → the editorial shelf a storefront-only fragrance sits on. */
const TIER_SHELVES = {
  Original: 'originals',
  Inspired: 'inspired',
  Mixed: 'inspired',
  Attar: 'attars',
  Combo: 'combos',
}

/**
 * The houses the two apps name differently.
 *
 * There is no rule to derive this from — the storefront writes `Chanel Haute`
 * and `Christian Dior` where the admin writes `Chanel` and `Dior Parfums`, and
 * the storefront's own products use the *admin's* names. So the alias table is
 * hand-written, and a brand that is not in it is treated as its own house, which
 * is the honest outcome for the four the storefront lists and the admin does not
 * stock (Armani, Gucci, Hermès, Nishane).
 */
const BRAND_ALIASES = {
  'christian dior': 'dior-parfums',
  'dior parfums': 'dior-parfums',
  'chanel paris': 'chanel',
  'chanel haute': 'chanel',
  chanel: 'chanel',
  'tom ford beauty': 'tom-ford',
  'tom ford private blend': 'tom-ford',
  'tom ford': 'tom-ford',
  ysl: 'yves-saint-laurent',
  'yves saint laurent': 'yves-saint-laurent',
  'versace parfums': 'versace',
  versace: 'versace',
  ajmal: 'ajmal',
  'ajmal royal oudh': 'ajmal',
  creed: 'creed',
  'house of creed': 'creed',
  rehman: 'rehman-atelier',
  'rehman atelier': 'rehman-atelier',
  'rehman signature house': 'rehman-atelier',
}

/** Compact origin labels, as the storefront renders them. */
const ORIGIN_SHORT = {
  'United Arab Emirates': 'UAE',
  'United States': 'USA',
  'United Kingdom': 'UK',
}

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

// ---------------------------------------------------------------- small helpers

/**
 * A comparison key for names.
 *
 * Lowercased, accents stripped (the admin writes `La Nuit de L’Homme` with a
 * typographic apostrophe), punctuation removed. Used to pair a fragrance across
 * the two catalogues and a brand name with its alias.
 */
export function normalizeName(value) {
  return String(value ?? '')
    .normalize('NFKD')
    // Strip the combining accents NFKD just separated off. Written as escapes
    // rather than the literal marks, which no editor displays usefully.
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

const asDate = (value) => {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

const addDays = (date, days) => (date ? new Date(date.getTime() + days * DAY) : null)

const round = (value) => Math.round(Number(value) || 0)

const aliasFor = (name) => BRAND_ALIASES[normalizeName(name)] ?? slugify(name)

const originFor = (country) => ORIGIN_SHORT[country] ?? country ?? ''

/** The size an admin-only line sells in, read off its concentration string. */
function volumeFor(concentration) {
  const measure = /(\d+)\s*ml/i.exec(concentration ?? '')
  if (measure) return `${measure[1]}ml`
  if (/attar/i.test(concentration ?? '')) return ATTAR_VOLUME
  return DEFAULT_VOLUME
}

// ------------------------------------------------------------------ the builder

/**
 * Turn both fixture sets into the documents the seed writes.
 *
 * @returns {Promise<{documents: object, counters: object, notes: string[]}>}
 */
export async function buildDocuments() {
  const fixtures = await loadFixtures()
  const { storefront: shop, admin: panel } = fixtures
  const notes = []

  // ------------------------------------------------------------------ brands

  /**
   * The admin's twelve houses are the catalogue's own grouping, so they are the
   * spine; the storefront adds four it stocks and the panel does not list, plus
   * the display `short` and compact `origin` its brand strip renders.
   */
  const brandBySlug = new Map()

  for (const brand of panel.brands) {
    brandBySlug.set(brand.slug, {
      slug: brand.slug,
      name: brand.name,
      short: '',
      house: brand.house,
      country: brand.country,
      origin: originFor(brand.country),
      status: brand.status,
      since: brand.since ?? null,
      legacyId: brand.id,
    })
  }

  for (const brand of shop.brands) {
    const slug = aliasFor(brand.name)
    const existing = brandBySlug.get(slug)
    if (existing) {
      // The storefront owns the display vocabulary; the admin owns the commerce
      // fields. Neither overwrites the other.
      existing.short = existing.short || brand.short
      existing.origin = originFor(brand.origin)
      continue
    }
    brandBySlug.set(slug, {
      slug,
      name: brand.name,
      short: brand.short,
      house: 'Designer Original',
      country: brand.origin,
      origin: originFor(brand.origin),
      status: 'Stocked',
      since: null,
      legacyId: brand.id,
    })
    notes.push(`brand "${brand.name}" exists in the storefront only — seeded from it (id ${brand.id}).`)
  }

  const brands = [...brandBySlug.values()].sort((a, b) => a.name.localeCompare(b.name))

  // -------------------------------------------------------------- categories

  /** The admin's shelves, one per editorial grouping. */
  const shelves = panel.categories.map((category) => ({
    kind: 'shelf',
    name: category.name,
    slug: category.slug,
    key: null,
    description: category.description,
    status: category.status,
    shelf: category.shelf,
    legacyId: category.id,
  }))

  /**
   * The storefront's browse list. Facets are a different relation from a shelf —
   * a fragrance has exactly one shelf and may carry several facets — so they
   * share a collection with a `kind` discriminator rather than being merged.
   *
   * `key` is stored alongside `slug` because one facet's two identifiers genuinely
   * differ: `{ id: 'custom', slug: 'atelier' }`. The storefront matches products
   * on the key, the URL uses the slug. `count` is dropped on purpose — the
   * fixture bakes one in and it is a claim nothing keeps true.
   */
  const facets = shop.categories.map((facet, index) => ({
    kind: 'facet',
    name: facet.label,
    slug: facet.slug,
    key: facet.id,
    description: facet.blurb,
    status: 'Active',
    shelf: index + 1,
    legacyId: facet.id,
  }))

  const categories = [...shelves, ...facets]
  const facetKeys = new Set(facets.flatMap((facet) => [facet.key, facet.slug]))
  const shelfSlugs = new Set(shelves.map((shelf) => shelf.slug))

  /**
   * A shelf is found by its **name**, not by slugging the name: the admin writes
   * "Inspired Blends" and "Custom Atelier" for shelves whose slugs are `inspired`
   * and `atelier`, so `slugify()` would miss both.
   */
  const shelfSlugByName = new Map(panel.categories.map((category) => [normalizeName(category.name), category.slug]))

  // ---------------------------------------------------------------- products

  /** The two catalogues, indexed by normalised name. */
  const shopByName = new Map(shop.products.map((product) => [normalizeName(product.name), product]))
  const panelByName = new Map(panel.products.map((product) => [normalizeName(product.name), product]))
  const allNames = [...new Set([...panelByName.keys(), ...shopByName.keys()])]

  /** Authored reviews per slug, so `ratingBaseline` can carry the difference. */
  const authoredBySlug = new Map()
  for (const [slug, list] of Object.entries(shop.reviews)) authoredBySlug.set(slug, list)

  const products = []
  const slugByProductName = new Map()

  for (const name of allNames) {
    const onShop = shopByName.get(name) ?? null
    const onPanel = panelByName.get(name) ?? null

    // The storefront's slug wins: those are the URLs already published, and the
    // admin's `slugify(name + brand)` cannot reproduce them.
    const slug = onShop?.slug ?? slugify(onPanel.name)
    const tier = onPanel?.tier ?? onShop?.tier ?? 'Original'
    const brandSlug = aliasFor(onPanel?.brand ?? onShop?.brand)
    const shelfSlug = onPanel
      ? (shelfSlugByName.get(normalizeName(onPanel.category)) ?? slugify(onPanel.category))
      : (TIER_SHELVES[tier] ?? 'originals')

    if (!shelfSlugs.has(shelfSlug)) {
      notes.push(`product "${name}" maps to shelf "${shelfSlug}", which is not one of the seven shelves.`)
    }

    /**
     * The volume ladder.
     *
     * A storefront line already has one and it is the truth for a shopper. An
     * admin-only line has a single `price` and no ladder, so it is seeded with
     * one size at that price rather than a ladder invented from a ratio — a
     * guessed `30ml` price is a number the house never set.
     */
    const volumes = onShop?.volumes?.length
      ? onShop.volumes.map((volume) => ({
          size: volume.size,
          price: round(volume.price),
          mrp: round(volume.mrp ?? volume.price),
          label: volume.label ?? '',
        }))
      : [
          {
            size: volumeFor(onPanel.concentration),
            price: round(onPanel.price),
            mrp: round(onPanel.mrp ?? onPanel.price),
            label: 'Signature',
          },
        ]

    const listPrice = onPanel ? round(onPanel.price) : round(volumes[0].price)
    const listMrp = onPanel ? round(onPanel.mrp ?? listPrice) : round(volumes[0].mrp ?? listPrice)

    /**
     * The review baseline.
     *
     * The storefront quotes `reviewCount: 120` for Sauvage while only a handful
     * of reviews are authored, so the difference is stored as an opening balance:
     * reported count is `baseline.count + authored` and reported rating is
     * `(baseline.sum + Σ authored ratings) / reported count`. 120 stays exactly
     * 120 today, and a new review moves it tomorrow.
     */
    const authored = onShop ? (authoredBySlug.get(slug) ?? []) : []
    const reportedCount = round(onPanel?.reviews ?? onShop?.reviewCount ?? 0)
    const reportedRating = Number(onPanel?.rating ?? onShop?.rating ?? 0)
    const authoredSum = authored.reduce((sum, review) => sum + (review.rating ?? 0), 0)
    const baselineCount = Math.max(0, reportedCount - authored.length)
    const baselineSum = Math.max(0, Math.round(reportedRating * reportedCount) - authoredSum)

    if (reportedCount && baselineCount === 0 && authored.length > reportedCount) {
      notes.push(`product "${name}" has ${authored.length} authored reviews but a quoted count of ${reportedCount}.`)
    }

    /**
     * Facet keys. A storefront line carries its own; an admin-only line gets the
     * facet matching its shelf plus its gender, filtered to facets that exist —
     * so a product can never point at a browse tile the storefront does not have.
     */
    const collections = onShop
      ? [...new Set(onShop.collections ?? [])]
      : [SHELF_FACETS[shelfSlug], String(onPanel.gender ?? '').toLowerCase()].filter((key) => key && facetKeys.has(key))

    const description =
      onShop?.description ??
      `${onPanel.concentration} · ${onPanel.family} · ${onPanel.tier} tier, hand-filled by Rehman Perfume.`

    products.push({
      $brand: brandSlug,
      $category: shelfSlug,

      sku: onPanel?.sku ?? null, // filled below for storefront-only lines
      slug,
      name: onPanel?.name ?? onShop.name,

      tier,
      gender: onPanel?.gender ?? onShop?.gender ?? 'Unisex',
      family: onPanel?.family ?? onShop?.family ?? '',
      concentration: onPanel?.concentration ?? onShop?.concentration ?? 'Eau de Parfum',
      tagline: onShop?.tagline ?? `${onPanel.concentration} • ${onPanel.tier}`,
      description,
      notes: {
        top: onShop?.notes?.top ?? [],
        heart: onShop?.notes?.heart ?? [],
        base: onShop?.notes?.base ?? [],
      },

      volumes,
      listPrice,
      listMrp,
      cost: onPanel ? round(onPanel.cost) : round(listPrice * (TIER_COST_RATIO[tier] ?? 0.45)),

      // A storefront line records only whether it is sellable, so the flag is
      // what survives; see `DERIVED_STOCK`.
      stock: onPanel ? round(onPanel.stock) : onShop?.inStock ? DERIVED_STOCK : 0,
      safeLimit: round(onPanel?.safeLimit ?? 15),
      status: onPanel?.status ?? 'Active',

      badges: onShop?.badges ?? [],
      longevity: onShop?.longevity ?? '',
      projection: onShop?.projection ?? '',
      bestseller: Boolean(onShop?.bestseller),
      featured: Boolean(onShop?.featured),

      collections,
      images: [],

      batch: onShop?.batch ?? '',
      origin: onShop?.origin ?? brandBySlug.get(brandSlug)?.country ?? '',

      salesYtd: round(onPanel?.salesYtd ?? 0),
      lastCompounded: asDate(onPanel?.lastCompounded),

      ratingBaseline: { count: baselineCount, sum: baselineSum },

      legacyId: onShop?.id ?? onPanel?.id ?? null,
      legacySku: onShop?.sku ?? null,
    })

    slugByProductName.set(name, slug)
  }

  /**
   * SKUs. The admin's are adopted because the order book and the Inventory
   * screen already reference them.
   *
   * One wrinkle worth stating: the admin fixtures are not internally consistent
   * — `admin/src/data/orders.js` writes `RP-ORG-1054` for Sauvage Dior while
   * `admin/src/data/products.js` derives `RP-ORG-1047` for the same fragrance.
   * The order book is what staff read and what a search has to resolve, so a SKU
   * used on an order line wins over a derived one.
   */
  const skuByProductName = new Map()
  for (const order of panel.orders) {
    for (const item of order.items) {
      const name = normalizeName(item.name)
      if (!skuByProductName.has(name)) skuByProductName.set(name, item.sku)
    }
  }

  const claimed = new Set()
  for (const product of products) {
    const name = normalizeName(product.name)
    let sku = skuByProductName.get(name) ?? product.sku

    if (!sku) {
      // A storefront-only line. Mint one from the highest number the admin
      // fixtures already issued for this tier.
      const prefix = `RP-${TIER_CODE[product.tier] ?? 'GEN'}-`
      const highest = products.reduce((max, other) => {
        if (!other.sku?.startsWith(prefix)) return max
        const n = Number(other.sku.slice(prefix.length))
        return Number.isFinite(n) && n > max ? n : max
      }, 1000)
      let next = highest + 7
      while (claimed.has(`${prefix}${next}`)) next += 7
      sku = `${prefix}${next}`
      claimed.add(sku)
      notes.push(`product "${product.name}" is storefront-only — minted SKU ${sku}.`)
    }

    if (product.legacySku && product.legacySku !== sku) {
      notes.push(`product "${product.name}": admin SKU ${sku} adopted, storefront SKU ${product.legacySku} kept as legacySku.`)
    }
    product.sku = sku
    /**
     * The barcode, mirrored from the SKU that was just settled.
     *
     * Set here as well as in the model's `pre('save')` hook because the seed
     * writes with `replaceOne({slug}, doc, {upsert: true})`, and `replaceOne` is a
     * driver-level write that runs no Mongoose middleware — so a document built
     * here and stored straight through would land with no barcode at all. The
     * derivation is the same function the hook uses, so the two cannot disagree.
     */
    product.barcode = barcodeOf(sku)
  }

  const productByName = new Map(products.map((product) => [normalizeName(product.name), product]))

  // --------------------------------------------------------------- customers

  const shopAccount = shop.customer
  const ordersByCustomer = new Map()
  for (const order of panel.orders) {
    const list = ordersByCustomer.get(order.customer) ?? []
    list.push(order)
    ordersByCustomer.set(order.customer, list)
  }

  const customers = []
  for (const record of panel.customers) {
    const isDemoPatron = record.id === shopAccount?.id
    const seeded = ordersByCustomer.get(record.name) ?? []

    /**
     * The opening balance.
     *
     * `admin/src/data/customers.js` says outright that `orders` and `totalSpent`
     * are lifetime figures and not a sum over `ADMIN_ORDERS`. So the history
     * that predates this database is `lifetime − Σ seeded` — which makes the
     * figure a staff member reads today byte-for-byte what the fixture states,
     * while still moving when a new order lands.
     */
    const seededSpend = seeded.reduce((sum, order) => sum + order.amount, 0)
    const seededCount = seeded.length
    const latestSeeded = seeded
      .map((order) => asDate(order.placedAt))
      .filter(Boolean)
      .sort((a, b) => b - a)[0]

    const fixtureLastOrder = asDate(record.lastOrder)
    const lastOrder =
      fixtureLastOrder && latestSeeded
        ? new Date(Math.max(fixtureLastOrder.getTime(), latestSeeded.getTime()))
        : (fixtureLastOrder ?? latestSeeded ?? null)

    const openingOrders = Math.max(0, record.orders - seededCount)
    const openingSpent = Math.max(0, record.totalSpent - seededSpend)
    if (openingOrders !== record.orders || openingSpent !== record.totalSpent) {
      notes.push(
        `customer ${record.name}: lifetime ${record.orders}/${record.totalSpent} = opening ${openingOrders}/${openingSpent} + ${seededCount} seeded order(s).`,
      )
    }

    customers.push({
      legacyId: record.id,
      name: record.name,
      email: record.email,
      phone: record.phone,
      city: record.city,
      status: record.status,
      loyaltyTier: record.loyaltyTier,
      loyaltyPoints: record.loyaltyPoints,
      preferredAccord: isDemoPatron ? shopAccount.preferredAccord : '',
      joined: asDate(record.joined),
      notes: record.notes,
      addresses: mergeAddresses(record, isDemoPatron ? shop.addresses : []),
      lifetime: { openingOrders, openingSpent, lastOrder },
      // Seeded from the storefront's own stats block: five entries in the
      // fixture, five products on the shelf.
      $wishlist: isDemoPatron ? shop.products.filter((p) => p.featured).slice(0, 5).map((p) => p.slug) : [],
    })
  }

  // ------------------------------------------------------------------- users

  const users = [
    ...customers.map((customer) => ({
      email: customer.email,
      name: customer.name,
      role: 'shopper',
      $customer: customer.legacyId,
    })),
    ...STAFF.map((member) => ({
      email: member.email,
      name: member.name,
      role: member.role,
      $customer: null,
    })),
  ]

  // ------------------------------------------------------------------ orders

  const orders = []
  for (const record of panel.orders) {
    const placedAt = asDate(record.placedAt)
    const customer = customers.find((entry) => entry.name === record.customer) ?? null

    const items = record.items.map((item) => {
      const product = productByName.get(normalizeName(item.name)) ?? null
      return {
        $product: product?.slug ?? null,
        name: item.name,
        // The resolved product's SKU, so the Orders screen and the Inventory
        // screen name the same thing. Falls back to the line's own.
        sku: product?.sku ?? item.sku,
        slug: product?.slug ?? '',
        volume: item.volume,
        qty: item.qty,
        unitPrice: item.price,
        lineTotal: item.qty * item.price,
        meta: '',
        note: '',
      }
    })

    if (!customer) notes.push(`order ${record.id} names customer "${record.customer}", who is not in the customer book.`)
    for (const [index, item] of record.items.entries()) {
      if (!items[index].$product) notes.push(`order ${record.id}: line "${item.name}" (${item.sku}) matches no fragrance.`)
    }

    const address = customer?.addresses?.find((entry) => entry.isDefault) ?? customer?.addresses?.[0] ?? null

    orders.push({
      number: record.id,
      $customer: customer?.legacyId ?? null,
      placedAt,
      channel: record.channel,
      status: record.status,
      payment: {
        status: record.payment,
        method: record.paymentMethod,
        txnRef: record.trackingId ? `TXN-${record.trackingId}` : '',
      },
      address: {
        name: customer?.name ?? record.customer,
        phone: customer?.phone ?? '',
        line1: address?.line1 ?? '',
        line2: address?.line2 ?? '',
        city: address?.city ?? record.city,
        state: address?.state ?? '',
        pincode: address?.pincode ?? '',
      },
      items,

      /**
       * The frozen price. Taken from the fixture's own arithmetic rather than
       * recomputed, so the seeded order book shows exactly the amounts the admin
       * already displays — and records the ₹2,999 rule that produced them.
       */
      pricing: {
        subtotal: record.subtotal,
        discount: 0,
        afterCoupon: record.subtotal,
        shipping: record.shipping,
        giftWrap: 0,
        gst: round((record.subtotal * 18) / 118),
        total: record.amount,
        savings: 0,
        loyaltyPoints: Math.floor(record.subtotal / 100),
        coupon: { code: null, type: null, value: null, minOrder: null, cap: null, amount: 0 },
        rule: SEEDED_RULE,
      },

      tracking: {
        courier: record.trackingId ? 'Bluedart Priority Air' : '',
        awb: record.trackingId ?? '',
        expectedDelivery: record.trackingId ? addDays(placedAt, 4) : null,
        transitNote: record.trackingId ? 'Temperature-guarded shock casket • 18°–22°C' : '',
        sealNote: record.trackingId ? 'Golden Wax Seal Intact' : '',
      },

      shipmentEvents: shipmentEvents(record.status, placedAt),
      inclusions: [],

      notes: '',
      /**
       * False, always. These are history: the shelf counts in the fixtures
       * already reflect them, so marking them applied would let a cancellation
       * credit stock that was never deducted here.
       */
      stockApplied: false,
      legacyId: record.id,
    })
  }

  // ------------------------------------------------------------ stock ledger

  const ledger = panel.ledger.map((row) => {
    const product = productByName.get(normalizeName(row.name)) ?? null
    const reason = LEDGER_REASONS[row.reason] ?? 'Manual adjustment'
    if (!product) notes.push(`ledger row ${row.id} names "${row.name}", which matches no fragrance.`)
    if (reason !== row.reason) {
      notes.push(`ledger row ${row.id}: reason "${row.reason}" filed as "${reason}" with the original in reasonNote.`)
    }

    return {
      $product: product?.slug ?? null,
      $actor: LEDGER_AUTHORS[row.by] ?? null,
      previous: row.previous,
      change: row.change,
      next: row.next,
      reason,
      reasonNote: reason === row.reason ? '' : row.reason,
      batch: row.batch ?? '',
      $order: null,
      at: asDate(row.at),
      idempotencyKey: `seed:${row.id}`,
    }
  })

  // ---------------------------------------------------------------- reviews

  const reviews = []
  for (const [slug, list] of Object.entries(shop.reviews)) {
    const product = products.find((entry) => entry.slug === slug) ?? null
    if (!product) {
      notes.push(`reviews for "${slug}" have no fragrance to attach to — skipped.`)
      continue
    }
    for (const review of list) {
      reviews.push({
        $product: slug,
        $customer: null,
        name: review.name,
        city: review.city,
        rating: review.rating,
        title: review.title,
        body: review.body,
        date: asDate(review.date),
        verified: Boolean(review.verified),
        helpful: review.helpful ?? 0,
        // The fixture's `photos` is a *number* with no files behind it. Real
        // media goes in `photos`; the count is what the storefront renders.
        photos: [],
        photoCount: review.photos ?? 0,
        status: 'Published',
        legacyId: review.id,
      })
    }
  }

  const reviewSlugs = new Set(Object.keys(shop.reviews))
  for (const product of products) {
    if (!reviewSlugs.has(product.slug) && product.ratingBaseline.count > 0) {
      notes.push(`product "${product.name}" reports ${product.ratingBaseline.count} reviews with none authored — baseline only.`)
    }
  }

  // ---------------------------------------------------------------- coupons

  const coupons = shop.coupons.map((coupon) => {
    const rule = COUPON_RULES[coupon.code]
    if (!rule) {
      throw new Error(
        `Coupon ${coupon.code} has no entry in COUPON_RULES (scripts/documents.mjs).\n` +
          `Its discount is a function and cannot be stored — read the pct()/flat() call in ` +
          `frontend/src/data/offers.js and add the translation.`,
      )
    }
    return {
      code: coupon.code,
      label: coupon.label,
      headline: coupon.headline,
      description: coupon.description,
      terms: coupon.terms,
      type: rule.type,
      value: rule.value,
      minOrder: rule.minOrder,
      cap: rule.cap,
      scope: { tiers: [], excludeTiers: [], categories: [], ...(rule.scope ?? {}) },
      active: true,
      startsAt: null,
      endsAt: null,
      usageLimit: null,
      usedCount: 0,
      legacyId: coupon.code,
    }
  })

  const couponCodes = new Set(shop.coupons.map((coupon) => coupon.code))
  for (const code of Object.keys(COUPON_RULES)) {
    if (!couponCodes.has(code)) notes.push(`COUPON_RULES has ${code}, which is no longer in the fixture.`)
  }

  // ---------------------------------------------------------------- activity

  const activity = panel.activity.map((entry) => ({
    at: asDate(entry.at),
    actor: entry.actor,
    $actorUser: null,
    tone: entry.tone,
    text: entry.text,
    target: entry.target ?? '',
  }))

  // ---------------------------------------------------------------- settings

  const settings = [
    {
      key: 'pricing',
      label: 'Delivery, gift wrap and tax',
      /**
       * ₹999, not the admin's ₹2,999. The storefront's cart implements ₹999 and
       * `OFFER_TERMS.dispatch` publishes it to shoppers — "complimentary on
       * orders above ₹999". The admin's figure is the outlier, and a threshold
       * a shopper is charged against cannot be the one that loses.
       */
      value: { shippingFee: 79, freeShippingOver: 999, giftWrapFee: 149, gstRate: 18, currency: 'INR' },
    },
    {
      key: 'store',
      label: 'Store identity and contact',
      value: {
        name: 'Rehman Perfume House',
        legalName: 'Rehman Perfume House',
        tagline: shop.content.tagline,
        email: 'atelier@rehmanperfume.in',
        phone: '+91 98201 12345',
        address: '',
        city: '',
        currency: 'INR',
        instagram: '@rehmanperfume',
        hours: 'Monday to Saturday, 10:00–19:00 IST',
      },
    },
    {
      key: 'content',
      label: 'Editorial blocks',
      value: {
        announcements: shop.content.announcements,
        pillars: shop.content.pillars,
        shippingMethods: shop.content.shippingMethods,
        homeFaq: shop.content.homeFaq,
        newsletter: shop.content.newsletter,
        houseBlurb: shop.content.houseBlurb,
        copyright: shop.content.copyright,
        socialLinks: shop.content.socialLinks,
        offerHero: shop.offerHero,
        offerTerms: shop.offerTerms,
        vaultSlugs: shop.vaultSlugs,
        brandStrip: shop.brandStrip,
      },
    },
  ]

  // ---------------------------------------------------------------- counters

  /**
   * Counters are raised past every number the fixtures already used, never set.
   * `Counter.raiseTo` uses `$max`, so re-running the seed cannot rewind a
   * sequence and hand out an order number that is already on an order.
   */
  const counters = { order: highestOrderNumber(panel.orders, shop.tracking, shop.orders), sku: {} }
  for (const product of products) {
    const match = /^RP-([A-Z]+)-(\d+)$/.exec(product.sku ?? '')
    if (!match) continue
    const [, code, sequence] = match
    counters.sku[code] = Math.max(counters.sku[code] ?? 0, Number(sequence))
  }

  return {
    documents: {
      settings,
      brands,
      categories,
      products,
      customers,
      users,
      orders,
      ledger,
      reviews,
      coupons,
      activity,
      counters,
    },
    counters,
    notes,
  }
}

// ------------------------------------------------------------------- helpers

/**
 * Merge a customer's two address lists.
 *
 * The storefront's copy is the richer one — it has a name, a phone and a type —
 * while the admin's has the `isDefault` flag and the tags the drawer shows. They
 * describe the same two addresses for `cust-1042`, so they are paired on the
 * normalised tag and the storefront fills the gaps.
 */
function mergeAddresses(record, shopAddresses) {
  const shopByTag = new Map(shopAddresses.map((address) => [normalizeName(address.tag), address]))

  const merged = record.addresses.map((address) => {
    const shopAddress = shopByTag.get(normalizeName(address.tag)) ?? null
    if (shopAddress) shopByTag.delete(normalizeName(address.tag))
    return {
      tag: address.tag,
      name: shopAddress?.name ?? record.name,
      phone: shopAddress?.phone ?? record.phone,
      line1: shopAddress?.line1 ?? address.line1,
      line2: shopAddress?.line2 ?? address.line2 ?? '',
      city: address.city,
      state: address.state ?? '',
      pincode: address.pincode ?? '',
      type: shopAddress?.type ?? (/office|work/i.test(address.tag) ? 'Office' : 'Home'),
      isDefault: Boolean(address.isDefault),
      legacyId: shopAddress?.id ?? null,
    }
  })

  // An address the admin book has never heard of — the storefront's Goa villa.
  for (const shopAddress of shopByTag.values()) {
    merged.push({
      tag: shopAddress.tag,
      name: shopAddress.name,
      phone: shopAddress.phone,
      line1: shopAddress.line1,
      line2: shopAddress.line2 ?? '',
      city: shopAddress.city,
      state: shopAddress.state ?? '',
      pincode: shopAddress.pincode ?? '',
      type: shopAddress.type ?? 'Home',
      isDefault: Boolean(shopAddress.isDefault),
      legacyId: shopAddress.id,
    })
  }

  for (const address of merged) {
    if (!address.name) address.name = record.name
  }
  if (merged.length && !merged.some((address) => address.isDefault)) merged[0].isDefault = true
  return merged
}

/**
 * The custody journey an order of this status has behind it.
 *
 * The five stages are `TIMELINE_STAGES` in `src/models/Order.js`, and the
 * storefront renders them with the stage matching the status marked current. A
 * seeded order therefore needs the stages it has passed through, not all five.
 */
function shipmentEvents(status, placedAt) {
  const stages = {
    Pending: [['Confirmed', 'Payment verified & order confirmed.']],
    Packed: [
      ['Confirmed', 'Payment verified & order confirmed.'],
      ['Hand-Poured', 'Packed, checked and sealed in gift box.'],
    ],
    Shipped: [
      ['Confirmed', 'Payment verified & order confirmed.'],
      ['Hand-Poured', 'Packed, checked and sealed in gift box.'],
      ['In Transit', 'Sent from Mumbai via Bluedart Priority Air Hub.'],
    ],
    Delivered: [
      ['Confirmed', 'Payment verified & order confirmed.'],
      ['Hand-Poured', 'Packed, checked and sealed in gift box.'],
      ['In Transit', 'Sent from Mumbai via Bluedart Priority Air Hub.'],
      ['Out for Delivery', 'Courier out with safe heat-protected pouch.'],
      ['Handover', 'Delivered at doorstep with tamper-safe seal.'],
    ],
    Cancelled: [
      ['Confirmed', 'Payment verified & order confirmed.'],
      ['Cancelled', 'Order cancelled and stock returned to shop inventory.'],
    ],
  }

  return (stages[status] ?? stages.Pending).map(([title, description], index) => ({
    title,
    description,
    at: new Date((placedAt ?? new Date()).getTime() + index * 14 * HOUR),
  }))
}

/**
 * The highest order number either app has already used.
 *
 * Both matter: the admin's book runs to `RP2041`, and the storefront's account
 * page shows `RP1024`, `RP1018`, `RP1002` and `RP0987` as the patron's history.
 */
function highestOrderNumber(panelOrders, tracking, shopOrders) {
  const numbers = [
    ...panelOrders.map((order) => order.id),
    tracking?.orderId,
    ...shopOrders.map((order) => order.id),
  ]
  return numbers.reduce((max, number) => {
    const match = /^RP(\d+)$/.exec(String(number ?? ''))
    return match ? Math.max(max, Number(match[1])) : max
  }, 1000)
}

/** A stable snapshot of the built documents, for `seed/*.json`. */
export function plainDocuments(documents) {
  return JSON.parse(
    JSON.stringify(documents, (key, value) => {
      if (key.startsWith('$')) return undefined
      if (value instanceof Date) return value.toISOString()
      return value
    }),
  )
}

export default buildDocuments
