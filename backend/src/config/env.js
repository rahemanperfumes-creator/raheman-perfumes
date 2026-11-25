import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'

/**
 * Configuration, read once and validated at boot.
 *
 * Two rules govern this file. First, it fails *loudly and early*: a missing
 * MongoDB URI is reported as a sentence naming the variable, not as a Mongoose
 * stack trace ten seconds into startup. Second, it does not reject
 * placeholder-looking values — `.env` ships with placeholders on purpose, and
 * refusing them would make the checked-in file useless. The one exception is
 * `JWT_SECRET` in production, where a placeholder is a real vulnerability rather
 * than an inconvenience.
 */

dotenv.config()

const PLACEHOLDER_JWT = 'replace-with-a-long-random-string'

/** Read a string, falling back when unset or blank. */
const str = (key, fallback = '') => {
  const raw = process.env[key]
  return raw === undefined || raw.trim() === '' ? fallback : raw.trim()
}

/** Read a number, falling back when unset or not finite. */
const num = (key, fallback) => {
  const raw = str(key)
  if (!raw) return fallback
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : fallback
}

/** Read a comma-separated list. */
const list = (key, fallback = []) => {
  const raw = str(key)
  return raw ? raw.split(',').map((entry) => entry.trim()).filter(Boolean) : fallback
}

/** Read a comma-separated list, lowercased — for email addresses. */
const lowerList = (key, fallback = []) => list(key, fallback).map((entry) => entry.toLowerCase())

const bool = (key, fallback = false) => {
  const raw = str(key).toLowerCase()
  if (!raw) return fallback
  return raw === 'true' || raw === '1' || raw === 'yes'
}

const nodeEnv = str('NODE_ENV', 'development')

const cloudinary = {
  cloudName: str('CLOUDINARY_CLOUD_NAME'),
  apiKey: str('CLOUDINARY_API_KEY'),
  apiSecret: str('CLOUDINARY_API_SECRET'),
  folder: str('CLOUDINARY_FOLDER', 'rehman'),
}

/**
 * Is Cloudinary usable? The placeholder values from `.env.example` are all
 * non-empty, so "configured" cannot mean "the keys are present" — it has to mean
 * "they are not still the placeholders". Upload routes check this and answer 503
 * instead of throwing an authentication error out of the SDK.
 */
const cloudinaryConfigured =
  Boolean(cloudinary.cloudName && cloudinary.apiKey && cloudinary.apiSecret) &&
  cloudinary.cloudName !== 'your-cloud-name' &&
  cloudinary.apiKey !== 'your-api-key' &&
  cloudinary.apiSecret !== 'your-api-secret'

/**
 * The backend package root, so the uploads directory is the same folder however
 * the process was started. Deriving it from `process.cwd()` would scatter the
 * files wherever `npm run dev` happened to be invoked from.
 */
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

export const config = {
  nodeEnv,
  isProduction: nodeEnv === 'production',
  isTest: nodeEnv === 'test',
  port: num('PORT', 8000),
  mongoUri: str('MONGODB_URI'),
  jwtSecret: str('JWT_SECRET', PLACEHOLDER_JWT),
  cookieSecure: bool('COOKIE_SECURE', nodeEnv === 'production'),
  sessionCookie: 'rehman_session',
  /**
   * How long a session may sit **idle** before the server stops honouring it.
   *
   * This is the number that actually signs people out: the token's `exp` is set
   * this far ahead, and `resolveSession` slides it forward on every request, so
   * the clock only runs while nothing is happening. Four hours is a working
   * shift's worth of stepping away.
   */
  sessionIdleHours: num('SESSION_IDLE_HOURS', 3),
  /**
   * How long staff/owner admin session holds (7 days).
   */
  staffSessionDays: num('STAFF_SESSION_DAYS', 7),
  /**
   * The hard ceiling, and the reason a stolen cookie cannot be kept alive
   * forever. `sessionIdleHours` may be slid forward indefinitely by an attacker
   * who keeps making requests; this claim cannot be moved once the token is
   * minted, and the existing token's value is carried forward on every renewal.
   */
  sessionDays: num('SESSION_MAX_DAYS', 7),
  corsOrigins: list('CORS_ORIGINS', ['http://localhost:5173', 'http://localhost:5174']),
  cloudinary,
  cloudinaryConfigured,
  /**
   * Where uploads are stored: `cloudinary`, `local`, or `auto` (the default),
   * which means Cloudinary when it is configured and local otherwise. See
   * `lib/storage.js` — nothing outside that file needs to care which won.
   */
  storageDriver: str('STORAGE_DRIVER', 'auto').toLowerCase(),
  /**
   * The local driver's root. Defaults to `backend/uploads`, which is served back
   * over HTTP at `/api/uploads` — deliberately under `/api` so it travels the
   * same Vite dev proxy the rest of the API does and needs no second config line
   * in either frontend.
   */
  uploadsDir: str('UPLOADS_DIR') || path.join(packageRoot, 'uploads'),
  google: {
    clientId: str('GOOGLE_CLIENT_ID'),
    clientSecret: str('GOOGLE_CLIENT_SECRET'),
    /**
     * Where Google sends the browser back to. This is registered in the Google
     * Cloud console and must match **exactly**, byte for byte — hence a variable
     * rather than something derived from a request, since behind a proxy
     * `req.get('host')` is as likely to be the proxy's name as the API's.
     */
    redirectUri: str('GOOGLE_REDIRECT_URI', 'http://localhost:8000/api/auth/google/callback'),
    /**
     * With no list, any Google account may sign in and be given a new patron
     * record — which is what a shop wants. Fill it in to run a closed preview
     * where only the listed addresses are admitted.
     */
    adminEmails: lowerList('GOOGLE_ADMIN_EMAILS'),
  },
  pricing: {
    shippingFee: num('SHIPPING_FEE', 15),
    freeShippingOver: num('FREE_SHIPPING_OVER', 999),
  },
  brevo: {
    apiKey: str('BREVO_API_KEY'),
    senderEmail: str('BREVO_SENDER_EMAIL'),
    senderName: str('BREVO_SENDER_NAME', 'Rehman Perfume'),
    adminNotificationEmail: str('ADMIN_NOTIFICATION_EMAIL', 'rahemanperfumes@gmail.com'),
  },
  keepAlive: {
    enabled: bool('KEEP_ALIVE_ENABLED', true),
    url: str('KEEP_ALIVE_URL', str('RENDER_EXTERNAL_URL', '')),
    intervalMinutes: num('KEEP_ALIVE_INTERVAL_MINUTES', 5),
  },
}

/**
 * Is Google sign-in usable?
 *
 * Same discipline as `cloudinaryConfigured`: the placeholders in `.env.example`
 * are non-empty, so "the keys are present" cannot be the test — it has to be
 * "they are not still the placeholders". The routes check this and answer 503
 * instead of bouncing a shopper to Google with an invalid client id.
 */
config.googleConfigured =
  Boolean(config.google.clientId && config.google.clientSecret) &&
  config.google.clientId !== 'your-google-client-id' &&
  config.google.clientSecret !== 'your-google-client-secret'

/**
 * Is Brevo transactional email API usable?
 * Rejects empty or placeholder values from `.env.example` so local preview
 * fallback keeps working until a real Brevo API key is added.
 */
config.brevoConfigured =
  Boolean(config.brevo.apiKey) &&
  config.brevo.apiKey !== 'your-brevo-api-key' &&
  !config.brevo.apiKey.startsWith('replace-with-')

/**
 * Report every configuration problem at once rather than one per restart.
 * Called by `server.js` before the database is touched; the smoke test imports
 * the app directly and skips it, since it brings its own URI.
 */
export function assertConfig() {
  const problems = []

  if (!config.mongoUri) {
    problems.push('MONGODB_URI is not set — see .env.example for the connection string to paste in.')
  } else if (!/^mongodb(\+srv)?:\/\//.test(config.mongoUri)) {
    problems.push(`MONGODB_URI must start with mongodb:// or mongodb+srv:// — got “${config.mongoUri.slice(0, 24)}…”.`)
  }

  if (config.isProduction) {
    if (config.jwtSecret === PLACEHOLDER_JWT || config.jwtSecret.length < 32) {
      problems.push('JWT_SECRET is still the placeholder (or shorter than 32 characters). Set a real secret before running in production.')
    }
    if (config.corsOrigins.some((origin) => origin === '*')) {
      problems.push('CORS_ORIGINS cannot be * in production: the session cookie is credentialed.')
    }
  } else if (config.jwtSecret === PLACEHOLDER_JWT) {
    // Worth saying out loud, because a placeholder secret signs cookies that
    // anyone reading this repo could forge.
    console.warn('[config] JWT_SECRET is the placeholder value — fine for local development, refused in production.')
  }

  if (!config.cloudinaryConfigured) {
    // Not a problem any more — uploads fall back to the local disk. Said out
    // loud because it decides where a shop's photographs live, and a deployment
    // that means to be on a CDN should notice it is not.
    console.warn(
      `[config] Cloudinary is not configured — uploads will be written to ${config.uploadsDir} and served from /api/uploads.`,
    )
  }

  if (!config.googleConfigured) {
    console.warn('[config] Google sign-in is not configured — the login page will not offer it. Everything else works.')
  }

  if (!config.brevoConfigured) {
    console.warn('[config] Brevo email is not configured — password reset and verification emails will use local preview/console until BREVO_API_KEY is set.')
  }

  if (problems.length) {
    console.error('\nCannot start: the environment is incomplete.\n')
    problems.forEach((problem) => console.error(`  • ${problem}`))
    console.error('\nCopy .env.example to .env and fill in the values above.\n')
    process.exit(1)
  }
}

export default config
