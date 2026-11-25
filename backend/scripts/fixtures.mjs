/**
 * The fixture loader.
 *
 * Both frontends ship a local seed — `frontend/src/data/*.js` and
 * `admin/src/data/*.js` — and the backend's job on day one is to hold exactly
 * what those files hold, so going live changes nothing a shopper or a staff
 * member can see. Rather than hand-copy 2,600 lines into `seed/*.json` (which
 * would drift the first time a fixture was edited), the seed reads the modules
 * themselves.
 *
 * **Why this can be a plain `import()`.** The original plan was to run these
 * through Vite's SSR pipeline, which is what `admin/scripts/smoke.mjs` does to
 * resolve the `@/` alias. Grepping every data module for imports showed that
 * only two of them import anything at all:
 *
 *     frontend/src/data/offers.js    →  formatPrice   from '@/lib/format'
 *     admin/src/data/products.js     →  slugify       from '@/lib/format'
 *
 * Both names exist in this package's own `src/lib/format.js`, mirrored from the
 * storefront. So the alias is rewritten to point at that file and the module is
 * imported directly — no Vite, no build step, no JSON intermediate. If a fixture
 * ever grows an import of a React component this loader will fail loudly with
 * the module name, which is the right outcome: at that point the SSR pipeline is
 * genuinely needed and guessing would be worse than stopping.
 *
 * The rewrite is done into a temp directory rather than over the source files,
 * because the two apps are read-only from here and a loader that edited its own
 * inputs would be a trap.
 */

import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))

/** The repository root — `backend/scripts/` is two levels down. */
export const REPO_ROOT = path.resolve(here, '..', '..')

/** Backend `src/` — what the `@/lib/format` alias is rewritten to. */
const SRC = path.resolve(here, '..', 'src')

/**
 * Every module the seed reads, keyed by the name `loadFixtures()` exposes it
 * under. Paths are relative to the repository root.
 */
export const SOURCES = {
  storefrontProducts: 'frontend/src/data/products.js',
  storefrontCategories: 'frontend/src/data/categories.js',
  storefrontBrands: 'frontend/src/data/brands.js',
  storefrontOffers: 'frontend/src/data/offers.js',
  storefrontReviews: 'frontend/src/data/reviews.js',
  storefrontAccount: 'frontend/src/data/account.js',
  storefrontContent: 'frontend/src/data/content.js',

  adminProducts: 'admin/src/data/products.js',
  adminCategories: 'admin/src/data/categories.js',
  adminBrands: 'admin/src/data/brands.js',
  adminCustomers: 'admin/src/data/customers.js',
  adminOrders: 'admin/src/data/orders.js',
  adminInventory: 'admin/src/data/inventory.js',
  adminActivity: 'admin/src/data/activity.js',
}

/** The aliases a fixture module may import from. */
const ALIASES = {
  '@/lib/format': path.join(SRC, 'lib', 'format.js'),
}

/**
 * Read a fixture module, rewrite its aliased imports, and import the result.
 *
 * The rewritten copy is keyed on the **full relative path** rather than the
 * basename, because `products.js` exists in both apps and a basename-keyed cache
 * would have the second one silently overwrite the first.
 */
async function loadModule(relative, cacheDir) {
  const source = path.join(REPO_ROOT, relative)
  if (!existsSync(source)) {
    throw new Error(`Fixture module not found: ${relative}\nExpected at ${source}`)
  }

  let text = await readFile(source, 'utf8')
  const unresolved = new Set()

  for (const [alias, target] of Object.entries(ALIASES)) {
    const pattern = new RegExp(`(['"])${alias.replace(/[/@]/g, '\\$&')}\\1`, 'g')
    text = text.replace(pattern, JSON.stringify(pathToFileURL(target).href))
  }

  // Anything still aliased would throw a bare "Cannot find package '@/…'" from
  // Node with no mention of which fixture caused it, so it is caught here.
  for (const match of text.matchAll(/from\s+['"](@\/[^'"]+)['"]/g)) unresolved.add(match[1])
  if (unresolved.size) {
    throw new Error(
      `${relative} imports ${[...unresolved].join(', ')}, which this loader cannot resolve.\n` +
        `Add it to ALIASES in scripts/fixtures.mjs, or run the fixture through Vite's SSR pipeline instead.`,
    )
  }

  const flat = relative.replace(/[\\/]/g, '__').replace(/\.js$/, '.mjs')
  const target = path.join(cacheDir, flat)
  await writeFile(target, text, 'utf8')
  return import(pathToFileURL(target).href)
}

/**
 * Load every fixture module.
 *
 * The returned object groups them by which app they came from, because the
 * reconciliation in `documents.mjs` is largely about deciding which app wins
 * each disagreement — keeping the two sides visibly separate here is what makes
 * that readable there.
 *
 * @returns {Promise<object>}
 */
export async function loadFixtures() {
  const cacheDir = await mkdtemp(path.join(tmpdir(), 'rehman-fixtures-'))

  const loaded = Object.fromEntries(
    await Promise.all(
      Object.entries(SOURCES).map(async ([key, relative]) => [key, await loadModule(relative, cacheDir)]),
    ),
  )

  const {
    storefrontProducts: sp,
    storefrontCategories: sc,
    storefrontBrands: sb,
    storefrontOffers: so,
    storefrontReviews: sr,
    storefrontAccount: sacc,
    storefrontContent: sct,
    adminProducts: ap,
    adminCategories: ac,
    adminBrands: ab,
    adminCustomers: acu,
    adminOrders: ao,
    adminInventory: ai,
    adminActivity: aact,
  } = loaded

  return {
    /** Where each module came from, so the snapshot can record its provenance. */
    sources: SOURCES,

    storefront: {
      products: sp.PRODUCTS,
      categories: sc.CATEGORIES,
      brands: sb.BRANDS,
      brandStrip: sb.BRAND_STRIP,
      coupons: so.COUPONS,
      offerHero: so.OFFER_HERO,
      offerTerms: so.OFFER_TERMS,
      vaultSlugs: so.VAULT_SLUGS,
      flashSaleMs: so.FLASH_SALE_ENDS_IN_MS,
      reviews: sr.REVIEWS,
      testimonials: sr.TESTIMONIALS,
      customer: sacc.DEMO_CUSTOMER,
      addresses: sacc.DEMO_ADDRESSES,
      paymentMethods: sacc.DEMO_PAYMENT_METHODS,
      tracking: sacc.DEMO_TRACKING,
      orders: sacc.DEMO_ORDERS,
      states: sacc.INDIAN_STATES,
      content: {
        announcements: sct.ANNOUNCEMENTS,
        footerColumns: sct.FOOTER_COLUMNS,
        socialLinks: sct.SOCIAL_LINKS,
        pillars: sct.PILLARS,
        shippingMethods: sct.SHIPPING_METHODS,
        homeFaq: sct.HOME_FAQ,
        newsletter: sct.NEWSLETTER,
        houseBlurb: sct.HOUSE_BLURB,
        tagline: sct.TAGLINE,
        copyright: sct.COPYRIGHT,
      },
    },

    admin: {
      products: ap.ADMIN_PRODUCTS,
      tierCostRatio: ap.TIER_COST_RATIO,
      tierCode: ap.TIER_CODE,
      productCategories: ap.PRODUCT_CATEGORIES,
      productStatuses: ap.PRODUCT_STATUSES,
      categories: ac.ADMIN_CATEGORIES,
      categoryStatuses: ac.CATEGORY_STATUSES,
      brands: ab.ADMIN_BRANDS,
      brandHouses: ab.BRAND_HOUSES,
      brandStatuses: ab.BRAND_STATUSES,
      customers: acu.ADMIN_CUSTOMERS,
      customerStatuses: acu.CUSTOMER_STATUSES,
      orders: ao.ADMIN_ORDERS,
      orderFlow: ao.ORDER_FLOW,
      paymentStatuses: ao.PAYMENT_STATUSES,
      ledger: ai.STOCK_LEDGER,
      adjustmentReasons: ai.ADJUSTMENT_REASONS,
      authorisers: ai.AUTHORISERS,
      activity: aact.ACTIVITY_SEED,
      activityIcon: aact.ACTIVITY_ICON,
    },
  }
}

export default loadFixtures
