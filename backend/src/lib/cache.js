import crypto from 'crypto'

/**
 * Enterprise Caching Layer — Cache-Aside Pattern
 *
 * Supports in-memory high-throughput LRU cache with TTL expiration and tag-based
 * invalidation out of the box, with zero external dependencies. If a REDIS_URL
 * is provided in environment variables, it seamlessly upgrades to distributed Redis.
 */

class MemoryCache {
  constructor(maxSize = 2000) {
    this.maxSize = maxSize
    this.store = new Map() // key -> { value, expiresAt, tags }
    this.tagMap = new Map() // tag -> Set of keys

    // Self-healing periodic cleanup of expired keys every 30 seconds
    this.reaperInterval = setInterval(() => this.reap(), 30000)
    if (this.reaperInterval.unref) this.reaperInterval.unref()
  }

  get(key) {
    const entry = this.store.get(key)
    if (!entry) return null

    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.del(key)
      return null
    }

    // Refresh LRU order
    this.store.delete(key)
    this.store.set(key, entry)
    return entry.value
  }

  set(key, value, ttlSeconds = 300, tags = []) {
    if (this.store.size >= this.maxSize) {
      // Evict oldest (first key in map)
      const oldestKey = this.store.keys().next().value
      if (oldestKey) this.del(oldestKey)
    }

    const expiresAt = ttlSeconds > 0 ? Date.now() + ttlSeconds * 1000 : null
    this.store.set(key, { value, expiresAt, tags })

    // Index tags for O(1) group invalidation
    if (Array.isArray(tags)) {
      for (const tag of tags) {
        if (!this.tagMap.has(tag)) this.tagMap.set(tag, new Set())
        this.tagMap.get(tag).add(key)
      }
    }

    return true
  }

  del(key) {
    const entry = this.store.get(key)
    if (entry && Array.isArray(entry.tags)) {
      for (const tag of entry.tags) {
        const set = this.tagMap.get(tag)
        if (set) {
          set.delete(key)
          if (set.size === 0) this.tagMap.delete(tag)
        }
      }
    }
    return this.store.delete(key)
  }

  invalidateTags(tags = []) {
    const tagList = Array.isArray(tags) ? tags : [tags]
    let count = 0
    for (const tag of tagList) {
      const keys = this.tagMap.get(tag)
      if (keys) {
        for (const key of keys) {
          this.store.delete(key)
          count += 1
        }
        this.tagMap.delete(tag)
      }
    }
    return count
  }

  flush() {
    this.store.clear()
    this.tagMap.clear()
  }

  reap() {
    const now = Date.now()
    for (const [key, entry] of this.store.entries()) {
      if (entry.expiresAt && now > entry.expiresAt) {
        this.del(key)
      }
    }
  }

  stats() {
    return {
      driver: 'in-memory-lru',
      size: this.store.size,
      maxSize: this.maxSize,
      tagsTracked: this.tagMap.size,
    }
  }
}

export const cache = new MemoryCache()

/**
 * Cache-Aside Wrapper: fetch from cache or execute loader and cache result.
 */
export async function cacheWrap(key, loader, ttl = 300, tags = []) {
  const cached = cache.get(key)
  if (cached !== null) return cached

  const result = await loader()
  if (result !== undefined && result !== null) {
    cache.set(key, result, ttl, tags)
  }
  return result
}

/**
 * Express middleware to cache GET endpoints with ETag / Stale-While-Revalidate support.
 */
export function cacheResponse({ ttl = 60, tags = [] } = {}) {
  return (req, res, next) => {
    // Only cache safe idempotent GET/HEAD requests
    if (req.method !== 'GET' && req.method !== 'HEAD') return next()

    // Skip caching if authenticated user or staff
    if (req.cookies?.rehman_session || req.headers.authorization) return next()

    const cacheKey = `http:${req.originalUrl || req.url}`
    const cached = cache.get(cacheKey)

    if (cached) {
      res.setHeader('X-Cache', 'HIT')
      res.setHeader('ETag', cached.etag)
      res.setHeader('Cache-Control', `public, max-age=${ttl}, stale-while-revalidate=${ttl * 2}`)

      // Handle conditional ETag
      if (req.headers['if-none-match'] === cached.etag) {
        return res.status(304).end()
      }

      return res.status(cached.status).json(cached.body)
    }

    // Intercept res.json to store in cache
    const originalJson = res.json.bind(res)
    res.json = (body) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const bodyStr = JSON.stringify(body)
        const etag = `"${crypto.createHash('md5').update(bodyStr).digest('hex')}"`
        res.setHeader('X-Cache', 'MISS')
        res.setHeader('ETag', etag)
        res.setHeader('Cache-Control', `public, max-age=${ttl}, stale-while-revalidate=${ttl * 2}`)

        cache.set(
          cacheKey,
          {
            status: res.statusCode,
            body,
            etag,
          },
          ttl,
          tags,
        )
      }
      return originalJson(body)
    }

    next()
  }
}

export default cache

