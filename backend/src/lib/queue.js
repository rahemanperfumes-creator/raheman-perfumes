import { EventEmitter } from 'events'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Enterprise Asynchronous Background Queue & Worker Engine
 *
 * Provides decoupled background processing for slow I/O tasks:
 * email delivery, SMS/OTP sending, PDF invoice creation, and outbox processing.
 * Supports priority queues, automatic retries with exponential backoff,
 * concurrency limiting, persistence recovery journal across restarts, and a Dead-Letter Queue (DLQ).
 */

class AsyncJobQueue extends EventEmitter {
  constructor({ concurrency = 5, defaultMaxAttempts = 3 } = {}) {
    super()
    this.concurrency = concurrency
    this.defaultMaxAttempts = defaultMaxAttempts
    this.pending = [] // Array of job descriptors
    this.active = new Map() // jobId -> job
    this.completed = [] // Keep last 100 for audit
    this.dlq = [] // Dead-letter queue for failed jobs
    this.handlers = new Map() // jobName -> async handler function
    this.running = true
    this.draining = false
    this.journalPath = path.resolve(process.cwd(), '.queue_journal.json')

    // Automatically recover any in-flight jobs from previous server restart
    this._restoreJournal()
  }

  _persistJournal() {
    try {
      const unfinished = [...this.pending, ...Array.from(this.active.values())]
      if (unfinished.length > 0) {
        fs.writeFileSync(this.journalPath, JSON.stringify(unfinished, null, 2), 'utf8')
        console.log(`[Queue] Saved ${unfinished.length} unfinished jobs to journal for restart recovery.`)
      }
    } catch (err) {
      console.error('[Queue] Failed to persist journal:', err.message)
    }
  }

  _restoreJournal() {
    try {
      if (fs.existsSync(this.journalPath)) {
        const raw = fs.readFileSync(this.journalPath, 'utf8')
        const items = JSON.parse(raw)
        if (Array.isArray(items) && items.length > 0) {
          for (const item of items) {
            item.attempts = Math.max(0, item.attempts || 0)
            this.pending.push(item)
          }
          console.log(`[Queue] Successfully restored ${items.length} pending jobs from journal.`)
          fs.unlinkSync(this.journalPath)
          this._tick()
        }
      }
    } catch (err) {
      console.warn('[Queue] Could not restore journal:', err.message)
    }
  }

  /**
   * Register a processor function for a specific job type.
   */
  process(jobName, handler) {
    if (typeof handler !== 'function') throw new Error(`Handler for "${jobName}" must be a function`)
    this.handlers.set(jobName, handler)
    this._tick()
  }

  /**
   * Enqueue a new background task.
   */
  enqueue(name, payload = {}, { priority = 0, maxAttempts = this.defaultMaxAttempts, delayMs = 0 } = {}) {
    const job = {
      id: `job_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      name,
      payload,
      priority,
      attempts: 0,
      maxAttempts,
      runAt: Date.now() + delayMs,
      createdAt: new Date().toISOString(),
      error: null,
    }

    this.pending.push(job)
    this.pending.sort((a, b) => b.priority - a.priority || a.runAt - b.runAt)

    this.emit('enqueued', { id: job.id, name: job.name })
    this._tick()
    return job.id
  }

  _tick() {
    if (!this.running || this.active.size >= this.concurrency) return

    const now = Date.now()
    const readyIndex = this.pending.findIndex((job) => job.runAt <= now)
    if (readyIndex === -1) {
      // Schedule tick for earliest delayed job
      if (this.pending.length > 0) {
        const nextTime = Math.min(...this.pending.map((j) => j.runAt))
        const wait = Math.max(50, nextTime - now)
        setTimeout(() => this._tick(), wait).unref()
      }
      return
    }

    const [job] = this.pending.splice(readyIndex, 1)
    const handler = this.handlers.get(job.name)

    if (!handler) {
      console.warn(`[Queue] No handler registered for job type "${job.name}". Re-queuing in 5s...`)
      job.runAt = now + 5000
      this.pending.push(job)
      return
    }

    this.active.set(job.id, job)
    job.attempts += 1
    job.startedAt = new Date().toISOString()

    Promise.resolve()
      .then(() => handler(job.payload, job))
      .then((result) => {
        this.active.delete(job.id)
        job.completedAt = new Date().toISOString()
        job.result = result

        this.completed.push(job)
        if (this.completed.length > 200) this.completed.shift()

        this.emit('completed', { id: job.id, name: job.name, result })
        this._tick()
      })
      .catch((error) => {
        this.active.delete(job.id)
        job.error = error.message || String(error)

        if (job.attempts < job.maxAttempts) {
          // Exponential backoff: 1s, 2s, 4s, 8s...
          const backoffDelay = Math.pow(2, job.attempts) * 1000
          job.runAt = Date.now() + backoffDelay
          this.pending.push(job)
          this.emit('retrying', { id: job.id, name: job.name, attempt: job.attempts, nextInMs: backoffDelay })
        } else {
          // Send to Dead-Letter Queue (DLQ)
          job.failedAt = new Date().toISOString()
          this.dlq.push(job)
          if (this.dlq.length > 200) this.dlq.shift()
          this.emit('failed', { id: job.id, name: job.name, error: job.error })
          console.error(`[Queue DLQ] Job "${job.name}" (${job.id}) failed permanently after ${job.attempts} attempts:`, job.error)
        }

        this._tick()
      })
  }

  /**
   * Stats for health probes and admin dashboards.
   */
  stats() {
    return {
      status: this.running ? 'running' : 'stopped',
      concurrency: this.concurrency,
      pendingCount: this.pending.length,
      activeCount: this.active.size,
      completedCount: this.completed.length,
      dlqCount: this.dlq.length,
    }
  }

  /**
   * Drain active jobs gracefully during server shutdown.
   */
  async drain(timeoutMs = 5000) {
    this.running = false
    const start = Date.now()

    while (this.active.size > 0 && Date.now() - start < timeoutMs) {
      await new Promise((r) => setTimeout(r, 100))
    }

    if (this.active.size > 0) {
      console.warn(`[Queue] Shutdown timeout: ${this.active.size} jobs were still running.`)
    }

    // Persist any un-executed jobs to disk so nothing is lost upon restart
    this._persistJournal()
  }
}

export const queue = new AsyncJobQueue({ concurrency: 5 })

// Standard default job processors
queue.process('send-email', async (payload) => {
  // Simulates or delegates to email transporter in background
  if (process.env.NODE_ENV !== 'production') {
    // Development output
    // console.log(`[Queue:send-email] Sending "${payload.subject}" to ${payload.to}`)
  }
  return { delivered: true, to: payload.to, timestamp: new Date().toISOString() }
})

queue.process('audit-log', async (payload) => {
  // Background processing of analytics / audit events
  return { logged: true, event: payload.event }
})

export default queue

