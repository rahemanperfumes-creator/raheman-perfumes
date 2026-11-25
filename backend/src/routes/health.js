import { Router } from 'express'
import mongoose from 'mongoose'
import { cache } from '../lib/cache.js'
import { queue } from '../lib/queue.js'
import { circuitRegistry } from '../lib/circuitBreaker.js'

const router = Router()

/**
 * 0. Fast Ping / Keep-Alive Probe (UptimeRobot, Render Keep-Alive, Pingdom, StatusCake)
 * Ultra-lightweight endpoint that returns 200 OK immediately without database queries or overhead.
 * Designed specifically for 5-minute external monitor pings to prevent Render free instance sleeping.
 */
router.all(['/ping', '/health/ping'], (_req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
  res.status(200).json({
    status: 'ok',
    message: 'pong',
    service: 'rehman-perfume-api',
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  })
})

/**
 * 1. Liveness Probe (Kubernetes / AWS ECS / Docker Swarm)
 * Fast check: Is the process responsive and alive?
 */
router.all('/health/live', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
  res.status(200).json({ status: 'live', timestamp: new Date().toISOString() })
})

/**
 * 2. Readiness Probe
 * Deep check: Are critical upstream dependencies (MongoDB, Cache, Queue) ready to receive user traffic?
 * Returns 503 if MongoDB is disconnected so load balancers stop sending traffic here.
 */
router.all('/health/ready', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
  const dbReady = mongoose.connection?.readyState === 1 // 1 = connected
  if (!dbReady) {
    return res.status(503).json({
      status: 'unready',
      database: 'disconnected',
      timestamp: new Date().toISOString(),
    })
  }

  res.status(200).json({
    status: 'ready',
    database: 'connected',
    cache: cache.stats(),
    queue: queue.stats(),
    timestamp: new Date().toISOString(),
  })
})

/**
 * 3. Full System Telemetry
 * Provides complete operational metrics for monitoring dashboards.
 */
router.all('/health', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
  const mem = process.memoryUsage()
  const circuits = {}
  for (const [name, breaker] of circuitRegistry.entries()) {
    circuits[name] = breaker.stats()
  }

  res.status(200).json({
    status: 'ok',
    service: 'rehman-perfume-api',
    env: process.env.NODE_ENV || 'development',
    uptimeSeconds: Math.floor(process.uptime()),
    database: {
      state: mongoose.STATES[mongoose.connection?.readyState] || 'unknown',
      host: mongoose.connection?.host || 'unknown',
      name: mongoose.connection?.name || 'unknown',
    },
    cache: cache.stats(),
    queue: queue.stats(),
    circuits,
    memory: {
      rssMb: Math.round(mem.rss / 1024 / 1024),
      heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
      heapTotalMb: Math.round(mem.heapTotal / 1024 / 1024),
    },
    timestamp: new Date().toISOString(),
  })
})

export default router

