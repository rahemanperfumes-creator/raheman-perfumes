/**
 * The admin's navigation — the single list the sidebar draws and every page
 * reads its own title from.
 *
 * `badge` names a live count rather than a number: the sidebar resolves it from
 * the store, so "6 Low" is always the number of fragrances actually at or below
 * their safe limit and can never go stale the way a hardcoded 6 would.
 *
 * `group` is what keeps twelve links from arriving as one undifferentiated
 * column. Four sections, in the order a shop day actually happens: what needs
 * you *now*, then the catalogue, then the people, then the levers.
 */

export const NAV_GROUPS = [
  { id: 'today', label: 'Operations' },
  { id: 'catalogue', label: 'Products & Stock' },
  { id: 'people', label: 'Customers' },
  { id: 'shop', label: 'Shop Settings' },
]

export const ADMIN_NAV = [
  // ── Today ───────────────────────────────────────────────────────────────────
  {
    id: 'dashboard',
    label: 'Dashboard',
    to: '/',
    icon: 'grid',
    group: 'today',
  },
  {
    id: 'orders',
    label: 'Orders',
    to: '/orders',
    icon: 'bag',
    group: 'today',
    badge: 'pendingOrders',
  },
  {
    id: 'refunds',
    label: 'Refund Requests',
    to: '/refunds',
    icon: 'card',
    group: 'today',
    ownerOnly: true,
  },
  {
    id: 'billing',
    label: 'Counter Sale',
    to: '/billing',
    icon: 'receipt',
    group: 'today',
  },

  // ── Catalogue ───────────────────────────────────────────────────────────────
  {
    id: 'products',
    label: 'Products',
    to: '/products',
    icon: 'package',
    group: 'catalogue',
  },
  {
    id: 'categories',
    label: 'Categories & Brands',
    to: '/categories',
    icon: 'layers',
    group: 'catalogue',
  },
  {
    id: 'inventory',
    label: 'Stock',
    to: '/inventory',
    icon: 'warehouse',
    group: 'catalogue',
    badge: 'lowStock',
  },

  // ── Customers ───────────────────────────────────────────────────────────────
  {
    id: 'customers',
    label: 'Online Customers',
    to: '/customers',
    icon: 'users',
    group: 'people',
  },
  {
    id: 'repeat-customers',
    label: 'Repeat Customers',
    to: '/repeat-customers',
    icon: 'history',
    group: 'people',
  },
  {
    id: 'reviews',
    label: 'Reviews',
    to: '/reviews',
    icon: 'star',
    group: 'people',
  },

  // ── Shop ────────────────────────────────────────────────────────────────────
  {
    id: 'offers',
    label: 'Offers & Coupons',
    to: '/offers',
    icon: 'tag',
    group: 'shop',
  },
  {
    id: 'display',
    label: 'Website Display',
    to: '/display',
    icon: 'sliders',
    group: 'shop',
    ownerOnly: true,
  },
  {
    id: 'analytics',
    label: 'Reports',
    to: '/analytics',
    icon: 'analytics',
    group: 'shop',
    ownerOnly: true,
  },
  {
    id: 'settings',
    label: 'Settings',
    to: '/settings',
    icon: 'settings',
    group: 'shop',
    ownerOnly: true,
  },
]

/** The page behind a route, so a screen can read its own label. */
export const navEntryFor = (path) => ADMIN_NAV.find((item) => item.to === path)

export default ADMIN_NAV
