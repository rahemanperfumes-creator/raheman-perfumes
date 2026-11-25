import { useEffect } from 'react'
import { useAuthStore } from '@/store/authStore'

/**
 * Notice a shop session that has quietly expired.
 *
 * The server signs a session out after four idle hours (`SESSION_IDLE_HOURS`),
 * for a shopper exactly as for staff. Most of the time the shop finds out on its
 * own — `expire()` in the store is wired to the first 401 any request gets — but
 * the account pages hold their patron in a store, so a tab left open on "My
 * Account" would keep showing a shopper their own orders and addresses from
 * memory. Nothing on screen would look wrong, which is the problem: the first
 * hint would be a save that silently refused.
 *
 * So after `session.idleHours` with no interaction **in this tab**, it asks the
 * server one question and lets the answer decide. Two properties matter:
 *
 *   • **It cannot keep a session alive.** It fires only once the window has
 *     already elapsed with no activity, and `/auth/me` renews only a token that
 *     still verifies — so a tick on a dead session changes nothing, and a tick
 *     on a live one belongs to a session another tab is genuinely using. A
 *     heartbeat on a shorter timer would have done the opposite, and defeated
 *     the timeout it was meant to enforce.
 *   • **It is per tab, and asks rather than decides.** Two tabs, one busy: the
 *     idle tab wakes, asks, is told yes, and stays signed in — which is right,
 *     because the session really is alive.
 *
 * `visibilitychange` is handled apart from the rest because it is the one signal
 * a background tab still gets: browsers throttle timers in hidden tabs hard
 * enough that returning to one is the practical moment to check, and it is also
 * the moment the shopper finds out — better here than on their next click.
 */
export function useIdleSessionCheck() {
  const idleHours = useAuthStore((state) => state.session.idleHours)
  const verifySession = useAuthStore((state) => state.verifySession)

  useEffect(() => {
    const idleMs = Math.max(0, Number(idleHours) || 0) * 60 * 60 * 1000

    // A zero or unreadable window means there is no idle rule to enforce. The
    // server is the authority either way, and inventing one here would only add
    // sign-outs it never asked for.
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
