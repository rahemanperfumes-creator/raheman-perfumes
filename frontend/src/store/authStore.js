import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { authService } from '@/services/authService'
import { setSessionEndedHandler } from '@/lib/api'

/**
 * The shopper's account.
 *
 * The session is real and the server is the only source: there is no demo
 * patron and no offline stand-in. Which of the two states you are looking at
 * is in `source`, and every account surface reads it, because the failure this
 * store has to avoid is a shopper believing they are looking at their own
 * orders when the server never confirmed anything.
 *
 * Two states, and the difference matters:
 *
 * | `source` | means | the account pages show |
 * | --- | --- | --- |
 * | `live` | a real server session | that patron's data |
 * | `none` | signed out, or no server | the guest state |
 *
 * The session token is **never here**. It lives in an httpOnly cookie the browser
 * attaches by itself; this store holds only what the server chose to tell it.
 *
 * ## When the session ends on its own
 *
 * A session is signed out by the server after four **idle** hours, for staff and
 * shoppers alike. That can happen with the shop still open, so two things keep
 * this store honest — both of them converging on `GUEST`, and neither of them
 * guessing:
 *
 *   • **`expire()`** — wired to `setSessionEndedHandler`, so any 401 from a
 *     request the store believed it was entitled to make clears the session.
 *   • **`verifySession()`** — the idle watchdog's question, asked once
 *     `session.idleHours` have passed with no interaction in this tab.
 *
 * `signedOutReason` is how the sign-in page gets to say *why*, since "we signed
 * you out for being away" and "you were never signed in" look identical
 * otherwise.
 */

/**
 * The idle rule, until `/auth/me` has reported the real one.
 *
 * A wrong value here costs a late watchdog, never a wrong screen: this only
 * decides *when to ask*, and the server's answer is what clears anyone.
 */
const DEFAULT_POLICY = { idleHours: 3, maxDays: 7 }

/** Why the session went, in the words the sign-in page shows. */
const idleRefusal = (hours = 3) =>
  `Your session ended. For your security, sessions sign out after ${hours} hours of inactivity — please sign in again.`

/** What a signed-out shopper's account looks like. */
const GUEST = {
  user: null,
  addresses: [],
  paymentMethods: [],
  orders: [],
  source: 'none',
  signedOutReason: '',
}

export const useAuthStore = create(
  persist(
    (set, get) => ({
      ...GUEST,
      /** 'ready' once `restore()` has had its say. Until then, nothing is known. */
      status: 'idle',
      error: '',
      /** The server's idle rule; see `DEFAULT_POLICY`. Not persisted — it is re-asked. */
      session: DEFAULT_POLICY,
      /** Set when the server ended the session itself, so sign-in can explain. */
      signedOutReason: '',

      isAuthenticated: () => Boolean(get().user),

      /** True when the account on screen came from the server. */
      isLive: () => get().source === 'live',

      /**
       * Ask the server who we are, once, on load.
       *
       * `/auth/me` answering `authenticated: false` is the **server's** verdict,
       * so any persisted payload is cleared — a signed-out visitor must never be
       * shown somebody else's account. A request that never arrives leaves the
       * store a guest too: without a server there is no account to show.
       */
      restore: async () => {
        set({ status: 'restoring', error: '' })
        try {
          const session = await authService.me()
          // Sent on every answer, guest or not, so the idle watchdog runs on the
          // server's number rather than a copy of it kept over here.
          const policy = session?.session ?? DEFAULT_POLICY

          /*
           * `customer` — not `authenticated` — is the test, and the difference is
           * not academic. Both apps are served from `localhost` on different
           * ports, and **cookies are scoped to a host, not a port**, so the admin
           * panel at :5174 and this shop at :5173 share one session cookie. A
           * staff member signed into the panel is therefore authenticated here
           * too, and `/auth/me` answers for them with `customer: null`. A
           * session with no patron attached is simply not this shop's session.
           */
          if (!session?.authenticated || !session.customer) {
            set({
              ...GUEST,
              status: 'ready',
              session: policy,
              signedOutReason: session?.reason === 'session_expired' ? idleRefusal(policy.idleHours) : '',
            })
            return false
          }

          const account = await loadAccount(session.profile, session.user)

          /*
           * The session can end *during* the load above: those are three more
           * `/account/*` reads, and any of them coming back 401 runs `expire()`,
           * which settles the store (`status: 'ready'`). Painting the account
           * back on over that would restore `live` for a session the server has
           * just refused.
           */
          if (get().status === 'ready') return false

          set({
            ...GUEST,
            ...(account ?? {}),
            // A session the server affirms but whose profile cannot be read is
            // not shown as live data — see `loadAccount`.
            source: account ? 'live' : 'none',
            status: 'ready',
            session: policy,
            signedOutReason: '',
            error: account ? '' : 'The server could not read this account.',
          })
          return Boolean(account)
        } catch {
          // No server. There is no account, and no stand-in for one.
          set({ ...GUEST, status: 'ready', error: 'The server is unreachable — no account can be shown.' })
          return false
        }
      },

      /**
       * Sign in with credentials.
       *
       * Returns `{ ok, message, code }`. Without a server there is no sign-in:
       * every failure is reported as it is. `code` is the refinement on a 401 —
       * `no_password` means the account belongs to someone who signed up with
       * Google and genuinely has no password to type, which is the one refusal
       * where pointing at the Google button is the actual answer.
       */
      signIn: async (email, password) => {
        set({ status: 'restoring', error: '' })

        let result
        try {
          result = await authService.login(email, password)
        } catch (error) {
          set({ status: 'ready', error: error.message })
          return { ok: false, message: error.message, code: error.payload?.code ?? null }
        }

        const session = result.data

        /*
         * A staff address is a valid sign-in and the wrong door. `/auth/login`
         * does not discriminate by role, so a staff member typing their
         * credentials here would otherwise be admitted — with no patron account
         * of their own to show. Refusing to *use* the session is the answer.
         */
        if (!session?.customer) {
          set({ ...GUEST, status: 'ready', session: session?.session ?? DEFAULT_POLICY })
          return {
            ok: false,
            message:
              'That is a staff account. This is the shop — staff sign in at the admin panel instead.',
          }
        }

        const account = await loadAccount(session.profile, session.user)
        // A 401 during the load above settles the store (`expire()`); do not
        // paint an account over a session the server just refused.
        if (get().status === 'ready' && get().source === 'none') {
          return { ok: true, message: 'Signed in, but the session ended — sign in again.' }
        }
        set({
          ...GUEST,
          ...(account ?? {}),
          source: account ? 'live' : 'none',
          status: 'ready',
          session: session.session ?? DEFAULT_POLICY,
          // A fresh sign-in supersedes whatever the last session's ending had to
          // say, so the sign-in page stops explaining the previous one.
          signedOutReason: '',
          error: account ? '' : 'Signed in, but the server could not load this account.',
        })
        return {
          ok: true,
          message: `Welcome back, ${session.user?.name ?? 'friend'}.`,
          requiresEmailVerification: session.requiresEmailVerification,
          user: session.user,
        }
      },

      /** Create an account. The server signs the new patron in as it answers. */
      register: async (draft) => {
        set({ status: 'restoring', error: '' })

        let result
        try {
          result = await authService.register(draft)
        } catch (error) {
          set({ status: 'ready', error: error.message })
          return { ok: false, message: error.message, code: error.payload?.code ?? null }
        }

        const session = result.data
        const account = await loadAccount(session.profile, session.user)
        set({
          ...GUEST,
          ...(account ?? {}),
          source: account ? 'live' : 'none',
          status: 'ready',
          session: session.session ?? DEFAULT_POLICY,
          signedOutReason: '',
          error: account ? '' : 'Registered, but the server could not load this account.',
        })
        return {
          ok: true,
          message: `Welcome to Raheman Perfumes, ${session.user?.name ?? 'friend'}.`,
          requiresEmailVerification: session.requiresEmailVerification,
          emailDelivered: session.emailDelivered,
          emailProvider: session.emailProvider,
          user: session.user,
        }
      },

      /** Verify email address with 6-digit PIN code */
      verifyEmail: async (code) => {
        try {
          const res = await authService.verifyEmail(code, get().user?.email)
          if (res?.data?.verified || res?.data?.user) {
            set((state) => ({
              ...state,
              user: state.user ? { ...state.user, isEmailVerified: true } : null,
            }))
            return { ok: true, message: res.data?.message || 'Email verified successfully.' }
          }
          return { ok: false, message: 'Could not verify code.' }
        } catch (error) {
          return { ok: false, message: error.message }
        }
      },

      /** Send or resend 6-digit email verification code */
      sendVerificationCode: async (identifier) => {
        try {
          const email = identifier || get().user?.email
          const res = await authService.sendVerificationCode(email)
          return {
            ok: res.data?.delivered ?? true,
            message: res.data?.message || 'Verification code sent to your email.',
            delivered: res.data?.delivered,
          }
        } catch (error) {
          return { ok: false, message: error.message }
        }
      },

      /**
       * Sign out.
       *
       * The server clears the cookie; the store clears itself either way. A
       * backend that has gone away cannot be asked to forget a session it is no
       * longer there to honour, and refusing to sign out during an outage would
       * be worse than a cookie that expires on its own.
       */
      signOut: async () => {
        try {
          await authService.logout()
        } catch {
          // Nothing to do — see above.
        }
        set({ ...GUEST, status: 'ready', error: '' })
      },

      /**
       * The server refused a request with 401: this session is over.
       *
       * Wired to `setSessionEndedHandler` in `lib/api.js`, so it fires wherever
       * the 401 came from rather than at each of the account surfaces.
       *
       * **Only a *live* session is torn down.** That guard is doing real work:
       * `/auth/login` answers 401 for a wrong password, and the sign-in form
       * renders that itself. `source` is the right test because it is exactly
       * "the server is standing behind this account" — a demo patron from a
       * missing server has no session to lose, and clearing them would replace
       * the labelled fixture with a signed-out screen for no reason.
       *
       * The account goes to `GUEST` rather than to `DEMO`: this person was
       * signed in and is not any more, which is the guest state, and showing
       * them the bundled demo patron afterwards would be the exact confusion
       * this store exists to prevent.
       */
      expire: () => {
        if (get().source !== 'live') return
        set({
          ...GUEST,
          status: 'ready',
          error: '',
          signedOutReason: idleRefusal(get().session.idleHours),
        })
      },

      /**
       * Is this session still alive? The idle watchdog's question, and the only
       * caller.
       *
       * It **asks rather than decides**: what ends the session here is
       * `/auth/me` saying `authenticated: false` — the same authority
       * `restore()` defers to on load. Working it out from a local clock instead
       * would sign a shopper out of a session another tab is still using.
       *
       * Two things it must never do. It never *starts* a session — only a live
       * one is ever reconsidered, so a guest stays a guest and a demo patron is
       * left alone. And a request that **fails to arrive** changes nothing: an
       * unreachable server is not a verdict, and clearing a good session over a
       * passing network blip would lose the shopper their basket's account.
       */
      verifySession: async () => {
        if (get().source !== 'live') return

        let answer
        try {
          answer = await authService.me()
        } catch {
          return
        }

        if (answer?.authenticated && answer.customer) return

        set({
          ...GUEST,
          status: 'ready',
          error: '',
          session: answer?.session ?? get().session,
          signedOutReason: answer?.reason === 'session_expired' ? idleRefusal(get().session.idleHours) : '',
        })
      },

      /* ─────────────────────────────────────────────────────── profile ──── */

      /**
       * Save a profile change. The server takes it or it is not saved.
       */
      updateProfile: async (patch) => {
        if (get().source !== 'live') return { ok: false, message: 'You are not signed in — nothing to save.' }

        try {
          const saved = await authService.saveProfile(profilePatch(patch))
          set((state) => ({ user: { ...(state.user ?? {}), ...(saved.data ?? {}) } }))
          return { ok: true }
        } catch (error) {
          set({ error: error.message })
          return { ok: false, message: error.message }
        }
      },

      /* ───────────────────────────────────────────────────── addresses ──── */

      addAddress: async (address) => {
        if (get().source !== 'live') {
          set({ error: 'The server is unreachable — the address was not saved.' })
          return null
        }

        try {
          const saved = await authService.addAddress(addressBody(address))
          set((state) => ({ addresses: [...state.addresses, saved.data] }))
          return saved.data.id
        } catch (error) {
          set({ error: error.message })
          return null
        }
      },

      updateAddress: async (id, patch) => {
        if (get().source !== 'live') return { ok: false, message: 'The server is unreachable — not saved.' }

        try {
          const saved = await authService.updateAddress(id, addressBody(patch))
          set((state) => ({
            addresses: state.addresses.map((address) =>
              address.id === id ? { ...address, ...saved.data } : address,
            ),
          }))
          return { ok: true }
        } catch (error) {
          set({ error: error.message })
          return { ok: false, message: error.message }
        }
      },

      removeAddress: async (id) => {
        if (get().source !== 'live') return { ok: false, message: 'The server is unreachable — not saved.' }

        try {
          await authService.removeAddress(id)
          set((state) => ({
            addresses: state.addresses.filter((address) => address.id !== id),
            user:
              state.user?.defaultAddressId === id ? { ...state.user, defaultAddressId: null } : state.user,
          }))
          return { ok: true }
        } catch (error) {
          set({ error: error.message })
          return { ok: false, message: error.message }
        }
      },

      setDefaultAddress: async (id) => {
        if (get().source !== 'live') return { ok: false, message: 'The server is unreachable — not saved.' }

        try {
          await authService.setDefaultAddress(id)
          set((state) => ({ user: { ...state.user, defaultAddressId: id } }))
          return { ok: true }
        } catch (error) {
          set({ error: error.message })
          return { ok: false, message: error.message }
        }
      },

      /* ────────────────────────────────────────────────────────── orders ──── */

      /** Record an order the server has already accepted. */
      addOrder(order) {
        set((state) => ({ orders: [order, ...state.orders] }))
      },

      /**
       * Re-read the order book.
       *
       * Worth having as its own action because the server is the one that moves an
       * order along — staff dispatch it in the admin panel — so the shopper's copy
       * is stale the moment it is written. `refreshAccount()` on a page mount is
       * what keeps "In Transit" from meaning "whenever you last loaded this tab".
       */
      loadOrders: async () => {
        if (get().source !== 'live') return get().orders
        try {
          const orders = await authService.orders()
          set({ orders: Array.isArray(orders) ? orders : [] })
          return get().orders
        } catch {
          return get().orders
        }
      },

      /**
       * Cancel an order on the server before it is packed.
       * Prepaid / Razorpay orders require the customer's UPI ID so the Owner
       * can manually transfer the refund from the Refund Requests page.
       */
      cancelOrder: async (orderId, { upiId = '', reason = '' } = {}) => {
        if (get().source !== 'live') {
          return { ok: false, message: 'The server is unreachable — order could not be cancelled.' }
        }
        try {
          const result = await authService.cancelOrder(orderId, { upiId, reason })
          const updated = result.data?.order
          if (updated) {
            set((state) => ({
              orders: state.orders.map((order) => (order.id === orderId ? updated : order)),
            }))
          }
          return { ok: true, order: updated }
        } catch (error) {
          return { ok: false, message: error.message || 'Could not cancel this order.' }
        }
      },

      findOrder(orderId) {
        const needle = String(orderId).trim().toLowerCase()
        return get().orders.find((order) => String(order.id).toLowerCase() === needle) ?? null
      },
    }),
    {
      name: 'rehman.account',
      storage: createJSONStorage(() => sessionStorage),
      // v4: there is no demo patron any more. Anything a previous version
      // persisted — the demo account included — is discarded outright, and
      // `restore()` asks the server who, if anyone, is signed in.
      version: 4,
      migrate: () => ({ ...GUEST }),
      partialize: (state) => ({
        user: state.user,
        addresses: state.addresses,
        paymentMethods: state.paymentMethods,
        orders: state.orders,
        source: state.source,
      }),
    },
  ),
)

/*
 * The wire between a 401 and the account clearing itself.
 *
 * Registered here, at module scope, because this store is the only thing that
 * knows whether there was a session to lose — `lib/api.js` deliberately does not
 * import it, which is what keeps the two out of a cycle.
 */
setSessionEndedHandler(() => useAuthStore.getState().expire())

/**
 * Everything the account needs, in parallel.
 *
 * `profile` is passed in only by the paths that already have one — `/auth/me`
 * returns it, **`/auth/login` does not**. Sign-in answers with
 * `{user, customer}` where `customer` is a three-field stub (`id`, `name`,
 * `email`), so assigning that to `user` would leave the account page without a
 * tier, a stats block or a default address. When no profile is supplied this
 * fetches the real one.
 *
 * Addresses and the order book are allowed to fail individually — an account
 * page with the profile and no addresses beats a sign-in that looks broken
 * because the address list was. The **profile** is not: it is who the shopper is,
 * and a live session without it is not something this store will pretend to have.
 *
 * @returns {Promise<{user: object, addresses: object[], orders: object[], source: 'live'} | null>}
 *          `null` when the profile could not be read, so the caller can fall back
 *          to the demo patron and label it.
 */
async function loadAccount(profile = null, sessionUser = null) {
  const [resolved, addresses, orders] = await Promise.all([
    profile ? Promise.resolve(profile) : authService.profile().catch(() => null),
    authService.addresses().catch(() => []),
    authService.orders().catch(() => []),
  ])

  if (!resolved) return null

  return {
    user: { ...(sessionUser ?? {}), ...(resolved ?? {}) },
    addresses: Array.isArray(addresses) ? addresses : [],
    orders: Array.isArray(orders) ? orders : [],
    source: 'live',
  }
}

/**
 * Only the fields the profile route accepts.
 *
 * `PATCH /api/account/profile` is a `.strip()`ed schema over four fields, so
 * sending the whole `user` object would be silently reduced to those four anyway
 * — but sending it is how a client ends up believing it saved something it did
 * not. `stats`, `tier` and `avatarInitials` are all counted server-side.
 */
function profilePatch(patch) {
  const allowed = ['name', 'phone', 'city', 'preferredAccord']
  return Object.fromEntries(
    Object.entries(patch).filter(([key]) => allowed.includes(key)),
  )
}

/** The same discipline for an address: the route's schema, and nothing else. */
function addressBody(address) {
  const allowed = ['tag', 'name', 'phone', 'line1', 'line2', 'area', 'city', 'district', 'state', 'pincode', 'type', 'isDefault']
  return Object.fromEntries(
    Object.entries(address).filter(([key, value]) => allowed.includes(key) && value !== undefined),
  )
}

export default useAuthStore
