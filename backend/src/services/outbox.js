import mongoose from 'mongoose'
import { queue } from '../lib/queue.js'

/**
 * Enterprise Transactional Outbox Pattern
 *
 * Guarantees "at-least-once" delivery of domain events without distributed 2-phase commits.
 * When a critical transaction happens (e.g., placing an order), the event is inserted into
 * the Outbox collection in the EXACT SAME database transaction as the order.
 *
 * A background worker then polls/dispatches pending events to the background job queue.
 */

const outboxSchema = new mongoose.Schema(
  {
    eventType: {
      type: String,
      required: true,
      index: true,
    },
    aggregateId: {
      type: String,
      required: true,
      index: true,
    },
    payload: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    status: {
      type: String,
      enum: ['Pending', 'Processing', 'Processed', 'Failed'],
      default: 'Pending',
      index: true,
    },
    attempts: {
      type: Number,
      default: 0,
    },
    error: {
      type: String,
      default: null,
    },
    processedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    collection: 'outbox_events',
  },
)

export const Outbox = mongoose.models.Outbox || mongoose.model('Outbox', outboxSchema)

/**
 * Record a domain event inside an existing Mongoose session transaction.
 */
export async function recordEvent(eventType, aggregateId, payload, session = null) {
  const options = session ? { session } : {}
  const [event] = await Outbox.create(
    [
      {
        eventType,
        aggregateId: String(aggregateId),
        payload,
        status: 'Pending',
      },
    ],
    options,
  )
  return event
}

/**
 * Dispatcher loop that polls pending outbox events and pushes them to the queue.
 */
export async function dispatchPendingEvents(limit = 20) {
  const pending = await Outbox.find({ status: 'Pending' }).sort({ createdAt: 1 }).limit(limit)

  for (const event of pending) {
    try {
      event.status = 'Processing'
      event.attempts += 1
      await event.save()

      // Route event to background queue
      if (event.eventType === 'OrderPlaced') {
        queue.enqueue('send-email', {
          to: event.payload.customerEmail,
          subject: `Order Confirmation #${event.payload.orderNumber}`,
          order: event.payload,
        })
        queue.enqueue('audit-log', {
          event: 'OrderPlaced',
          orderId: event.aggregateId,
        })
      }

      event.status = 'Processed'
      event.processedAt = new Date()
      await event.save()
    } catch (err) {
      event.status = event.attempts >= 5 ? 'Failed' : 'Pending'
      event.error = err.message
      await event.save()
    }
  }

  return pending.length
}

export default { Outbox, recordEvent, dispatchPendingEvents }

