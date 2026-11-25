import { useMemo } from 'react'
import { NavLink } from 'react-router-dom'
import cn from '@/lib/cn'
import { Icon } from '@/components/ui/Icon'
import { ADMIN_NAV, NAV_GROUPS } from '@/data/navigation'
import { useAdminStore } from '@/store/adminStore'
import useSessionStore from '@/store/sessionStore'
import { useUiStore } from '@/store/uiStore'
import { lowStockProducts } from '@/lib/derive'

/**
 * One link in the rail.
 *
 * Split out because it now renders inside a group loop, and the markup is long
 * enough that nesting it deeper would have hidden the grouping itself — the
 * thing the owner is supposed to read first.
 *
 * The count is the interesting part: a number where there is room for one, and a
 * dot where there is not. Both mean "this needs you"; neither is a width fight.
 */
function NavItem({ item, count, collapsed, labelCls, onNavigate }) {
  return (
    <li>
      <NavLink
        to={item.to}
        end={item.to === '/'}
        onClick={onNavigate}
        title={collapsed ? item.label : undefined}
        className={({ isActive }) =>
          cn(
            'flex items-center gap-3 rounded-lg px-3 py-2 text-label-lg font-semibold transition-colors',
            collapsed && 'lg:justify-center lg:gap-0 lg:px-0',
            isActive
              ? 'bg-brand-gold text-brand-goldInk shadow-sm'
              : 'text-shell-ink/75 hover:bg-white/10 hover:text-white',
          )
        }
      >
        {({ isActive }) => (
          <>
            <span className="relative flex h-5 w-5 shrink-0 items-center justify-center">
              <Icon name={item.icon} className={cn('h-5 w-5', isActive ? '' : 'opacity-80')} />
              {count > 0 && collapsed && (
                <span
                  aria-hidden="true"
                  className={cn(
                    'absolute -right-1.5 -top-1.5 hidden h-2.5 w-2.5 rounded-full ring-2 ring-shell-obsidian lg:block',
                    isActive ? 'bg-brand-goldInk' : 'bg-brand-gold',
                  )}
                />
              )}
            </span>
            <span className={cn('flex-1 text-left', labelCls)}>{item.label}</span>
            {count > 0 && (
              <span
                className={cn(
                  'shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold',
                  collapsed && 'lg:hidden',
                  isActive ? 'bg-brand-goldInk/15 text-brand-goldInk' : 'bg-brand-gold text-brand-goldInk',
                )}
              >
                {count}
              </span>
            )}
          </>
        )}
      </NavLink>
    </li>
  )
}

/**
 * The obsidian sidebar.
 *
 * Counts on the nav are derived from the store, not typed — "6 Low" is however
 * many fragrances are actually at or below their safe limit this second, and
 * disappears entirely when there are none, so a badge always means something
 * needs attention.
 *
 * Twelve links in one column is what made this panel feel like an engineer's
 * console. They are now four labelled groups in the order a shop day happens —
 * Today, Catalogue, Customers, Shop — so the owner is choosing between four
 * sections and then three items, which reads as far shorter than twelve.
 * Collapsed to the icon rail the captions cannot fit, so a hairline takes over
 * the same separation rather than the grouping disappearing.
 *
 * On desktop it collapses to an icon rail. Every label stays in the DOM and is
 * taken out of the layout by width and opacity rather than by unmounting it, for
 * two reasons: the width transition has something to animate, and the link keeps
 * its accessible name from its text content instead of having to borrow one from
 * a `title`. The `lg:` prefix on every collapse rule is what keeps the mobile
 * drawer full width — see `uiStore.sidebarCollapsed`.
 */
export function Sidebar() {
  const products = useAdminStore((state) => state.products)
  const orders = useAdminStore((state) => state.orders)
  const owner = useSessionStore((state) => state.user)
  const sidebarOpen = useUiStore((state) => state.sidebarOpen)
  const setSidebarOpen = useUiStore((state) => state.setSidebarOpen)
  const collapsed = useUiStore((state) => state.sidebarCollapsed)
  const toggleSidebarCollapsed = useUiStore((state) => state.toggleSidebarCollapsed)

  const badges = useMemo(
    () => ({
      pendingOrders: orders.filter((order) => order.status === 'Pending').length,
      lowStock: lowStockProducts(products).length,
    }),
    [orders, products],
  )

  /* The nav, cut into its sections. Built from `NAV_GROUPS` rather than from
     whatever order the list happens to be in, so a group with nothing in it
     never renders an empty heading. */
  const sections = useMemo(
    () =>
      NAV_GROUPS.map((group) => ({
        ...group,
        items: ADMIN_NAV.filter((item) => item.group === group.id && (!item.ownerOnly || owner?.role === 'owner')),
      })).filter((group) => group.items.length > 0),
    [owner?.role],
  )

  /* Shared by every label-shaped thing in here — the nav items, the "Collapse"
     caption and the footer. `w-0` plus `opacity-0` collapses it out of the flex
     row *and* fades it, so the icon beside it settles into the centre of the
     rail instead of sitting off-centre for the length of the transition. */
  const labelCls = cn(
    'min-w-0 truncate whitespace-nowrap transition-all duration-300 ease-luxury motion-reduce:transition-none',
    collapsed && 'lg:w-0 lg:opacity-0',
  )

  return (
    <>
      {/* Mobile scrim */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-shell-obsidian/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        id="admin-sidebar"
        className={cn(
          'fixed left-0 top-0 z-50 flex h-full w-[var(--shell-sidebar)] flex-col justify-between overflow-hidden bg-shell-obsidian text-shell-ink shadow-hairline transition-[transform,width] duration-300 ease-luxury motion-reduce:transition-none lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        )}
        aria-label="Admin sections"
      >
        <div className="flex min-h-0 flex-1 flex-col">
          {/* Official Brand Logo */}
          <div
            className={cn(
              'flex items-center gap-3 px-5 py-4',
              collapsed && 'lg:justify-center lg:px-0',
            )}
          >
            <img
              src="/logo.png"
              alt="Raheman Perfumes"
              draggable={false}
              loading="eager"
              className="h-11 w-11 shrink-0 rounded-full object-contain drop-shadow-[0_2px_8px_rgba(216,184,120,0.28)]"
            />
            <span className={cn('flex flex-col overflow-hidden', labelCls)}>
              <span className="truncate text-label-sm font-bold uppercase tracking-[0.2em] text-brand-gold">
                Admin Panel
              </span>
              <span className="truncate text-[11px] text-shell-ink/60">
                Store Control
              </span>
            </span>
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              aria-label="Close menu"
              className="ml-auto rounded p-1.5 text-shell-ink/70 transition-colors hover:bg-white/10 hover:text-white lg:hidden"
            >
              <Icon name="close" className="h-4 w-4" />
            </button>
          </div>

          <div className={cn('px-5', collapsed && 'lg:px-3')}>
            <div className="h-px w-full bg-white/10" />
          </div>

          {/* The rail toggle.
              It gets a row of its own rather than a corner of the header. The
              header already has to fit a 40px mark and the wordmark, and at
              4.5rem there is no width left for a third control — a corner button
              there would either overlap the mark or push the mark out of the
              rail altogether. A row below the rule is the one placement that
              works at both widths, so the control never moves or changes shape
              as the sidebar opens and closes. */}
          <div className="hidden px-3 pt-3 lg:block">
            <button
              type="button"
              onClick={toggleSidebarCollapsed}
              aria-expanded={!collapsed}
              aria-controls="admin-sidebar"
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              className={cn(
                'hidden w-full items-center gap-3 rounded-lg px-3 py-2 text-label-sm font-bold uppercase tracking-wider text-shell-ink/60 transition-colors hover:bg-white/10 hover:text-white lg:flex',
                collapsed && 'lg:justify-center lg:gap-0 lg:px-0',
              )}
            >
              <Icon name="menu" className="h-5 w-5 shrink-0" />
              <span className={labelCls}>{collapsed ? 'Expand' : 'Collapse'}</span>
            </button>
          </div>

          {/* Sections */}
          <nav className="sidebar-scroll flex-1 overflow-y-auto px-3 py-3">
            {sections.map((section, index) => (
              <div key={section.id} className={index > 0 ? 'mt-6' : undefined}>
                {/* On the rail the caption has nowhere to go, so a hairline
                    takes over its separating job — the grouping survives the
                    collapse instead of vanishing with the words. In the mobile
                    drawer the caption always shows: the drawer is full width
                    whatever the desktop collapse switch was left on, which is
                    why every rule here is `lg:`-scoped. */}
                {index > 0 && collapsed ? (
                  <div className="mx-3 -mt-1 mb-4 hidden h-px bg-white/10 lg:block" />
                ) : null}
                <p
                  className={cn(
                    'px-3 pb-1.5 text-label-sm font-bold uppercase tracking-[0.16em] text-shell-ink/40',
                    collapsed && 'lg:hidden',
                  )}
                >
                  {section.label}
                </p>
                <ul className="flex flex-col gap-0.5">
                  {section.items.map((item) => (
                    <NavItem
                      key={item.id}
                      item={item}
                      count={item.badge ? badges[item.badge] : 0}
                      collapsed={collapsed}
                      labelCls={labelCls}
                      onNavigate={() => setSidebarOpen(false)}
                    />
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        {/* Footer.
            This used to read "Status: Systems Operational" beside a light that
            pulsed whatever had happened — a line that could not be wrong and so
            said nothing. Whose account is open is worth the row instead: a
            wrong-password complaint and a right-password-wrong-account complaint
            look identical from the top bar, and this settles it at a glance. */}
        <div className="bg-shell-obsidian p-4">
          <p
            title={owner?.email ? `Signed in as ${owner.email}` : 'Signed in'}
            className={cn(
              'flex items-center gap-2 px-1 text-label-sm text-shell-ink/60',
              collapsed && 'lg:justify-center lg:px-0',
            )}
          >
            <Icon name="user" className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className={labelCls}>{owner?.name || owner?.email || 'Signed in'}</span>
            {owner?.role && (
              <span className={cn('ml-auto shrink-0 rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-bold uppercase text-brand-gold', collapsed && 'lg:hidden')}>
                {owner.role}
              </span>
            )}
          </p>
        </div>
      </aside>
    </>
  )
}

export default Sidebar
