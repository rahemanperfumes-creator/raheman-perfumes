import { cache } from '../lib/cache.js'

/**
 * Enterprise Idempotency Middleware (RFC compliant)
 *
 * Ensures that critical mutation requests (order placement, payments, checkout actions)
 * cannot be executed multiple times if a network drops or a customer double-taps.
 *
 * Clients send:
 *   `Idempotency-Key: <unique-uuid-or-client-token>`
 *
 * Scenarios:
 *   1. New Key: Process request, cache the resulting status and body.
 *   2. In-Flight Key: Return 409 Conflict ("Request currently in-flight").
 *   3. Completed Key: Return previous cached response with header `X-Cache: HIT-IDEMPOTENT`.
 */

export function idempotency({ ttl = 120 } = {}) {
  return async (req, res, next) => {
    // Only applies to mutating methods
    if (!['POST', 'PUT', 'PATCH'].includes(req.method)) return next()

    const rawKey = req.headers['idempotency-key'] || req.headers['x-idempotency-key']
    if (!rawKey) return next()

    const actor = req.ip || 'anon'
    const route = req.originalUrl?.split('?')[0] || `${req.baseUrl || ''}${req.path}`
    const key = `idempotency:${actor}:${req.method}:${route}:${String(rawKey).trim()}`
    const cached = cache.get(key)

    if (cached) {
      if (cached.status === 'PROCESSING') {
        res.setHeader('Retry-After', '2')
        return res.status(409).json({
          message: 'A request with this idempotency key is currently being processed. Please do not submit duplicate requests.',
        })
      }

      // Replay identical response
      res.setHeader('X-Cache', 'HIT-IDEMPOTENT')
      res.setHeader('X-Idempotency-Key', rawKey)
      return res.status(cached.statusCode).json(cached.body)
    }

    // Mark as in-flight
    cache.set(key, { status: 'PROCESSING' }, 30)

    // Release lock if client aborts or response ends without JSON (e.g. non-JSON failure)
    let settled = false
    res.on('close', () => {
      if (!settled) cache.del(key)
    })

    // Intercept response to store result
    const originalJson = res.json.bind(res)
    res.json = (body) => {
      settled = true
      if (res.statusCode >= 500) {
        // Never poison the idempotency cache with a transient 5xx failure
        cache.del(key)
      } else {
        cache.set(
          key,
          {
            status: 'COMPLETED',
            statusCode: res.statusCode,
            body,
            savedAt: new Date().toISOString(),
          },
          ttl,
        )
      }

      res.setHeader('X-Idempotency-Key', rawKey)
      return originalJson(body)
    }

    next()
  }
}

export default idempotency

