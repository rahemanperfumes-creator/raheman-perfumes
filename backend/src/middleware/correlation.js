import crypto from 'crypto'

/**
 * Enterprise Correlation ID & Distributed Request Tracing Middleware
 *
 * Attaches a unique Trace/Correlation ID to every incoming HTTP request.
 * If the client or upstream reverse proxy sends `X-Correlation-ID` or `X-Request-ID`,
 * it is respected and propagated across all logs, background jobs, and responses.
 */

export function correlation() {
  return (req, res, next) => {
    const correlationId =
      req.headers['x-correlation-id'] ||
      req.headers['x-request-id'] ||
      `req_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`

    req.correlationId = correlationId
    req.startTime = Date.now()
    res.setHeader('X-Correlation-ID', correlationId)

    // Log structured trace on response completion
    res.on('finish', () => {
      const durationMs = Date.now() - req.startTime
      // Only emit structured JSON log in non-test environments
      if (process.env.NODE_ENV === 'production') {
        console.log(
          JSON.stringify({
            level: res.statusCode >= 500 ? 'ERROR' : res.statusCode >= 400 ? 'WARN' : 'INFO',
            timestamp: new Date().toISOString(),
            correlationId,
            method: req.method,
            path: req.originalUrl || req.url,
            statusCode: res.statusCode,
            durationMs,
            ip: req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress,
            userAgent: req.headers['user-agent'],
          }),
        )
      }
    })

    next()
  }
}

export default correlation

