import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import morgan from 'morgan'
import rateLimit from 'express-rate-limit'
import config from './config/env.js'
import routes from './routes/index.js'
import healthRoutes from './routes/health.js'
import correlation from './middleware/correlation.js'
import idempotency from './middleware/idempotency.js'
import { errorHandler, notFoundHandler } from './middleware/error.js'

/**
 * The same dev server, however the browser spells its host.
 *
 * `localhost`, `127.0.0.1` and `[::1]` all name this machine, and a browser is
 * free to pick any of them: Vite binds `::1`, so an admin panel opened at
 * `localhost:5174` can arrive with `Origin: http://[::1]:5174`, which matched
 * nothing in `CORS_ORIGINS` and was refused as a cross-origin request. That is a
 * genuinely confusing failure — the request comes from the allowed host and is
 * rejected anyway.
 *
 * Only the **host** is rewritten; the scheme and the port must still match an
 * entry exactly, so this widens nothing beyond loopback spellings of an origin
 * the operator already listed.
 */
const canonicalOrigin = (origin) => String(origin).replace(/^(\w+:\/\/)(\[::1\]|127\.0\.0\.1)/, '$1localhost')

/**
 * The Express app, assembled.
 *
 * `server.js` owns the listening socket and the database connection; this file
 * owns the middleware stack. Keeping them apart is what lets `scripts/smoke.mjs`
 * import the app directly, hand it a `mongodb-memory-server` URI, and drive it
 * over HTTP without a port being opened at import time.
 *
 * Two decisions worth stating:
 *
 *   • **`contentSecurityPolicy: false`.** Helmet's CSP is written for an app that
 *     serves its own HTML. This serves only JSON to two Vite dev servers, and the
 *     default policy would break nothing here while making the actual protection
 *     invisible. The headers that do matter — `X-Content-Type-Options`,
 *     `X-Frame-Options`, HSTS — are all still on.
 *
 *   • **CORS is an explicit allowlist with `credentials: true`.** `origin: '*'`
 *     is not legal alongside a credentialed cookie, and a wildcard here would
 *     let any page on the internet make authenticated requests as whoever is
 *     signed in. The list comes from `CORS_ORIGINS` and defaults to the two dev
 *     servers.
 */
export function createApp() {
  const app = express()

  const allowedOrigins = new Set(config.corsOrigins.map(canonicalOrigin))

  // Behind a Vite dev proxy (and any real reverse proxy) the client's address is
  // in `X-Forwarded-For`; without this, every request looks like it came from the
  // proxy and one rate-limit bucket is shared by everyone.
  app.set('trust proxy', 1)
  app.disable('x-powered-by')

  // 1. Distributed Tracing & Correlation ID (at the top of the chain)
  app.use(correlation())

  app.use(helmet({ contentSecurityPolicy: false }))
  app.use(
    cors({
      origin(origin, callback) {
        // A same-origin or server-to-server request has no Origin header at all;
        // that is not a cross-origin request and is allowed through.
        if (!origin || allowedOrigins.has(canonicalOrigin(origin))) return callback(null, true)
        // Allow any Cloudflare Pages deployment subdomain (*.raheman-perfumes.pages.dev and *.raheman-admin.pages.dev)
        if (/^https:\/\/([a-z0-9-]+\.)?raheman-(perfumes|admin)\.pages\.dev$/i.test(origin)) {
          return callback(null, true)
        }
        return callback(new Error(`Origin ${origin} is not allowed by CORS_ORIGINS.`))
      },
      credentials: true,
    }),
  )

  app.use(express.json({ limit: '1mb' }))
  app.use(express.urlencoded({ extended: false }))
  app.use(cookieParser())

  /**
   * Locally-stored uploads, when the local driver is the one in use.
   *
   * Mounted under `/api` so these files travel the same Vite dev proxy the rest
   * of the API does — a browser loading a product photograph needs no second
   * configuration line in either frontend. Mounted **before** the rate limiter,
   * so a catalogue page full of photographs does not spend the API's own request
   * budget.
   *
   * When Cloudinary is configured nothing is ever written here and this serves
   * an empty directory.
   */
  app.use(
    '/api/uploads',
    express.static(config.uploadsDir, {
      // Helmet's default `same-origin` resource policy would have the browser
      // refuse these when the API is reached directly rather than through the
      // proxy, which is exactly how a deployed API is reached.
      setHeaders: (res) => res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin'),
      // Every filename carries its creation time and a random suffix, so a given
      // path never changes meaning.
      maxAge: '30d',
    }),
  )

  if (!config.isTest) {
    // `dev` is colourised and one line per request; enough to see what the two
    // frontends are actually asking for while wiring them up.
    app.use(morgan(config.isProduction ? 'combined' : 'dev'))
  }

  // 2. Micro-Health Probes & Keep-Alive (UptimeRobot, Kubernetes, Render)
  // Bypasses general rate-limiter so cluster health checks & external monitors are never throttled
  app.use('/api', healthRoutes)
  app.use(healthRoutes)

  // 3. RFC-Compliant Idempotency Layer for mutations
  app.use('/api', idempotency({ ttl: 120 }))

  // 4. Tiered Rate Limiting for High Concurrency & Production Resilience
  // Auth routes enforce their own per-account and per-IP rate limiters inside `routes/auth.js`.
  // A. Public Catalogue & Taxonomy Reads (High Allowance: 3,000 req/min per IP)
  // Shared office/campus networks and rapid variant browsing will never get 429'd.
  const publicCatalogueLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: config.isProduction ? 3000 : 6000,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many catalogue queries. Please slow down.' },
  })
  app.use(['/api/products', '/api/categories', '/api/brands', '/api/coupons'], publicCatalogueLimiter)

  // B. Mutations & Checkout (Strict Allowance: 120 req/min per IP)
  // Prevents cart stuffing, review spamming, and checkout abuse
  const mutationLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many transaction attempts. Please wait a moment.' },
  })
  app.use(['/api/orders', '/api/reviews'], mutationLimiter)

  // C. General Ceiling for remaining endpoints (1,000 req/min per IP)
  app.use(
    '/api',
    rateLimit({
      windowMs: 60 * 1000,
      limit: 1000,
      standardHeaders: true,
      legacyHeaders: false,
      message: { message: 'Too many requests. Please slow down.' },
    }),
  )

  /**
   * Smart Cache Control:
   * - Public Catalogue reads (GET /api/products, /api/categories, /api/brands) are CDN & browser-friendly
   *   with short TTL + stale-while-revalidate to absorb high traffic surges.
   * - Sensitive, session-dependent, and admin endpoints strictly enforce 'no-store'.
   */
  app.use('/api', (req, res, next) => {
    const isPublicRead =
      req.method === 'GET' &&
      (/^\/api\/(products|categories|brands)/i.test(req.originalUrl || req.url) ||
        /^\/(products|categories|brands)/i.test(req.url))

    if (isPublicRead) {
      res.set('Cache-Control', 'public, max-age=10, stale-while-revalidate=30')
    } else {
      res.set('Cache-Control', 'no-store')
    }
    next()
  })

  app.use('/api', routes)

  // A friendly root, so opening http://localhost:8000 is not a bare 404.
  app.get('/', (_req, res) => {
    res.json({
      service: 'rehman-perfume-api',
      docs: '/api/health',
      endpoints: ['/api/products', '/api/categories', '/api/brands', '/api/auth/login', '/api/admin/products'],
    })
  })

  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}

export default createApp
