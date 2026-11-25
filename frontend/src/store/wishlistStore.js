import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { authService } from '@/services/authService'
import { useCatalogueStore } from '@/store/catalogueStore'
import { useAuthStore } from '@/store/authStore'
import { imageUrls } from '@/data/productImages'

/**
 * The wishlist.
 *
 * This store holds **rich product records**, not ids — every field the wishlist
 * page renders — so that the page works offline and without a second lookup for
 * each row. The backend, meanwhile, stores a list of product ids on the
 * customer. Those are two different things and the local one is the render
 * source.
 *
 * So the sync runs **one way, and deliberately**: local → server, whenever the
 * list changes and the session is live. `PUT /account/wishlist` replaces the
 * whole list, which is both idempotent and self-healing, and it is the route the
 * backend provides for exactly this shape of client.
 *
 * There is **no pull**, and the reason is worth stating rather than hiding:
 * `GET /account/wishlist` answers with id strings, and this app has no
 * product-by-id lookup — only by slug. Pulling would therefore put rows into the
 * list that the page cannot render. A wishlist that survives a new device needs
 * a by-id fetch on the server first; until that exists, the server copy is a
 * durable backstop rather than a second source of truth.
 *
 * One more honest limit: `customers.setWishlist` keeps only ids that are real
 * ObjectIds. With no backend running every id here is a fixture id (`p-101`), so
 * those pushes store an empty list. That is harmless — nothing is read back —
 * but it is why the wire only carries anything once the catalogue itself is
 * being served live.
 */
export const useWishlistStore = create(
  persist(
    (set, get) => ({
      items: [],

      has(productId) {
        if (!productId) return false
        const id = String(productId?.id ?? productId?._id ?? productId)
        return get().items.some((item) => String(item.productId ?? item.id ?? '') === id)
      },

      toggle(product) {
        if (!product) return false
        const id = String(product.id ?? product._id ?? '')
        const exists = get().has(id)
        if (exists) {
          set((state) => ({ items: state.items.filter((item) => String(item.productId ?? item.id ?? '') !== id) }))
          get().push()
          return false
        }
        set((state) => ({
          items: [
            ...state.items,
            {
              productId: id,
              slug: product.slug,
              name: product.name,
              brand: product.brand,
              tier: product.tier,
              price: product.price,
              mrp: product.mrp,
              volume: product.volumes?.[0]?.size ?? '50ml',
              notes: product.notes ?? [],
              /* The photograph, for the same reason the cart keeps one: the row
               * renders from this snapshot after a reload, and without it the
               * saved fragrance falls back to the stand-in flacon. */
              images: imageUrls(product),
              rating: product.rating,
              reviewCount: product.reviewCount,
              inStock: product.inStock ?? true,
              addedAt: new Date().toISOString(),
            },
          ],
        }))
        get().push()
        return true
      },

      /**
       * Give saved rows the picture they were hearted under.
       *
       * Same reasoning as the cart's backfill: hearts pressed before the
       * photograph travelled with the record — and any pressed while the
       * catalogue was still loading — are healed from the live list. Only the
       * picture is touched; the row's price is its own snapshot.
       */
      backfillImages() {
        const { byId, bySlug } = useCatalogueStore.getState()
        let changed = false
        const items = get().items.map((item) => {
          if (item.images?.length) return item
          const images = imageUrls(byId[item.productId] ?? bySlug[item.slug])
          if (!images.length) return item
          changed = true
          return { ...item, images }
        })
        if (changed) set({ items })
      },

      remove(productId) {
        if (!productId) return
        const id = String(productId?.id ?? productId?._id ?? productId)
        set((state) => ({ items: state.items.filter((item) => String(item.productId ?? item.id ?? '') !== id) }))
        get().push()
      },

      clear() {
        set({ items: [] })
        get().push()
      },

      count() {
        return get().items.length
      },

      /**
       * Hand the list to the account, if there is a live account to hand it to.
       *
       * Fired and forgotten on purpose: a heart tap must not wait on the network,
       * and a wishlist the server did not accept is a far smaller problem than a
       * heart that spins. A signed-out or offline shopper keeps the list locally,
       * exactly as before.
       */
      push() {
        if (useAuthStore.getState().source !== 'live') return
        authService
          .setWishlist(get().items.map((item) => item.productId))
          .catch(() => {
            // Nothing to tell the shopper: their list is intact either way, and
            // the next change pushes the whole thing again.
          })
      },
    }),
    { name: 'rehman.wishlist', storage: createJSONStorage(() => localStorage), version: 1 },
  ),
)

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === 'rehman.wishlist') {
      useWishlistStore.persist?.rehydrate?.()
    }
  })
}

export default useWishlistStore

