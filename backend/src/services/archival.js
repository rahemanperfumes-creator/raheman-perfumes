import mongoose from 'mongoose'
import { Activity } from '../models/Activity.js'
import { User } from '../models/User.js'
import { Outbox } from './outbox.js'

/**
 * Enterprise Tiered Data Lifecycle & Archival Service
 *
 * Keeps the primary operational MongoDB collections ultra-lean by:
 *   1. Cleaning expired password reset codes and unverified tokens (> 24 hours).
 *   2. Archiving / pruning activity audit logs older than retention limit (e.g., 90 days).
 *   3. Pruning processed outbox events older than 14 days.
 */

export const archivalService = {
  /**
   * Run full data hygiene & archival routine.
   */
  async runMaintenance({ activityRetentionDays = 90, outboxRetentionDays = 14 } = {}) {
    const results = {
      expiredTokensCleared: 0,
      activitiesPruned: 0,
      outboxEventsPruned: 0,
      timestamp: new Date().toISOString(),
    }

    // 1. Clean expired reset tokens on User accounts
    const expiredTokenResult = await User.updateMany(
      {
        'resetToken.expiresAt': { $lt: new Date() },
      },
      {
        $unset: { resetToken: '' },
      },
    )
    results.expiredTokensCleared = expiredTokenResult.modifiedCount || 0

    // 2. Prune old audit activities beyond retention window
    const activityCutoff = new Date(Date.now() - activityRetentionDays * 24 * 60 * 60 * 1000)
    const activityResult = await Activity.deleteMany({
      createdAt: { $lt: activityCutoff },
    })
    results.activitiesPruned = activityResult.deletedCount || 0

    // 3. Prune successfully processed outbox events beyond retention window
    const outboxCutoff = new Date(Date.now() - outboxRetentionDays * 24 * 60 * 60 * 1000)
    const outboxResult = await Outbox.deleteMany({
      status: 'Processed',
      createdAt: { $lt: outboxCutoff },
    })
    results.outboxEventsPruned = outboxResult.deletedCount || 0

    return results
  },
}

export default archivalService

