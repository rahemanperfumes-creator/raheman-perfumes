import { useLocation } from 'react-router-dom'
import { ReactLenis, useLenis } from 'lenis/react'
import { LENIS_OPTIONS } from '@/lib/scrollConfig'
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion'
import { useIsomorphicLayoutEffect } from '@/hooks/useIsomorphicLayoutEffect'

/** Distance kept clear above an anchor target when jumping to a hash. */
const ANCHOR_OFFSET = -104

/**
 * Scroll restoration on navigation, driven through Lenis.
 *
 * This replaces the old `window.scrollTo`, which a smooth-scroll engine fights:
 * the browser jumps instantly while Lenis is still animating toward the previous
 * position, and the two visibly disagree for a frame.
 *
 * It has to run as a *layout* effect rather than a passive one. React Router
 * updates the DOM inside a `startViewTransition` callback, and the browser
 * captures the "after" snapshot the moment that callback returns — so a passive
 * effect, which can land after paint, would reset the scroll too late. The new
 * snapshot would then be taken of the incoming page still scrolled to wherever
 * the previous one was, and the transition would show the new page at the old
 * offset before snapping to the top.
 *
 * The reset is also repeated on the next frame, and it works without Lenis at
 * all (reduced motion). Both cases close the same hole: a view-transition
 * cross-fade or a half-finished Lenis glide can put the *previous* page's scroll
 * offset back after a single reset ran, which is what made a new page — the
 * checkout form most visibly — open at the footer instead of the header.
 */
function RouteScroll() {
  const { pathname, hash } = useLocation()
  const lenis = useLenis()

  /** Move to the top by whichever engine is driving the window. */
  const toTop = () => {
    if (lenis) lenis.scrollTo(0, { immediate: true })
    else window.scrollTo(0, 0)
  }

  useIsomorphicLayoutEffect(() => {
    if (hash) {
      const target = document.querySelector(hash)
      if (target) {
        if (lenis) lenis.scrollTo(target, { offset: ANCHOR_OFFSET, duration: 1.2 })
        else target.scrollIntoView()
        return
      }
    }

    // A new page always opens at the top, with no animation — animating here
    // would read as the page scrolling itself and would delay first paint of the
    // content the reader actually asked for.
    toTop()

    // Second pass once the browser has painted the transition's "after"
    // snapshot. If the view transition or a pending Lenis animation restores
    // the old offset, this cancels it before the reader sees a frame of it.
    const raf = requestAnimationFrame(toTop)
    return () => cancelAnimationFrame(raf)
  }, [pathname, hash, lenis])

  return null
}

/**
 * Wraps the storefront in the smooth-scroll engine.
 *
 * `root` tells Lenis to drive the window scroller rather than to build its own
 * wrapper element. That matters here: it keeps the native scrollbar, keeps
 * `position: sticky` on the header behaving normally, and keeps `window.scrollY`
 * meaningful for anything that reads it. It also publishes the instance to a
 * global store, which is what lets `useLenis()` work inside the portals that the
 * drawers and modals render into.
 *
 * When the visitor has asked for reduced motion we render the tree untouched and
 * leave them the browser's own scrolling.
 */
export function SmoothScroll({ children }) {
  const reducedMotion = usePrefersReducedMotion()

  // No engine, but still the same promise: every page opens at its header. The
  // `useLenis()` inside RouteScroll resolves to null here, and it falls back to
  // the window scroller directly.
  if (reducedMotion)
    return (
      <>
        <RouteScroll />
        {children}
      </>
    )

  return (
    <ReactLenis root options={LENIS_OPTIONS}>
      <RouteScroll />
      {children}
    </ReactLenis>
  )
}

export default SmoothScroll
