import { createApp } from './app.js'
import config, { assertConfig } from './config/env.js'
import { connect, disconnect } from './config/db.js'
import { activeDriver, isAvailable, unavailableReason } from './lib/storage.js'
import { queue } from './lib/queue.js'
import { dispatchPendingEvents } from './services/outbox.js'
import { archivalService } from './services/archival.js'
import { startKeepAlive, stopKeepAlive } from './services/keepalive.js'

/**
 * The entry point for Rehman Perfume API server.
 *
 * Order matters and is deliberate: **validate the environment first**, then
 * connect, then listen. A missing `MONGODB_URI` should be one sentence naming the
 * variable, not a Mongoose stack trace ten seconds into boot — and a server that
 * is listening but has no database is worse than one that refused to start,
 * because the first request is what discovers the problem.
 */

assertConfig()

try {
  await connect()
} catch (error) {
  console.error(`\n${error.message}\n`)
  process.exit(1)
}

const app = createApp()
const server = app.listen(config.port, () => {
  console.log(`\n  Rehman Perfume API — ${config.nodeEnv}`)
  console.log(`  http://localhost:${config.port}/api/health`)
  console.log(`  CORS: ${config.corsOrigins.join(', ')}`)
  /**
   * Where a photograph will actually land, named by the driver that will take it.
   *
   * This line used to read "Cloudinary not configured — uploads will answer 503",
   * which stopped being true the moment uploads gained a local fallback, and it
   * contradicted the `[config]` line printed directly above it. Read together,
   * the two said uploads were both fine and broken, and an operator would have
   * believed the one that sounded like a failure.
   */
  const driver = activeDriver()
  console.log(
    `  Uploads: ${driver}${driver === 'local' ? ` — ${config.uploadsDir}, served from /api/uploads` : ''}`,
  )
  if (!isAvailable()) console.log(`  Uploads unavailable: ${unavailableReason()}`)
  console.log('')

  // 1. Periodic Transactional Outbox Event Dispatcher (every 10s)
  const outboxInterval = setInterval(() => {
    dispatchPendingEvents().catch(() => {})
  }, 10000)
  if (outboxInterval.unref) outboxInterval.unref()

  // 2. Periodic Cold Data Hygiene & Token Archival (daily)
  const maintenanceInterval = setInterval(() => {
    archivalService.runMaintenance().catch(() => {})
  }, 24 * 60 * 60 * 1000)
  if (maintenanceInterval.unref) maintenanceInterval.unref()

  // 3. Keep-Alive self-ping (Render & cloud hosting)
  startKeepAlive()
})

/**
 * Shut down without dropping work.
 *
 * `server.close()` stops accepting new connections and waits for the open ones to
 * finish; only then is the database closed. Closing the database first would
 * abort in-flight requests that had already read their data and were about to
 * write — an order that priced correctly and then failed on save.
 *
 * A second signal exits immediately, because a process that will not die is worse
 * than one that exits mid-request.
 */
let shuttingDown = false
async function shutdown(signal) {
  if (shuttingDown) {
    console.warn(`\n[server] Forced exit on ${signal}.`)
    process.exit(1)
  }
  shuttingDown = true
  console.log(`\n[server] ${signal} received — finishing open requests…`)

  server.close(async () => {
    try {
      stopKeepAlive()
      console.log('[server] Draining background queue workers...')
      await queue.drain(3000)
    } catch {}
    await disconnect()
    console.log('[server] closed cleanly.')
    process.exit(0)
  })

  // Don't hang for ever on a connection that never completes.
  setTimeout(() => {
    console.warn('[server] Timed out waiting for open connections — exiting anyway.')
    process.exit(1)
  }, 10000).unref()
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))

process.on('unhandledRejection', (reason) => {
  console.error('[server] Unhandled rejection:', reason)
})
process.on('uncaughtException', (error) => {
  console.error('[server] Uncaught exception:', error)
  process.exit(1)
})

export default server
