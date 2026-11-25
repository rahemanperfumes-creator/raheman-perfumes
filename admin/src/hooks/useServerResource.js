import { useCallback, useEffect, useRef, useState } from 'react'
import api from '@/lib/api'
import { useUiStore } from '@/store/uiStore'

/**
 * The pair of hooks behind every screen whose only source of truth is the server.
 *
 * The panel keeps **no bundled fixtures anywhere** — every screen's only source
 * of truth is the server. Some sections (Offers, Reviews, Custom Orders,
 * Analytics, Settings) read it directly here; the tables that render through
 * `useAdminStore` are filled by `hydrate()`, which starts them empty.
 *
 * A coupon table assembled from nothing, or a revenue chart drawn from invented
 * numbers, is worse than a blank screen — it is a screen that looks *right*. So
 * these reads have three states and no fourth: loading, loaded, or failed. On
 * failure the page renders the failure, honestly, with a retry.
 *
 * The gateway is strict for the same reason: a read that cannot reach the server
 * throws rather than degrading to a bundled row, because there is nothing to
 * degrade to.
 *
 * @param {() => Promise<any>} fetcher the read. Re-created freely; it is read
 *   through a ref, so an inline arrow does not re-run the request every render.
 * @param {{key?: string, enabled?: boolean}} [options] `key` re-runs the read
 *   when it changes (a filter, a tab); `enabled: false` holds it back entirely.
 */
export function useServerResource(fetcher, { key = '', enabled = true } = {}) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(Boolean(enabled))
  const [error, setError] = useState(null)
  const [nonce, setNonce] = useState(0)

  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher

  useEffect(() => {
    if (!enabled) {
      setLoading(false)
      return undefined
    }

    // A read that resolves after the screen has moved on must not write. This is
    // the whole of the cancellation story: no AbortController, because the request
    // layer owns its own timeout, and a late answer is simply dropped.
    let cancelled = false
    setLoading(true)
    setError(null)

    Promise.resolve()
      .then(() => fetcherRef.current())
      .then((result) => {
        if (!cancelled) setData(result)
      })
      .catch((failure) => {
        if (!cancelled) setError(failure)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [key, enabled, nonce])

  const reload = useCallback(() => setNonce((value) => value + 1), [])

  return {
    data,
    loading,
    error,
    reload,
    /** Optimistic local replacement after a write, so a save need not re-read. */
    setData,
    /**
     * A **401/403 is not an outage.** It means the session ended mid-shift — the
     * server is up and has said no. The two want different words on screen, so
     * they are told apart here rather than in five error panels.
     */
    refused: Boolean(error && api.isAuthRefusal(error)),
  }
}

/**
 * A write against a screen that has no local copy to fall back on.
 *
 * `api.mutate` resolves `{live: false}` when the request never reached the
 * server, which is right for the screens that *do* hold a local copy: there, the
 * local write is the fallback and the panel carries on. Here there is nothing to
 * fall back to, so `{live: false}` is a **failure** — the row on screen would
 * otherwise claim a change the database never heard about, which is exactly the
 * lie this whole file exists to avoid.
 *
 * A 4xx is thrown by `mutate` rather than resolved, and is surfaced as the
 * server's own message — a duplicate coupon code, a flat discount with a cap.
 * Those are the sentences worth showing; inventing our own would lose them.
 */
export function useServerAction() {
  const pushToast = useUiStore((state) => state.pushToast)
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)

  const run = useCallback(
    async (action, { success, onDone } = {}) => {
      if (busyRef.current) return null
      busyRef.current = true
      setBusy(true)
      try {
        const result = await action()

        if (result && result.live === false) {
          pushToast({
            tone: 'error',
            title: 'The server could not be reached',
            description: 'Nothing was saved. This screen reads and writes live data, so it needs the API running.',
            // Kept until dismissed: the operator has to know the change did not land.
            dismissAfter: 0,
          })
          return null
        }

        if (success) pushToast({ title: success })
        onDone?.(result?.data ?? result)
        return result
      } catch (failure) {
        pushToast({
          tone: 'error',
          title: api.isAuthRefusal(failure) ? 'Your session has ended' : 'That change was refused',
          description: failure.message,
          dismissAfter: 0,
        })
        return null
      } finally {
        busyRef.current = false
        setBusy(false)
      }
    },
    [pushToast],
  )

  return { run, busy }
}

export default useServerResource
