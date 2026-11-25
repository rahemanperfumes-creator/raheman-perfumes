import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

let toastId = 0

/**
 * Chrome that is shared by every page: overlays, the mobile nav, and the
 * lightweight toast queue used for "Added to bag" style confirmations.
 * Session-scoped: tracks recently viewed products and active browse state in sessionStorage.
 */
export const useUiStore = create(
  persist(
    (set, get) => ({
      cartDrawerOpen: false,
      mobileMenuOpen: false,
      searchOpen: false,
      /** Recently viewed product ids, newest first. Rendered as a rail on the PDP. */
      recentlyViewed: [],
      toasts: [],

      openCartDrawer: () => set({ cartDrawerOpen: true, mobileMenuOpen: false, searchOpen: false }),
      closeCartDrawer: () => set({ cartDrawerOpen: false }),
      toggleCartDrawer: (open) => set({ cartDrawerOpen: open ?? !get().cartDrawerOpen }),

      openMobileMenu: () => set({ mobileMenuOpen: true }),
      closeMobileMenu: () => set({ mobileMenuOpen: false }),

      openSearch: () => set({ searchOpen: true, mobileMenuOpen: false }),
      closeSearch: () => set({ searchOpen: false }),
      toggleSearch: (open) => set({ searchOpen: open ?? !get().searchOpen }),

      /** Close every overlay at once — used on route change and on Escape. */
      closeAllOverlays: () =>
        set({ cartDrawerOpen: false, mobileMenuOpen: false, searchOpen: false }),

      trackView(productId) {
        set((state) => ({
          recentlyViewed: [productId, ...state.recentlyViewed.filter((id) => id !== productId)].slice(0, 8),
        }))
      },

      pushToast({ title, description, tone = 'success', duration = 3200 }) {
        const id = ++toastId
        set((state) => ({ toasts: [...state.toasts, { id, title, description, tone }] }))
        if (duration > 0) {
          setTimeout(() => get().dismissToast(id), duration)
        }
        return id
      },

      dismissToast(id) {
        set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) }))
      },
    }),
    {
      name: 'rehman.session_ui',
      storage: createJSONStorage(() => sessionStorage),
      partialize: (state) => ({
        recentlyViewed: state.recentlyViewed,
      }),
    },
  ),
)

/** Convenience for the many "added to bag" call sites. */
export const toast = (payload) => useUiStore.getState().pushToast(payload)

export default useUiStore
