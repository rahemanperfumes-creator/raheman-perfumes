import { Activity } from '../models/index.js'

/**
 * The audit feed behind the admin dashboard.
 *
 * Append-only, and that is the whole point: an audit log that can be edited is
 * not evidence of anything. Nothing in this file updates or deletes a row.
 *
 * Rows mirror `admin/src/data/activity.js` exactly — including that `actor` is a
 * **free-text label** (`'Atelier Lead'`) rather than a user reference. The
 * fixture's actors are roles, not accounts, and a feed that showed a blank name
 * for every historical entry because it could not resolve a user id would be
 * less useful than one that shows the label it was written with. Where a real
 * signed-in user did the action, `actorUser` carries the reference as well, so
 * the two coexist: the label reads well, the reference is provable.
 */

/**
 * Write one entry.
 *
 * Never throws on its own account. Logging is a side effect of the action that
 * happened, so a failure to record it must not fail the action — a customer's
 * order should not be refused because the audit insert lost a race. The error is
 * reported to the console and swallowed.
 *
 * @param {{actor?: string, actorUser?: any, tone?: string, text: string, target?: string, at?: Date}} entry
 */
export async function log(entry) {
  try {
    return await Activity.create({
      at: entry.at ?? new Date(),
      actor: entry.actor ?? 'System',
      actorUser: entry.actorUser ?? null,
      tone: entry.tone ?? 'order',
      text: entry.text,
      target: entry.target ?? '',
    })
  } catch (error) {
    console.error('[activity] could not record an entry:', error.message)
    return null
  }
}

/** Convenience wrappers, so callers read as the thing that happened. */
export const logStock = (text, options = {}) => log({ ...options, tone: 'stock', text })
export const logOrder = (text, options = {}) => log({ ...options, tone: 'order', text })
export const logPrice = (text, options = {}) => log({ ...options, tone: 'price', text })
export const logCustomer = (text, options = {}) => log({ ...options, tone: 'customer', text })
export const logAlert = (text, options = {}) => log({ ...options, tone: 'alert', text })

/** The feed, newest first. */
export async function recent({ limit = 20 } = {}) {
  return Activity.find().sort({ at: -1 }).limit(Math.min(Number(limit) || 20, 100))
}

export default { log, logStock, logOrder, logPrice, logCustomer, logAlert, recent }
