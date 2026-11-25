import mongoose from 'mongoose'
import config from './env.js'

/**
 * The Mongo connection.
 *
 * Connected lazily and awaited by `server.js` before the first request, so no
 * route ever runs against a half-open connection. `mongoose.set('strictQuery',
 * true)` keeps an unknown filter key a query-time error instead of a silent
 * match-everything, which is the failure mode worth avoiding in an admin API.
 */

mongoose.set('strictQuery', true)

/** Resolve once connected; rejects with a readable message on failure. */
export async function connect(uri = config.mongoUri, { quiet = false } = {}) {
  if (!uri) throw new Error('No MongoDB URI to connect to.')

  const log = (...args) => {
    if (!quiet) console.log(...args)
  }

  mongoose.connection.on('disconnected', () => log('[db] disconnected'))
  mongoose.connection.on('reconnected', () => log('[db] reconnected'))

  try {
    await mongoose.connect(uri, {
      // Fail fast on unreachable cluster rather than hanging
      serverSelectionTimeoutMS: 5000,
      // High-concurrency connection pooling:
      // minPoolSize maintains warm sockets to eliminate cold-start handshake latency.
      // maxPoolSize allows up to 100 concurrent DB queries per process without queueing.
      minPoolSize: 10,
      maxPoolSize: 100,
      socketTimeoutMS: 45000,
      family: 4, // IPv4 preference for faster DNS resolution
    })
  } catch (error) {
    const hint = /ENOTFOUND|querySrv|ETIMEDOUT|server selection/i.test(error.message)
      ? '\n  The cluster is unreachable. Check MONGODB_URI, and that this machine\'s IP is allowed in Atlas → Network Access.'
      : ''
    throw new Error(`Could not connect to MongoDB: ${error.message}${hint}`)
  }

  const { name, host } = mongoose.connection
  log(`[db] connected to ${host}/${name}`)
  return mongoose.connection
}

export async function disconnect() {
  await mongoose.connection.close()
}

export default { connect, disconnect, connection: mongoose.connection }
