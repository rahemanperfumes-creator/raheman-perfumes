#!/usr/bin/env node
/**
 * Seed the database from the two frontends' fixtures.
 *
 *     npm run seed           upsert everything, leaving anything else alone
 *     npm run seed:fresh     drop the database first
 *
 * **Idempotent by construction.** Every collection has a natural key — a slug,
 * an email, an order number, a legacy fixture id — and each row is written with
 * `replaceOne({key}, doc, {upsert: true})`. Running it twice leaves the database
 * byte-identical rather than doubling the catalogue, and because `replaceOne`
 * keeps the existing `_id`, every reference into a re-seeded row still resolves.
 *
 * This is a **one-time migration**, not a sync. After it runs the backend is the
 * source of truth, and edits made through the admin panel are not undone by
 * running it again — but they *are* overwritten for any row the fixtures also
 * describe. That is the intended reading of "seed": put the fixtures in, and
 * from then on the fixtures are history.
 */

import config from '../src/config/env.js'
import { connect, disconnect } from '../src/config/db.js'
import * as models from '../src/models/index.js'
import { hashPassword } from '../src/services/auth.js'
import { buildDocuments, DEVELOPMENT_PASSWORD, STAFF } from './documents.mjs'

const fresh = process.argv.includes('--fresh')

const { Activity, Brand, Category, Coupon, Counter, Customer, Order, Product, Review, Setting, StockLedger, User } = models

// ------------------------------------------------------------------- plumbing

/** Drop every `$`-prefixed link field. See the note in `documents.mjs`. */
function withoutLinks(document, nested = []) {
  const out = {}
  for (const [key, value] of Object.entries(document)) {
    if (key.startsWith('$')) continue
    out[key] = nested.includes(key) ? value.map((entry) => withoutLinks(entry)) : value
  }
  return out
}

/**
 * Write a batch of documents, keyed on one field.
 *
 * `replaceOne` rather than `updateOne({$set})` so a field removed from a fixture
 * is removed from the row too — a seed that only ever adds is how a database
 * ends up with columns nothing writes any more.
 */
async function writeAll(Model, key, documents, { label = Model.modelName, transform = (doc) => doc } = {}) {
  for (const document of documents) {
    const doc = transform(document)
    const value = doc[key]
    if (value === undefined || value === null) {
      throw new Error(`${label}: a document has no "${key}" to key on.`)
    }
    await Model.replaceOne({ [key]: value }, doc, { upsert: true })
  }
  return documents.length
}

/** Every row of a collection as `{field → _id}`. */
async function idMap(Model, field) {
  const rows = await Model.find({}, `_id ${field}`).lean()
  return new Map(rows.map((row) => [String(row[field]), row._id]))
}

/** Resolve a link, or fail naming what could not be found. */
function must(map, key, what) {
  if (key == null) return null
  const value = map.get(String(key))
  if (!value) throw new Error(`Cannot resolve ${what} "${key}" — nothing in the collection has that value.`)
  return value
}

// ----------------------------------------------------------------------- run

async function main() {
  if (!config.mongoUri) {
    console.error(
      '\nMONGODB_URI is not set.\n\n' +
        '  Copy .env.example to .env and paste your connection string in.\n' +
        '  Placeholders are fine for everything except the seed — it needs a real cluster,\n' +
        '  or `npm run smoke`, which brings its own in-memory one and needs no .env at all.\n',
    )
    process.exit(1)
  }

  await connect()
  console.log(`\n  Seeding ${config.mongoUri.replace(/\/\/[^@]*@/, '//***@')}`)

  if (fresh) {
    await Counter.db.dropDatabase()
    console.log('  --fresh: dropped the database.')
  }

  /*
   * Retire the old staff roles before anything else touches the `users` rows.
   *
   * `manager`, `atelier` and `viewer` no longer exist in `ROLES`, so a re-seed
   * on an already-seeded database has to fold those accounts away: their ledger
   * entries are re-attributed to the owner, their activity mentions are
   * detached, and the accounts themselves go. Idempotent — a no-op on a fresh
   * or already-migrated database.
   */
  if (!fresh) {
    const owner = await User.findOne({ role: 'owner' }).sort({ createdAt: 1 }).select('_id')
    const retired = await User.find({ role: { $in: ['manager', 'atelier', 'viewer'] } }).select('_id').lean()
    if (retired.length) {
      const ids = retired.map((row) => row._id)
      const [ledger, activity] = await Promise.all([
        StockLedger.updateMany({ actor: { $in: ids } }, { $set: { actor: owner?._id ?? null } }),
        Activity.updateMany({ actorUser: { $in: ids } }, { $set: { actorUser: null } }),
      ])
      await User.deleteMany({ _id: { $in: ids } })
      console.log(
        `  Retired ${retired.length} staff account(s) with obsolete roles — ledger re-attributed (${ledger.modified}), activity detached (${activity.modified}).`,
      )
    }
  }

  const { documents, counters, notes } = await buildDocuments()

  /**
   * Order matters and is not arbitrary: a product cannot be written before the
   * brand and shelf it points at exist, and an order cannot be written before
   * both its patron and its fragrances do.
   */

  // 1. Settings — read by the order path, so they go in before any order does.
  await writeAll(Setting, 'key', documents.settings)

  // 2. Brands and categories — the two things a product references.
  await writeAll(Brand, 'slug', documents.brands)
  const brandId = await idMap(Brand, 'slug')

  await writeAll(Category, 'legacyId', documents.categories)
  const shelfId = new Map(
    (await Category.find({ kind: 'shelf' }, '_id slug').lean()).map((row) => [String(row.slug), row._id]),
  )

  // 3. Products.
  await writeAll(Product, 'slug', documents.products, {
    transform: (product) => ({
      ...withoutLinks(product),
      brand: must(brandId, product.$brand, 'brand'),
      category: must(shelfId, product.$category, 'shelf'),
    }),
  })
  const productId = await idMap(Product, 'slug')

  // 4. Customers, then the credentials that speak for them.
  await writeAll(Customer, 'email', documents.customers, {
    transform: (customer) => ({
      ...withoutLinks(customer),
      wishlist: (customer.$wishlist ?? []).map((slug) => must(productId, slug, 'wishlist product')),
    }),
  })
  const customerId = await idMap(Customer, 'legacyId')

  const passwordHash = await hashPassword(DEVELOPMENT_PASSWORD)
  await writeAll(User, 'email', documents.users, {
    transform: (user) => ({
      ...withoutLinks(user),
      passwordHash,
      customer: user.$customer ? must(customerId, user.$customer, 'customer') : null,
    }),
  })
  const userId = await idMap(User, 'email')

  // 5. Orders. The lines reference products; the header references a patron.
  await writeAll(Order, 'number', documents.orders, {
    transform: (order) => ({
      ...withoutLinks(order, ['items']),
      customer: order.$customer ? must(customerId, order.$customer, 'order customer') : null,
      items: order.items.map((item) => ({
        ...withoutLinks(item),
        product: item.$product ? must(productId, item.$product, 'order line product') : null,
      })),
    }),
  })

  // 6. Everything that hangs off an order, a product or a patron.
  await writeAll(StockLedger, 'idempotencyKey', documents.ledger, {
    transform: (row) => ({
      ...withoutLinks(row),
      product: must(productId, row.$product, 'ledger product'),
      actor: row.$actor ? must(userId, row.$actor, 'ledger authoriser') : null,
      order: null,
    }),
  })

  await writeAll(Review, 'legacyId', documents.reviews, {
    transform: (review) => ({
      ...withoutLinks(review),
      product: must(productId, review.$product, 'review product'),
      customer: review.$customer ? must(customerId, review.$customer, 'review customer') : null,
    }),
  })

  // 7. The standalone collections.
  await writeAll(Coupon, 'code', documents.coupons)

  /**
   * Activity has no natural key — two identical sentences at two moments are two
   * events. The seeded entries are removed by their text and re-inserted, and
   * anything the panel has logged since is left alone.
   */
  const seededActivity = documents.activity.map((entry) => withoutLinks(entry))
  await Activity.deleteMany({ text: { $in: seededActivity.map((entry) => entry.text) } })
  if (seededActivity.length) await Activity.insertMany(seededActivity)

  // 8. Counters last, and only ever upwards.
  await Counter.raiseTo('order', counters.order)
  for (const [code, sequence] of Object.entries(counters.sku)) {
    await Counter.raiseTo(`sku:${code}`, sequence)
  }

  // ------------------------------------------------------------------ report

  const counts = await Promise.all(
    [
      ['brands', Brand],
      ['categories', Category],
      ['products', Product],
      ['customers', Customer],
      ['users', User],
      ['orders', Order],
      ['stock ledger', StockLedger],
      ['reviews', Review],
      ['coupons', Coupon],
      ['activity', Activity],
      ['settings', Setting],
    ].map(async ([label, Model]) => [label, await Model.countDocuments()]),
  )

  console.log('\n  Seeded:')
  for (const [label, count] of counts) console.log(`    ${String(count).padStart(5)}  ${label}`)
  console.log(`    ${String(counters.order).padStart(5)}  next order number is RP${counters.order + 1}`)
  for (const [code, sequence] of Object.entries(counters.sku)) {
    // `Counter.next` steps by one; the fixtures happen to step by seven, which
    // is why the raised counter sits past every issued number rather than on it.
    console.log(`    ${String(sequence).padStart(5)}  next ${code} SKU is RP-${code}-${sequence + 1}`)
  }

  if (notes.length) {
    console.log(`\n  Reconciliation (${notes.length}):`)
    for (const note of notes) console.log(`    • ${note}`)
  }

  console.log('\n  Sign in with:')
  console.log(`    password for every seeded account   ${DEVELOPMENT_PASSWORD}`)
  console.log(`    shopper                             rahul.sharma@example.com`)
  for (const member of STAFF) console.log(`    ${member.role.padEnd(35 - member.role.length)} ${member.email}`)
  console.log('')

  await disconnect()
}

main().catch(async (error) => {
  console.error(`\n[seed] ${error.message}\n`)
  if (error.stack) console.error(error.stack.split('\n').slice(1, 4).join('\n'))
  await disconnect().catch(() => {})
  process.exit(1)
})
