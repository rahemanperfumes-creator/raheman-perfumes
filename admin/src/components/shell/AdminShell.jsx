import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from '@/components/shell/Sidebar'
import { Topbar } from '@/components/shell/Topbar'
import { CommandSearch } from '@/components/shell/CommandSearch'
import { Toaster } from '@/components/ui/Feedback'
import { Icon } from '@/components/ui/Icon'
import { useUiStore } from '@/store/uiStore'
import { useAdminStore } from '@/store/adminStore'

/**
 * The admin chrome: obsidian sidebar, paper topbar, and the scrolling content
 * well between them. Every route renders through here, so the shell is mounted
 * once and never remounts on navigation — which is what keeps the command
 * palette's global shortcut and the sidebar's scroll position stable.
 */
export function AdminShell() {
  const { pathname } = useLocation()
  const setSidebarOpen = useUiStore((state) => state.setSidebarOpen)
  const sidebarCollapsed = useUiStore((state) => state.sidebarCollapsed)

  // The last pull's outcome. When the server could not be reached the panel is
  // empty by design — so say so plainly rather than let a blank screen imply the
  // shop has nothing in it.
  const source = useAdminStore((state) => state.source)
  const syncError = useAdminStore((state) => state.syncError)

  // A new screen starts at the top, and the mobile drawer closes behind it —
  // otherwise tapping a nav link leaves the drawer covering the page it opened.
  useEffect(() => {
    window.scrollTo({ top: 0 })
    setSidebarOpen(false)
  }, [pathname, setSidebarOpen])

  return (
    /* `data-sidebar` is the single switch for the collapsed rail: index.css
       re-points `--shell-sidebar` off it, and the sidebar's width, the topbar's
       `left` and the `padding-left` below all read that one variable. Setting it
       here rather than on each of the three is what keeps them in step through
       the transition — they animate toward the same number, not three numbers
       that happen to match. */
    <div
      className="min-h-screen bg-brand-cream"
      data-sidebar={sidebarCollapsed ? 'collapsed' : 'expanded'}
    >
      <a
        href="#admin-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[80] focus:rounded focus:bg-brand-paper focus:px-4 focus:py-2 focus:text-body-sm focus:font-semibold focus:text-ink focus:shadow-overlay"
      >
        Skip to content
      </a>

      <Sidebar />
      <Topbar />

      <main
        id="admin-content"
        className="pt-16 transition-[padding] duration-300 ease-luxury motion-reduce:transition-none lg:pl-[var(--shell-sidebar)]"
      >
        <div className="mx-auto w-full max-w-screen2xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {source === 'unavailable' ? (
            <div
              role="status"
              className="mb-6 flex items-start gap-3 rounded-lg border border-error/40 bg-error/10 px-4 py-3 text-body-sm text-error"
            >
              <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                <span className="font-semibold">Backend unreachable — the panel is empty.</span>{' '}
                Nothing here is drawn from cached or sample data. {syncError ? `(${syncError})` : ''} Use
                Refresh in the top bar to try again.
              </span>
            </div>
          ) : null}
          <Outlet />
        </div>
      </main>

      <CommandSearch />
      <Toaster />
    </div>
  )
}

export default AdminShell
