import { config } from '../config/env.js'

let keepAliveInterval = null

/**
 * Automated keep-alive ping service.
 *
 * Works in tandem with external monitoring services like UptimeRobot:
 * If running on Render (where RENDER_EXTERNAL_URL is automatically present)
 * or if KEEP_ALIVE_URL is configured, the server periodically pings its
 * public ping endpoint to guarantee it stays warm and never spins down.
 */
export function startKeepAlive() {
  const { enabled, url, intervalMinutes } = config.keepAlive || {}

  if (!enabled || !url) {
    return null
  }

  const cleanUrl = url.replace(/\/$/, '')
  const pingEndpoint = `${cleanUrl}/api/ping`
  const minutes = Math.max(1, intervalMinutes || 5)
  const ms = minutes * 60 * 1000

  console.log(`  Keep-Alive active: pinging ${pingEndpoint} every ${minutes}m`)

  const ping = async () => {
    try {
      const res = await fetch(pingEndpoint, {
        method: 'GET',
        headers: {
          'User-Agent': 'Rehman-Perfumes-KeepAlive/1.0 (self-ping)',
          'Cache-Control': 'no-cache',
        },
      })
      if (!res.ok) {
        console.warn(`[Keep-Alive] Warning: self-ping returned HTTP ${res.status}`)
      }
    } catch (err) {
      console.warn(`[Keep-Alive] Self-ping notice: ${err.message}`)
    }
  }

  // Initial ping 20 seconds after boot to verify reachability
  const initialTimeout = setTimeout(ping, 20000)
  if (initialTimeout.unref) initialTimeout.unref()

  keepAliveInterval = setInterval(ping, ms)
  if (keepAliveInterval.unref) keepAliveInterval.unref()

  return keepAliveInterval
}

export function stopKeepAlive() {
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval)
    keepAliveInterval = null
  }
}
