/**
 * Enterprise Circuit Breaker Pattern
 *
 * Protects the system against cascading failures when external third-party services
 * (Cloudinary, Google OAuth, Payment Gateways, SMS API) become slow or unresponsive.
 *
 * State Machine:
 *   - CLOSED: Normal operation. Calls pass through. Failures are counted.
 *   - OPEN: Threshold breached. Calls fail fast immediately without hitting remote service.
 *   - HALF_OPEN: Trial period. One probe request is sent to check if the remote service has healed.
 */

export const CircuitState = {
  CLOSED: 'CLOSED',
  OPEN: 'OPEN',
  HALF_OPEN: 'HALF_OPEN',
}

export class CircuitBreaker {
  constructor({
    name = 'default',
    failureThreshold = 5,
    resetTimeoutMs = 15000,
    timeoutMs = 10000,
    fallback = null,
  } = {}) {
    this.name = name
    this.failureThreshold = failureThreshold
    this.resetTimeoutMs = resetTimeoutMs
    this.timeoutMs = timeoutMs
    this.fallback = fallback

    this.state = CircuitState.CLOSED
    this.failureCount = 0
    this.successCount = 0
    this.lastStateChange = Date.now()
    this.nextAttempt = Date.now()
  }

  async execute(action, ...args) {
    if (this.state === CircuitState.OPEN) {
      if (Date.now() >= this.nextAttempt) {
        this.state = CircuitState.HALF_OPEN
        this.lastStateChange = Date.now()
      } else {
        if (this.fallback) return this.fallback(...args)
        const waitSec = Math.ceil((this.nextAttempt - Date.now()) / 1000)
        throw new Error(`[CircuitBreaker:${this.name}] Service temporarily unavailable (circuit OPEN). Retry in ${waitSec}s.`)
      }
    }

    try {
      // Execute action with strict timeout
      const result = await Promise.race([
        action(...args),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`[CircuitBreaker:${this.name}] Call timed out after ${this.timeoutMs}ms`)), this.timeoutMs),
        ),
      ])

      this.onSuccess()
      return result
    } catch (error) {
      this.onFailure(error)
      if (this.fallback) {
        return this.fallback(...args)
      }
      throw error
    }
  }

  onSuccess() {
    this.failureCount = 0
    if (this.state === CircuitState.HALF_OPEN) {
      this.state = CircuitState.CLOSED
      this.lastStateChange = Date.now()
      console.log(`[CircuitBreaker:${this.name}] Service recovered. State transitioned to CLOSED.`)
    }
  }

  onFailure(error) {
    this.failureCount += 1
    console.warn(`[CircuitBreaker:${this.name}] Failure #${this.failureCount}: ${error.message}`)

    if (this.state === CircuitState.HALF_OPEN || this.failureCount >= this.failureThreshold) {
      this.state = CircuitState.OPEN
      this.lastStateChange = Date.now()
      this.nextAttempt = Date.now() + this.resetTimeoutMs
      console.error(
        `[CircuitBreaker:${this.name}] Threshold breached (${this.failureCount} failures). Circuit tripped to OPEN for ${this.resetTimeoutMs / 1000}s.`,
      )
    }
  }

  stats() {
    return {
      name: this.name,
      state: this.state,
      failureCount: this.failureCount,
      resetTimeoutMs: this.resetTimeoutMs,
      nextAttempt: this.state === CircuitState.OPEN ? new Date(this.nextAttempt).toISOString() : null,
    }
  }
}

// Registry of circuit breakers for central monitoring
export const circuitRegistry = new Map()

export function getCircuit(name, options = {}) {
  if (!circuitRegistry.has(name)) {
    circuitRegistry.set(name, new CircuitBreaker({ name, ...options }))
  }
  return circuitRegistry.get(name)
}

export default CircuitBreaker

