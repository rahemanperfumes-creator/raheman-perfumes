import { useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AdminShell } from '@/components/shell/AdminShell'
import LoginPage from '@/pages/LoginPage'
import DashboardPage from '@/pages/DashboardPage'
import ProductsPage from '@/pages/ProductsPage'
import CategoriesBrandsPage from '@/pages/CategoriesBrandsPage'
import OrdersPage from '@/pages/OrdersPage'
import RefundRequestsPage from '@/pages/RefundRequestsPage'
import BillingPage from '@/pages/BillingPage'
import CustomersPage from '@/pages/CustomersPage'
import RepeatCustomersPage from '@/pages/RepeatCustomersPage'
import InventoryPage from '@/pages/InventoryPage'
import OffersPage from '@/pages/OffersPage'
import ShowcaseControlPage from '@/pages/ShowcaseControlPage'
import ReviewsPage from '@/pages/ReviewsPage'
import AnalyticsPage from '@/pages/AnalyticsPage'
import SettingsPage from '@/pages/SettingsPage'
import { useSessionStore } from '@/store/sessionStore'
import { useAdminStore } from '@/store/adminStore'
import { useIdleSessionCheck } from '@/hooks/useIdleSessionCheck'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/Button'

/** Block direct URL entry to owner-only screens for bounded Staff accounts. */
function OwnerOnly({ children }) {
  const role = useSessionStore((state) => state.user?.role)
  if (role && role !== 'owner') {
    return (
      <div className="mx-auto mt-10 max-w-md rounded-lg border border-outline-variant bg-brand-paper p-6 text-center shadow-sm">
        <p className="font-serif text-headline-sm font-semibold text-ink">Owner Access Only</p>
        <p className="mt-2 text-body-sm text-ink-muted">
          This page is restricted to the Shop Owner. Staff accounts can run Counter Sale bills, pack/ship orders, and manage customer repeat benefits.
        </p>
        <div className="mt-5 flex justify-center gap-2">
          <Link to="/billing">
            <Button variant="gold" size="sm">
              Go to Counter Sale
            </Button>
          </Link>
          <Link to="/">
            <Button variant="outline" size="sm">
              Dashboard
            </Button>
          </Link>
        </div>
      </div>
    )
  }
  return children
}

/**
 * Route table.
 *
 * Paths are root-level — this app *is* the admin, so `/products` is the
 * catalogue rather than `/admin/products`, and the storefront keeps its own
 * origin at 5173.
 *
 * `AppRoutes` is exported separately from `App` so `scripts/smoke.mjs` can
 * render the tree under a `StaticRouter` — a `BrowserRouter` reads
 * `window.location`, which does not exist in Node.
 *
 * **The session gate deliberately sits in `App`, not in `AppRoutes`.** Its whole
 * job is an effect (`restore()` on mount), and effects do not run under
 * `renderToString` — so a gate inside the tree would leave the smoke test
 * staring at a "checking" splash on every route and failing every heading
 * assertion it has. Keeping it one level out means the smoke test still renders
 * the panel, and the gate still runs in a browser.
 */
export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AdminShell />}>
        <Route index element={<DashboardPage />} />
        <Route path="products" element={<ProductsPage />} />
        <Route path="categories" element={<CategoriesBrandsPage />} />
        <Route path="orders" element={<OrdersPage />} />
        <Route path="refunds" element={<OwnerOnly><RefundRequestsPage /></OwnerOnly>} />
        <Route path="billing" element={<BillingPage />} />
        <Route path="customers" element={<CustomersPage />} />
        <Route path="repeat-customers" element={<RepeatCustomersPage />} />
        <Route path="inventory" element={<InventoryPage />} />
        <Route path="offers" element={<OffersPage />} />
        <Route path="display" element={<OwnerOnly><ShowcaseControlPage /></OwnerOnly>} />
        <Route path="reviews" element={<ReviewsPage />} />
        <Route path="analytics" element={<OwnerOnly><AnalyticsPage /></OwnerOnly>} />
        <Route path="settings" element={<OwnerOnly><SettingsPage /></OwnerOnly>} />

        {/* An unknown path is a typo, not a section — send it home. */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}

/** The half-second before `/auth/me` answers. Never the panel, never a flash of it. */
function Splash() {
  return (
    <div className="min-h-screen bg-shell-obsidian grid place-items-center">
      <img
        src="/logo.png"
        alt="Raheman Perfumes"
        className="h-24 w-24 rounded-full object-contain drop-shadow-[0_0_20px_rgba(216,184,120,0.3)] animate-pulse"
      />
    </div>
  )
}

/**
 * Ask the server who we are before showing anything.
 *
 * Only a real staff session opens the panel: there is no offline identity and
 * no fixture panel to show instead, so an unreachable backend lands on the
 * sign-in screen with the failure explained.
 *
 * The pull is the other half. Every table in the panel renders from
 * `useAdminStore`, which starts empty and persists to localStorage — so without
 * this the panel would show whatever the last session left behind, even with
 * the server answering every read. It runs once the session is known good; if
 * it fails, `source` and `syncError` say so and the screens stay empty.
 */
function SessionGate({ children }) {
  const status = useSessionStore((state) => state.status)
  const restore = useSessionStore((state) => state.restore)
  const hydrate = useAdminStore((state) => state.hydrate)

  useEffect(() => {
    restore()
  }, [restore])

  /*
   * The other half of the idle timeout. `restore()` above answers "who is this?"
   * once per load; this keeps asking while the panel is open, so a session that
   * expires behind an untouched screen closes the panel instead of leaving it
   * showing data the server would no longer hand over.
   */
  useIdleSessionCheck()

  const open = status === 'signed-in'

  useEffect(() => {
    if (open) hydrate()
  }, [open, hydrate])

  if (status === 'checking') return <Splash />
  if (status === 'signed-out' || status === 'forbidden') return <LoginPage />
  return children
}

export function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <SessionGate>
        <AppRoutes />
      </SessionGate>
    </BrowserRouter>
  )
}

export default App
