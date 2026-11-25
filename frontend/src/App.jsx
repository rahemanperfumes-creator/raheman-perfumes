import { useEffect } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from '@/components/layout/Layout'
import { SmoothScroll } from '@/components/providers/SmoothScroll'
import { useAuthStore } from '@/store/authStore'
import { useCatalogueStore } from '@/store/catalogueStore'
import { useCartStore } from '@/store/cartStore'
import { useWishlistStore } from '@/store/wishlistStore'
import { useIdleSessionCheck } from '@/hooks/useIdleSessionCheck'
import { HomePage } from '@/pages/HomePage'
import { ShopPage, OriginalPerfumesPage, InspiredMixingPage } from '@/pages/ShopPage'
import { ProductDetailPage } from '@/pages/ProductDetailPage'
import { SearchResultsPage } from '@/pages/SearchResultsPage'
import { CombosPage } from '@/pages/CombosPage'
import { CartPage } from '@/pages/CartPage'
import { CheckoutPage } from '@/pages/CheckoutPage'
import { WishlistPage } from '@/pages/WishlistPage'
import { AccountPage } from '@/pages/AccountPage'
import { SignInPage } from '@/pages/SignInPage'
import { ResetPasswordPage } from '@/pages/ResetPasswordPage'
import { OrderTrackingPage } from '@/pages/OrderTrackingPage'
import { OffersPage } from '@/pages/OffersPage'
import { ContentPage } from '@/pages/ContentPage'
import { NotFoundPage } from '@/pages/NotFoundPage'

/**
 * Customer-facing storefront routes.
 *
 * Admin screens live in `../admin` and the API/ database in `../backend`; this
 * app only ever renders the shopper's side of the house.
 */
export function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />

        {/* Catalogue — the static collection routes are declared before the
            dynamic one so they always win the match. */}
        <Route path="shop" element={<ShopPage />} />
        <Route path="shop/originals" element={<OriginalPerfumesPage />} />
        <Route path="shop/inspired" element={<InspiredMixingPage />} />
        <Route path="shop/:collection" element={<ShopPage />} />
        <Route path="product/:slug" element={<ProductDetailPage />} />
        <Route path="search" element={<SearchResultsPage />} />
        <Route path="offers" element={<OffersPage />} />
        <Route path="combos" element={<CombosPage />} />

        {/* Transaction */}
        <Route path="cart" element={<CartPage />} />
        <Route path="checkout" element={<CheckoutPage />} />
        <Route path="wishlist" element={<WishlistPage />} />

        {/* Account */}
        <Route path="account" element={<AccountPage />} />
        <Route path="sign-in" element={<SignInPage />} />
        <Route path="reset-password" element={<ResetPasswordPage />} />
        <Route path="track-order" element={<OrderTrackingPage />} />

        {/* Editorial + legal */}
        <Route path="pages/:slug" element={<ContentPage />} />

        {/* Legacy aliases kept so old links keep working */}
        <Route path="originals" element={<Navigate to="/shop/originals" replace />} />
        <Route path="inspired" element={<Navigate to="/shop/inspired" replace />} />
        <Route path="track" element={<Navigate to="/track-order" replace />} />
        <Route path="wishlist/:anything" element={<Navigate to="/wishlist" replace />} />

        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}

export function App() {
  const restore = useAuthStore((state) => state.restore)
  const hydrateCatalogue = useCatalogueStore((state) => state.hydrate)

  /*
   * Ask the server who we are, once, per load.
   *
   * This has to happen here rather than inside `AppRoutes`: the render smoke
   * test mounts `AppRoutes` under a `StaticRouter`, where effects never run, and
   * a bootstrap living inside the tree would leave every assertion looking at a
   * store that had not yet heard from anyone.
   *
   * Nothing is gated on the answer — a guest browses the whole shop — so this is
   * a fetch, not a gate. What it buys is that a returning patron's session is
   * re-derived from the httpOnly cookie instead of from localStorage, which is
   * the only thing that makes server-side revocation mean anything.
   */
  useEffect(() => {
    restore().then(() => {
      // A wishlist saved before signing in belongs to the account that just
      // turned up, so hand it over once the session is known. Read through
      // `getState` rather than a hook: this store must not become a second
      // subscription, and the call is fire-and-forget by design.
      useWishlistStore.getState().push()
    })
  }, [restore])

  /*
   * Load the catalogue from the API, once, per load.
   *
   * Same placement reasoning as `restore()` above, and the same shape: the shop
   * renders immediately against the catalogue the store already holds and
   * swaps in the server's list when it arrives. Nothing is gated on it.
   *
   * This is what makes a fragrance created in the admin panel reachable on the
   * website at all. Every listing surface reads the store, and the store's
   * opening value is the bundled catalogue — which the build froze long before
   * that fragrance existed.
   */
  useEffect(() => {
    useCartStore.getState().syncPricing?.()
    hydrateCatalogue().then(() => {
      useCartStore.getState().syncPricing?.()
      useCartStore.getState().backfillImages()
      useWishlistStore.getState().backfillImages()
    })
  }, [hydrateCatalogue])

  /*
   * The other half of the idle timeout. `restore()` above asks "who is this?"
   * once per load; this keeps asking while the shop is open, so a session that
   * expires behind an untouched account page clears itself rather than leaving
   * the shopper reading their own orders out of a store the server has stopped
   * standing behind.
   */
  useIdleSessionCheck()

  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      {/* Inside the router, so route changes can be handed to Lenis; outside the
          shell, so the engine outlives every page transition. */}
      <SmoothScroll>
        <AppRoutes />
      </SmoothScroll>
    </BrowserRouter>
  )
}

export default App
