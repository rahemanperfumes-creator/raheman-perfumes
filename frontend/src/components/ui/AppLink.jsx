import { forwardRef } from 'react'
import { Link as RouterLink, NavLink as RouterNavLink } from 'react-router-dom'

/**
 * The app's navigation primitives.
 *
 * React Router only opts into the browser's View Transitions API when a `<Link>`
 * or a `navigate()` call asks for it — there is no global switch. Rather than
 * thread `viewTransition` through four dozen call sites, this module re-exports
 * the whole package with the two link components already opted in, so every
 * import keeps working unchanged and every navigation cross-fades by default.
 *
 * The `export *` below is deliberate: an explicit named export takes precedence
 * over a star export of the same name, so `Link` and `NavLink` here shadow the
 * router's versions while every hook, `Outlet` and `Navigate` continues to come
 * straight from the package. That is what lets a file swap only its module
 * specifier and change nothing else.
 *
 * Where the browser has no View Transitions support — Firefox, for now — React
 * Router detects that and navigates normally, so this degrades to the previous
 * instant swap rather than breaking. `index.css` covers that case with a plain
 * CSS entrance animation.
 */
export * from 'react-router-dom'

export const Link = forwardRef(function Link({ viewTransition = true, ...props }, ref) {
  return <RouterLink ref={ref} viewTransition={viewTransition} {...props} />
})

export const NavLink = forwardRef(function NavLink({ viewTransition = true, ...props }, ref) {
  return <RouterNavLink ref={ref} viewTransition={viewTransition} {...props} />
})

/**
 * Pass to `navigate()` for the same cross-fade the links get. Spread it when
 * other options are needed: `navigate(to, { ...NAV_TRANSITION, replace: true })`.
 */
export const NAV_TRANSITION = { viewTransition: true }
