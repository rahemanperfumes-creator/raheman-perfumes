#!/usr/bin/env node
/**
 * Backfill product barcodes: `npm run backfill:barcodes`.
 *
 * Every product needs a barcode, and every product created *before* the field
 * existed has none. The seed will fill them on a re-seed (`npm run seed`), but
 * that also rewrites any fixture-owned row — which is not something to make a
 * live shop do just to add a column. This fills the gap and touches nothing else.
 *
 * **Idempotent and additive.** It only ever writes `barcode` on rows where the
 * field is missing, so running it twice is a no-op and no SKU, price or stock
 * figure is read from the fixtures. Uses `updateOne` rather than `replaceOne`
 * for the same reason: a `$set` of one field cannot quietly revert anything
 * staff have changed through the panel.
 *
 *     node scripts/backfill-barcodes.mjs            fill what is missing
 *     node scripts/backfill-barcodes.mjs --dry-run  report, write nothing
 */

import config from '../src/config/env.js'
import { connect, disconnect } from '../src/config/db.js'
import Product, { barcodeOf } from '../src/models/Product.js'

const dryRun = process.argv.includes('--dry-run')

async function main() {
  if (!config.mongoUri) {
    console.error('MONGO_URI is not set — see .env.example.')
    process.exit(1)
  }

  await connect()

  const total = await Product.countDocuments()
  // `{ barcode: null }` matches both a missing field and an explicit null.
  const missing = await Product.find({ barcode: null }).select('sku name barcode').lean()

  console.log(`${total} products, ${missing.length} without a barcode.`)
  if (!missing.length) {
    console.log('Nothing to do.')
    await disconnect()
    return
  }

  let written = 0
  const failed = []

  for (const product of missing) {
    let value
    try {
      value = barcodeOf(product.sku)
    } catch (error) {
      // A SKU that cannot be encoded is reported rather than coerced into a
      // wrong label — the operator has to decide whether to correct the SKU.
      failed.push(`${product.sku} (${product.name}): ${error.message}`)
      continue
    }

    console.log(`  ${product.sku.padEnd(14)} → ${value}${dryRun ? ' (dry run)' : ''}`)
    if (dryRun) continue

    // `runValidators` is off deliberately: this sets one field and must not fail
    // because some *other* field on a legacy row is missing. The SKU validator
    // has already been applied by hand above, via `barcodeOf`.
    await Product.updateOne({ _id: product._id }, { $set: { barcode: value } })
    written += 1
  }

  if (failed.length) {
    console.error(`\n${failed.length} product${failed.length === 1 ? '' : 's'} could not be encoded:`)
    for (const line of failed) console.error(`  ${line}`)
  }

  console.log(
    dryRun
      ? `\nDry run — would have written ${missing.length - failed.length} barcode${missing.length - failed.length === 1 ? '' : 's'}.`
      : `\nWrote ${written} barcode${written === 1 ? '' : 's'}.`,
  )

  await disconnect()
  process.exit(failed.length ? 1 : 0)
}

main().catch(async (error) => {
  console.error(error)
  await disconnect().catch(() => {})
  process.exit(1)
})
