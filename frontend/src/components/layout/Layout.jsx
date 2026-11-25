import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import useUiStore from '@/store/uiStore'
import { SUPPORTS_VIEW_TRANSITIONS, syncViewTransitionFlag } from '@/lib/viewTransitions'
import { Header } from './Header'
import { Footer } from './Footer'
import { MobileNav } from './MobileNav'
import { SearchOverlay } from './SearchOverlay'
import { CartDrawer } from './CartDrawer'
import { Toaster } from './Toaster'

/**
 * The storefront shell. Every customer-facing route renders inside it, so the
 * chrome (header, footer, overlays) is mounted once and survives navigation.
 *
 * Scroll restoration on navigation is not handled here — it belongs to the
 * scroll engine, which needs to move the page itself rather than have the
 * browser jump out from under it. See `providers/SmoothScroll.jsx`.
 */
export function Layout() {
  const location = useLocation()
  const closeAllOverlays = useUiStore((state) => state.closeAllOverlays)

  // Navigating always dismisses whatever overlay is open.
  useEffect(() => {
    closeAllOverlays()
  }, [location.pathname, location.search, closeAllOverlays])

  // Lets the stylesheet key its fallback animation off the same test the router
  // uses to decide whether it will run a view transition at all.
  useEffect(syncViewTransitionFlag, [])

  const flushFooter =
    location.pathname === '/sign-in' ||
    location.pathname.startsWith('/shop') ||
    location.pathname.startsWith('/combos') ||
    location.pathname.startsWith('/offers') ||
    location.pathname.startsWith('/search')

  return (
    <div className="flex min-h-screen flex-col bg-brand-ivory">
      <Header />

      <main id="main" className="flex flex-1 flex-col">
        {/* The key is applied only where view transitions are unavailable, so
            the CSS entrance in `index.css` replays on every route change. Where
            they *are* available the browser holds both snapshots itself, and
            remounting the page would be pointless work — and would throw away
            a page's state on same-route navigations like /product/a → /product/b. */}
        <div key={SUPPORTS_VIEW_TRANSITIONS ? undefined : location.pathname} className="route-enter flex flex-1 flex-col">
          <Outlet />
        </div>
      </main>

      <Footer flush={flushFooter} />

      <MobileNav />
      <SearchOverlay />
      <CartDrawer />
      <Toaster />
    </div>
  )
}

export default Layout
