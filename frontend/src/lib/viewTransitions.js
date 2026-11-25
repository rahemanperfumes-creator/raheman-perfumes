/**
 * View Transitions support, decided once.
 *
 * React Router tests `typeof document.startViewTransition === 'function'` before
 * it will wrap a navigation in a view transition, and falls back to an ordinary
 * update when it is missing. The CSS entrance animation in `index.css` exists to
 * cover exactly that fallback, so it has to key off *the same* test.
 *
 * A `@supports (view-transition-name: none)` query would be close but not
 * identical — it asks about the CSS feature rather than the JS entry point — and
 * the two disagreeing would mean either a doubled animation or none at all. So
 * the flag is mirrored onto `<html>` as a class instead.
 */

/** @type {boolean} */
export const SUPPORTS_VIEW_TRANSITIONS =
  typeof document !== 'undefined' && typeof document.startViewTransition === 'function'

/**
 * Marks `<html>` with `vt-off` when the browser cannot do real view transitions.
 *
 * Called once from the layout. The class only ever gates animations that run on
 * navigation, which cannot happen before the app has mounted, so setting it from
 * an effect rather than during module evaluation is safe.
 */
export function syncViewTransitionFlag() {
  if (typeof document === 'undefined') return
  document.documentElement.classList.toggle('vt-off', !SUPPORTS_VIEW_TRANSITIONS)
}
