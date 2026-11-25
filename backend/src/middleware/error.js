import config from '../config/env.js'

/**
 * Errors, and the one place they become a response.
 *
 * Every failure is shaped `{ message }`, which is what `ApiError` in both
 * frontends reads — and, more importantly, what `api.withFallback()` decides on:
 * a non-2xx makes the client fall back to its bundled fixtures. So a wrong
 * response shape here does not throw, it silently makes the apps look like they
 * are working from local data.
 */

/** An error with an HTTP status attached. Thrown by services, not controllers. */
export class HttpError extends Error {
  /**
   * @param {number} status
   * @param {string} message
   * @param {object} [details] extra fields merged into the response body
   */
  constructor(status, message, details = {}) {
    super(message)
    this.name = 'HttpError'
    this.status = status
    this.details = details
  }
}

export const badRequest = (message, details) => new HttpError(400, message, details)
/**
 * `details` is load-bearing on these two, and it was missing until the Google
 * flow needed it. A service often has to say *why* it refused — a machine-readable
 * `code` the client can branch on — where the human-readable `message` is
 * deliberately vague. Sign-in is the case that forced it: "no password on this
 * account, use Google" and "wrong password" must look identical in wording so the
 * endpoint cannot be used to enumerate accounts, but the sign-in page has to tell
 * them apart to know whether to offer the Google button or a retry.
 *
 * Without the parameter these constructors dropped the second argument silently,
 * which is the failure mode worth noting: the call site reads correctly, the
 * response is just quietly missing the field.
 */
export const unauthorized = (message = 'You need to sign in to do that.', details) => new HttpError(401, message, details)
export const forbidden = (message = 'Your account does not have access to that.', details) => new HttpError(403, message, details)
export const notFound = (message = 'Not found.') => new HttpError(404, message)
export const conflict = (message, details) => new HttpError(409, message, details)
export const unprocessable = (message, details) => new HttpError(422, message, details)
export const unavailable = (message, details) => new HttpError(503, message, details)
export const serviceUnavailable = unavailable

/** Anything that reached no route. */
export function notFoundHandler(req, res, next) {
  next(new HttpError(404, `No route for ${req.method} ${req.originalUrl}.`))
}

/**
 * Turn a thrown value into `{ message }`.
 *
 * Mongoose's own errors are translated rather than passed through, because
 * "E11000 duplicate key error collection: rehman.products index: sku_1 dup key"
 * is not something to show a shopkeeper, and a failed schema validation should
 * name the field that failed.
 */
// eslint-disable-next-line no-unused-vars -- Express identifies this by arity
export function errorHandler(error, req, res, next) {
  let status = error.status ?? 500
  let message = error.message ?? 'Something went wrong.'
  let details = error.details ?? {}

  if (error.name === 'ValidationError' && error.errors) {
    status = 422
    const fields = Object.entries(error.errors).map(([path, issue]) => ({ field: path, message: issue.message }))
    message = fields.map((field) => `${field.field}: ${field.message}`).join('; ')
    details = { fields }
  } else if (error.name === 'CastError') {
    status = 400
    message = `“${error.value}” is not a valid ${error.path}.`
  } else if (error.code === 11000) {
    status = 409
    const field = Object.keys(error.keyPattern ?? {})[0] ?? 'value'
    message = `That ${field} is already taken.`
    details = { field }
  } else if (error.name === 'ZodError') {
    // A `validate` middleware normally catches these, but a schema used directly
    // in a service would land here.
    status = 422
    message = error.issues.map((issue) => issue.message).join('; ')
    details = { fields: error.issues.map((issue) => ({ field: issue.path.join('.'), message: issue.message })) }
  }

  if (status >= 500) {
    console.error(`[error] ${req.method} ${req.originalUrl}`, error)
  }

  const body = { message, ...details }
  // The stack is useful locally and a liability in production.
  if (!config.isProduction && status >= 500) body.stack = error.stack?.split('\n').slice(0, 4)

  res.status(status).json(body)
}

export default errorHandler
