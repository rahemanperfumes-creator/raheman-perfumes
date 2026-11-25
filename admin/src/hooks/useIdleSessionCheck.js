import { useEffect } from 'react'
import { useSessionStore } from '@/store/sessionStore'

/**
 * Close the panel when the session behind it has quietly expired.
 *
 * The server signs a session out after four idle hours (`SESSION_IDLE_HOURS`),
 * and the panel usually finds out the right way — `expire()` is wired to the
 * first 401 any request gets. The gap this fills is the screen nobody has asked
 * anything of: an owner leaves the panel open, comes back after lunch, and is
 * looking at a dashboard the server would no longer hand them. Nothing is wrong
 * on screen, which is exactly the problem.
 *
 * So after `session.idleHours` with no interaction **in this tab**, it asks the
 * server one question and lets the answer decide. Two properties matter:
 *
 *   • **It cannot keep a session alive.** It fires only after the window has
 *     already elapsed with no activity, and `/auth/me` only renews a token that
 *     still verifies — so a watchdog tick on a dead session changes nothing, and
 *     one on a live session is a session another tab is genuinely using. A
 *     heartbeat on a shorter timer would have done the opposite and defeated the
 *     timeout entirely.
 *   • **It is per tab, and asks rather than decides.** Two tabs, one busy: the
 *     idle tab wakes, asks, is told yes, and stays signed in — which is correct,
 *     because the session really is alive.
 *
 * `visibilitychange` is handled separately from the other events because it is
 * the one signal a background tab still gets. Browsers throttle timers in hidden
 * tabs hard enough that returning to a tab is the practical moment to check, and
 * it is also the moment the person finds out — better here than on their next
 * click.
 */
export function useIdleSessionCheck() {
  const idleHours = useSessionStore((state) => state.session.idleHours)
  const verifySession = useSessionStore((state) => state.verifySession)

  useEffect(() => {
    const idleMs = Math.max(0, Number(idleHours) || 0) * 60 * 60 * 1000

    // A zero or unreadable window means there is no idle rule to enforce — the
    // server is the authority either way, and guessing at one here would only
    // add sign-outs the server never asked for.
    if (!idleMs) return undefined

    let lastActivity = Date.now()
    const touch = () => {
      lastActivity = Date.now()
    }

    const check = () => {
      if (Date.now() - lastActivity < idleMs) return
      lastActivity = Date.now()
      verifySession()
    }

    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return
      check()
      // A glance at the tab is activity even when nothing needed checking, so
      // the clock restarts either way.
      lastActivity = Date.now()
    }

    const events = ['pointerdown', 'keydown', 'wheel', 'touchstart']
    events.forEach((name) => window.addEventListener(name, touch, { passive: true }))
    document.addEventListener('visibilitychange', onVisibility)

    // A minute is far finer than a four-hour window ever needs, and coarse
    // enough to be free.
    const ticker = setInterval(check, 60 * 1000)

    return () => {
      events.forEach((name) => window.removeEventListener(name, touch))
      document.removeEventListener('visibilitychange', onVisibility)
      clearInterval(ticker)
    }
  }, [idleHours, verifySession])
}

export default useIdleSessionCheck
