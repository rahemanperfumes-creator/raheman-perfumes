/**
 * Activity feed icons.
 *
 * The feed is an audit log the server writes and `hydrate()` reads back. All
 * that lives here is the tone → icon map, kept beside the vocabulary so the two
 * cannot drift.
 */

/** Tone → icon, kept next to the data so the two cannot drift. */
export const ACTIVITY_ICON = {
  stock: 'package',
  order: 'bag',
  alert: 'alert',
  price: 'tag',
  customer: 'user',
}
