/**
 * Wrap an async route handler so a rejected promise reaches Express's error
 * handler rather than becoming an unhandled rejection.
 *
 * Express 4 does not await handlers, so `async (req, res) => { throw … }` hangs
 * the request and eventually kills the process. Every async handler in this app
 * goes through here.
 *
 * @param {(req, res, next) => Promise<unknown>} handler
 */
export const asyncHandler = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next)
}

export default asyncHandler
