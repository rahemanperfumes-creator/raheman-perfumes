import { create } from 'zustand'
import api, { setSessionEndedHandler } from '@/lib/api'

/**
 * Who is using the panel.
 *
 * This store exists because of one asymmetry between the two apps. The
 * storefront's reads are **public**, so a shopper with no session gets a real
 * answer. The admin's reads are all behind `requireStaff`, which answers **401**
 * to a request with no session — and the fallback layer used to treat that as
 * an outage and quietly serve the bundled fixtures. The panel would then render
 * a complete, plausible, entirely fictional back office: real-looking revenue,
 * real-looking order book, nothing from the database. That is a worse failure
 * than a blank screen, because nothing about it looks wrong.
 *
 * There are no fixtures to degrade to any more, and no offline session: if the
 * server cannot answer, nobody is signed in, and the panel says so.
 *
 * **Nothing here is persisted.** The session is an httpOnly cookie that
 * JavaScript cannot read, and the whole point of that is that the client never
 * holds the credential. `restore()` therefore re-derives the session from the
 * server on every load, which is also what keeps `tokenVersion` revocation
 * meaningful: a blocked user's next page load signs them out.
 *
 * The statuses, and what the shell does with each:
 *
 * | status | means | shell shows |
 * | --- | --- | --- |
 * | `checking` | asking `/auth/me` | a splash, not the panel |
 * | `signed-in` | a staff session | the panel |
 * | `forbidden` | signed in, but only a shopper | the sign-in screen, with why |
 * | `signed-out` | backend answered, no session — or never answered | the sign-in screen, with why |
 *
 * ## Ending mid-shift
 *
 * The session has a four-hour **idle** window (`SESSION_IDLE_HOURS` on the
 * server, reported here as `session.idleHours`), so it can go away while the
 * panel is open rather than only between loads. Two things catch that, and both
 * end in `signed-out` with the reason on the sign-in screen:
 *
 *   • **`expire()`** — wired to `setSessionEndedHandler`, so any request that
 *     comes back 401 closes the panel. This is the authoritative path: the
 *     server decided, and the panel agrees.
 *   • **`verifySession()`** — the idle watchdog's question, asked after
 *     `session.idleHours` of no interaction in this tab. Without it an owner who
 *     walks away and comes back to an untouched screen would keep looking at
 *     data the server would no longer give them, because nothing has been
 *     requested yet.
 */

/**
 * The idle rule, until `/auth/me` has reported the real one.
 *
 * A wrong value here costs a late watchdog, never a wrong panel: this is only
 * ever used to decide *when to ask*, and the server's answer is what signs
 * anyone out.
 */
const DEFAULT_POLICY = { idleHours: 7 * 24, maxDays: 7 }

/** Why the panel closed, in the words the sign-in screen shows. */
const idleRefusal = (hours = 7 * 24) =>
  hours >= 24
    ? `Your session ended after ${Math.round(hours / 24)} days. Please sign in again.`
    : `Your session ended. For your security, sessions sign out after ${hours} hours of inactivity — please sign in again.`

/** Why a signed-in shopper is not allowed in. Kept here so both paths agree. */
const SHOPPER_REFUSAL = 'That is a shopper account. The panel is for staff — sign in with a staff address.'

export const useSessionStore = create((set, get) => ({
  user: null,
  status: 'checking',
  error: '',
  busy: false,
  session: DEFAULT_POLICY,

  /**
   * Ask the server who we are. Called once, on mount.
   *
   * `/auth/me` is deliberately an always-200 endpoint (`optionalAuth`), so a
   * signed-out visitor is a *successful* answer rather than a 401. That leaves
   * the catch block meaning exactly one thing — the request never got there —
   * which is what makes `offline` a safe inference rather than a guess.
   */
  restore: async () => {
    set({ status: 'checking', error: '' })
    try {
      const answer = await api.get('/auth/me')
      // The idle policy comes back on every answer, guest or not, so the
      // watchdog below is set from the server's number rather than a copy of it.
      const session = answer?.session ?? DEFAULT_POLICY
      if (answer?.authenticated && answer.user?.isStaff) {
        return set({ status: 'signed-in', user: answer.user, session })
      }
      if (answer?.authenticated) {
        return set({ status: 'forbidden', user: answer.user, session, error: SHOPPER_REFUSAL })
      }
      /*
       * A cookie *was* sent and had run out. True, and worth knowing — but not
       * worth a red error panel, because nobody was watching to be told. The
       * sentence only means something to a person who believed they were still
       * signed in, and on a fresh load nobody does: they arrived, and the door
       * asks for credentials, which is the whole story. The owner of an expired
       * cookie sees an ordinary sign-in form and signs in; the difference from
       * never having visited is theirs to notice, not ours to flag.
       *
       * The paths that *do* say it are `expire()` and `verifySession()` — a
       * session ending while the panel was open, when the person has something
       * on screen they thought was still theirs.
       */
      return set({ status: 'signed-out', user: null, session, error: '' })
    } catch (error) {
      // The request never arrived. There is no fixture panel and no offline
      // identity to sign in as — an unreachable backend is reported, not
      // papered over, and the sign-in screen shows why it cannot be used.
      return set({ status: 'signed-out', user: null, error: error.message })
    }
  },

  /** Sign in with credentials. Returns whether the panel may open. */
  signIn: async (email, password) => {
    set({ busy: true, error: '' })
    try {
      /*
       * `retries: 1` because the API restarts on every source-file save under
       * `npm run dev`, and for the second it takes to come back the proxy answers
       * 500. Signing in is the one write worth sending twice — a repeat asks for
       * the same session — while a 500 on the sign-in door reads as a wrong
       * password to whoever is standing in front of it. A 401 is never retried:
       * that answer is a verdict, not a blip.
       */
      const answer = await api.post('/auth/login', { email, password }, { retries: 1 })

      /*
       * Authenticating is not the same as being allowed in. A shopper's
       * credentials are perfectly valid — this is the staff door.
       *
       * The session is left standing rather than torn down. Both apps are served
       * from `localhost` on different ports, and **cookies are scoped to a host,
       * not a port**, so this is one cookie shared with the shop at :5173:
       * logging out here would sign the shopper out of their own basket. Declining
       * to open the panel is the whole of what this door needs to do.
       */
      if (!answer?.user?.isStaff) {
        set({ status: 'forbidden', user: null, busy: false, error: SHOPPER_REFUSAL })
        return false
      }

      set({
        status: 'signed-in',
        user: answer.user,
        session: answer.session ?? DEFAULT_POLICY,
        busy: false,
        error: '',
      })
      return true
    } catch (error) {
      set({ busy: false, error: error.message })
      return false
    }
  },

  /** Clear the cookie. The server owns the session, so this is a request. */
  signOut: async () => {
    set({ busy: true })
    try {
      await api.post('/auth/logout')
    } catch {
      // A backend that has gone away cannot be asked to forget a cookie it is
      // no longer there to honour. Clear locally anyway — the alternative is a
      // panel that refuses to let anyone sign out during an outage.
    }
    set({ user: null, status: 'signed-out', busy: false, error: '' })
  },

  /** Let the sign-in screen clear a stale refusal when the user edits a field. */
  clearError: () => set({ error: '' }),

  /**
   * The server has refused a request with 401: this session is over.
   *
   * Wired to `setSessionEndedHandler` in `lib/api.js`, so it fires from wherever
   * the 401 came from rather than from each screen separately.
   *
   * **Only a session we believed in closes.** That guard is load-bearing rather
   * than defensive: `/auth/login` answers 401 for a wrong password, and without
   * it a mistyped password would replace the form's own "that email address and
   * password do not match" with "your session ended", which is a different and
   * false story. A signed-out panel is already the thing LoginPage renders, so
   * there is nothing to do in that case anyway.
   */
  expire: () => {
    if (get().status !== 'signed-in') return
    set({
      user: null,
      status: 'signed-out',
      busy: false,
      error: idleRefusal(get().session.idleHours),
    })
  },

  /**
   * Is this session still alive? The idle watchdog's question, and the only
   * caller.
   *
   * It **asks rather than decides**: the answer that closes the panel is
   * `/auth/me` saying `authenticated: false`, which is the same authority
   * `restore()` defers to on load. Guessing from a local clock would sign people
   * out of a session another tab is still happily using.
   *
   * Two things it must never do, and does not. It never *opens* the panel — a
   * tab that was left signed-out stays that way. And a request that **fails to
   * arrive** changes nothing: an unreachable server is not a verdict, and
   * flipping to `signed-out` on a network blip would throw away a perfectly good
   * session. Silence is the right answer to silence.
   */
  verifySession: async () => {
    if (get().status !== 'signed-in') return

    let answer
    try {
      answer = await api.get('/auth/me')
    } catch {
      return
    }

    if (answer?.authenticated && answer.user?.isStaff) return

    set({
      user: null,
      status: 'signed-out',
      busy: false,
      error: answer?.reason === 'session_expired' ? idleRefusal(get().session.idleHours) : '',
    })
  },
}))

/*
 * The wire between a 401 and the panel closing.
 *
 * Registered here, at module scope, because this store is the only thing that
 * knows whether the panel was open — `lib/api.js` deliberately does not import
 * it, which is what keeps the two out of a cycle.
 */
setSessionEndedHandler(() => useSessionStore.getState().expire())

export default useSessionStore
