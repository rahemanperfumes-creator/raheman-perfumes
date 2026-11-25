import { useMemo, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import cn from '@/lib/cn'
import { Icon } from '@/components/ui/Icon'
import { useClickOutside } from '@/hooks/useClickOutside'
import { lowStockProducts } from '@/lib/derive'
import { formatRelative } from '@/lib/format'
import { ADMIN_NAV, NAV_GROUPS } from '@/data/navigation'
import { useAdminStore } from '@/store/adminStore'
import { useSessionStore } from '@/store/sessionStore'
import { useUiStore } from '@/store/uiStore'

/** The house name for each role, as `backend/scripts/documents.mjs` labels them. */
const ROLE_LABEL = {
  owner: 'Superadmin · Owner',
}

/** Two letters for the avatar circle. */
function initialsOf(name = '') {
  const words = String(name).split(' ').filter(Boolean).slice(0, 2)
  return words.map((word) => word[0]?.toUpperCase() ?? '').join('') || 'RP'
}

/**
 * Breadcrumb text, read straight off the navigation the sidebar draws.
 *
 * It used to be a second, hand-kept list of titles and sections here — so the
 * top strip could say "Operations / Inventory" above a page whose own heading
 * said "Stock". One source cannot disagree with itself.
 */
const NAV_BY_PATH = new Map(ADMIN_NAV.map((item) => [item.to, item]))
const GROUP_LABEL = Object.fromEntries(NAV_GROUPS.map((group) => [group.id, group.label]))

export function Topbar() {
  const { pathname } = useLocation()

  const products = useAdminStore((state) => state.products)
  const orders = useAdminStore((state) => state.orders)
  const hydrate = useAdminStore((state) => state.hydrate)

  const setCommandOpen = useUiStore((state) => state.setCommandOpen)
  const toggleSidebar = useUiStore((state) => state.toggleSidebar)
  const pushToast = useUiStore((state) => state.pushToast)

  // Who is actually signed in — always a real account; there is no offline
  // identity any more, so this label never stands in for one.
  const user = useSessionStore((state) => state.user)
  const signOut = useSessionStore((state) => state.signOut)

  /** One popover at a time: `null | 'bell' | 'user'`. */
  const [openMenu, setOpenMenu] = useState(null)

  const bellRef = useRef(null)
  const userRef = useRef(null)
  useClickOutside(bellRef, () => setOpenMenu(null), openMenu === 'bell')
  useClickOutside(userRef, () => setOpenMenu(null), openMenu === 'user')

  const entry = NAV_BY_PATH.get(pathname)
  const title = entry?.label ?? 'Admin'
  const group = entry ? GROUP_LABEL[entry.group] ?? 'Admin' : 'Admin'

  /**
   * Alerts are derived from the store every render, so a notification exists
   * only while the condition behind it does — pack the last pending order and
   * the count drops, rather than sitting there as a permanent badge.
   */
  const notifications = useMemo(() => {
    const pending = orders.filter((order) => order.status === 'Pending')
    const low = lowStockProducts(products)
    const failed = orders.filter((order) => order.payment === 'Failed')
    const items = []

    if (pending.length) {
      const oldest = pending.reduce((min, order) => (order.placedAt < min.placedAt ? order : min), pending[0])
      items.push({
        id: 'pending',
        tone: 'gold',
        icon: 'bag',
        title: `${pending.length} order${pending.length === 1 ? '' : 's'} awaiting packing`,
        description: `Oldest ${oldest.id} · placed ${formatRelative(oldest.placedAt)}`,
        to: '/orders',
      })
    }
    if (low.length) {
      const names = low.slice(0, 2).map((product) => product.name).join(', ')
      items.push({
        id: 'low-stock',
        tone: 'error',
        icon: 'alert',
        title: `${low.length} fragrance${low.length === 1 ? '' : 's'} at or below safe limit`,
        description: names + (low.length > 2 ? ` +${low.length - 2} more` : ''),
        to: '/inventory',
      })
    }
    if (failed.length) {
      items.push({
        id: 'failed',
        tone: 'error',
        icon: 'card',
        title: `${failed.length} payment${failed.length === 1 ? '' : 's'} failed`,
        description: failed.map((order) => order.id).join(', '),
        to: '/orders',
      })
    }
    return items
  }, [orders, products])

  const onRefresh = async () => {
    setOpenMenu(null)
    const ok = await hydrate()
    pushToast(
      ok
        ? { title: 'Refreshed', description: 'Every screen is back to what the server holds.' }
        : { title: 'Backend unreachable', description: 'The panel could not pull fresh rows.', tone: 'error' },
    )
  }

  return (
    <header className="fixed left-0 right-0 top-0 z-30 h-16 border-b border-outline-variant/70 bg-brand-paper transition-[left] duration-300 ease-luxury motion-reduce:transition-none lg:left-[var(--shell-sidebar)]">
      <div className="flex h-full items-center gap-3 px-4 sm:px-6">
        <button
          type="button"
          onClick={toggleSidebar}
          aria-label="Open menu"
          className="rounded p-2 text-ink-variant transition-colors hover:bg-surface-low hover:text-ink lg:hidden"
        >
          <Icon name="menu" className="h-5 w-5" />
        </button>

        {/* Breadcrumb / Page Title */}
        <nav aria-label="Breadcrumb" className="hidden min-w-0 flex-col sm:flex">
          <p className="truncate font-serif text-headline-sm font-semibold leading-tight text-ink">{title}</p>
        </nav>

        <div className="ml-auto flex items-center gap-1.5 sm:gap-2.5">
          {/* Search trigger — the real palette lives in CommandSearch */}
          <button
            type="button"
            onClick={() => setCommandOpen(true)}
            className="hidden items-center gap-2 rounded-lg border border-outline-variant bg-surface-low/70 py-2 pl-3 pr-2 text-body-sm text-ink-muted transition-colors hover:border-brand-gold hover:bg-brand-paper md:flex md:w-64 lg:w-72"
          >
            <Icon name="search" className="h-4 w-4 shrink-0" />
            <span className="flex-1 truncate text-left">Search everything…</span>
            <kbd className="shrink-0 rounded border border-outline-variant bg-brand-paper px-1.5 py-0.5 text-[10px] font-bold text-ink-muted">
              ⌘K
            </kbd>
          </button>
          <button
            type="button"
            onClick={() => setCommandOpen(true)}
            aria-label="Search"
            className="rounded p-2 text-ink-variant transition-colors hover:bg-surface-low hover:text-ink md:hidden"
          >
            <Icon name="search" className="h-5 w-5" />
          </button>

          {/* Currency used to sit here: a button reading "INR ₹" that opened a
              list where AED and USD were greyed out under a "Soon" badge. The shop
              has one currency, so it was a control that could do nothing. */}

          {/* Notifications */}
          <div ref={bellRef} className="relative">
            <button
              type="button"
              onClick={() => setOpenMenu(openMenu === 'bell' ? null : 'bell')}
              aria-label={notifications.length ? `Notifications, ${notifications.length} needing attention` : 'Notifications'}
              aria-haspopup="menu"
              aria-expanded={openMenu === 'bell'}
              className="relative rounded p-2 text-ink-variant transition-colors hover:bg-surface-low hover:text-ink"
            >
              <Icon name="bell" className="h-5 w-5" />
              {notifications.length > 0 && (
                <span className="absolute right-1 top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-error px-1 text-[10px] font-bold text-white">
                  {notifications.length}
                </span>
              )}
            </button>
            {openMenu === 'bell' && (
              <div className="absolute right-0 top-[calc(100%+6px)] w-80 overflow-hidden rounded border border-outline-variant bg-brand-paper shadow-overlay">
                <p className="border-b border-outline-variant/60 px-4 py-2.5 text-label-sm font-bold uppercase tracking-wider text-ink-muted">
                  Needs attention
                </p>
                {notifications.length === 0 ? (
                  <p className="px-4 py-6 text-center text-body-sm text-ink-muted">
                    Nothing is waiting. Every order is packed and no stock is low.
                  </p>
                ) : (
                  <ul className="divide-y divide-outline-variant/40">
                    {notifications.map((item) => (
                      <li key={item.id}>
                        <Link
                          to={item.to}
                          onClick={() => setOpenMenu(null)}
                          className="flex gap-3 px-4 py-3 transition-colors hover:bg-surface-low"
                        >
                          <span
                            className={cn(
                              'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
                              item.tone === 'error' ? 'bg-error/10 text-error' : 'bg-brand-gold/25 text-brand-goldDeep',
                            )}
                          >
                            <Icon name={item.icon} className="h-4 w-4" />
                          </span>
                          <span className="min-w-0">
                            <span className="block text-body-sm font-semibold text-ink">{item.title}</span>
                            <span className="mt-0.5 block truncate text-body-sm text-ink-muted">{item.description}</span>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          <span className="mx-0.5 hidden h-8 w-px bg-outline-variant/70 sm:block" aria-hidden="true" />

          {/* Account */}
          <div ref={userRef} className="relative">
            <button
              type="button"
              onClick={() => setOpenMenu(openMenu === 'user' ? null : 'user')}
              aria-haspopup="menu"
              aria-expanded={openMenu === 'user'}
              className="flex items-center gap-2 rounded-lg py-1 pl-1 pr-1.5 transition-colors hover:bg-surface-low"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-shell-obsidian text-label-sm font-bold text-brand-gold">
                {initialsOf(user?.name)}
              </span>
              <span className="hidden flex-col items-start leading-tight lg:flex">
                <span className="text-label-lg font-semibold text-ink">
                  {user?.name ?? 'Raheman Perfumes'}
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-ink-muted">
                  {ROLE_LABEL[user?.role] ?? 'Staff'}
                </span>
              </span>
              <Icon name="chevron-down" className="h-3.5 w-3.5 text-ink-muted" />
            </button>
            {openMenu === 'user' && (
              <div className="absolute right-0 top-[calc(100%+6px)] w-64 overflow-hidden rounded border border-outline-variant bg-brand-paper py-1 shadow-overlay">
                <div className="px-3 py-2">
                  <p className="text-body-sm font-semibold text-ink">{user?.name ?? 'Raheman Perfumes'}</p>
                  <p className="text-body-sm text-ink-muted">
                    {user?.email || 'Staff account'}
                  </p>
                </div>
                <div className="my-1 h-px bg-outline-variant/60" />
                <Link
                  to="/settings"
                  onClick={() => setOpenMenu(null)}
                  className="flex items-center gap-2.5 px-3 py-2 text-body-sm text-ink-variant transition-colors hover:bg-surface-low hover:text-ink"
                >
                  <Icon name="settings" className="h-4 w-4" /> Account & store settings
                </Link>
                <div className="my-1 h-px bg-outline-variant/60" />
                <button
                  type="button"
                  onClick={onRefresh}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-body-sm text-ink-variant transition-colors hover:bg-surface-low hover:text-ink"
                >
                  <Icon name="refresh" className="h-4 w-4" /> Refresh from server
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setOpenMenu(null)
                    signOut()
                  }}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-body-sm text-ink-variant transition-colors hover:bg-surface-low hover:text-ink"
                >
                  <Icon name="logout" className="h-4 w-4" /> Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}

export default Topbar
