import { useEffect, useLayoutEffect } from 'react'

/**
 * `useLayoutEffect` in the browser, `useEffect` during server rendering.
 *
 * React warns when a layout effect runs during SSR, and the render smoke test
 * pushes every route through `renderToString` — so anything that genuinely needs
 * to run before paint in the browser would otherwise fill that output with
 * warnings.
 *
 * This keys off Vite's `import.meta.env.SSR` rather than the usual
 * `typeof window === 'undefined'` check. That check is wrong here: the smoke
 * test installs a `window` shim before rendering, precisely so that code probing
 * for browser globals does not throw — which makes `window` defined on the
 * server too, and would silently select the layout effect and warn anyway.
 *
 * It matters for a specific reason: React Router updates the DOM inside a
 * `startViewTransition` callback and the browser captures the "after" snapshot
 * the moment that callback returns. Only a layout effect is guaranteed to have
 * run by then; a passive effect can land after the snapshot and leave the
 * transition animating toward stale pixels.
 */
export const useIsomorphicLayoutEffect = import.meta.env.SSR ? useEffect : useLayoutEffect

export default useIsomorphicLayoutEffect
