import { create } from 'zustand'

/**
 * Interface state: toasts, the command palette and the two sidebar states.
 *
 * Deliberately not persisted — a stale toast or an open drawer restored on
 * reload would be a bug, not a convenience. The collapsed rail is held to the
 * same bargain: it opens expanded on every load rather than being remembered.
 */

let toastSeq = 0

export const useUiStore = create((set, get) => ({
  toasts: [],
  commandOpen: false,
  sidebarOpen: false,
  /**
   * The desktop icon rail. Deliberately *not* the same flag as `sidebarOpen`,
   * which is the mobile drawer: on a phone there is no rail to collapse, and one
   * shared flag would leave the drawer 4.5rem wide for anyone who had collapsed
   * the rail before shrinking the window.
   */
  sidebarCollapsed: false,

  /**
   * Raise a toast. Pass `tone: 'error'` for failures; anything else is treated
   * as a success. `dismissAfter` of 0 keeps it until dismissed by hand, which
   * is what an error with a next step needs.
   */
  pushToast: ({ title, description = '', tone = 'success', dismissAfter = 4000 }) => {
    toastSeq += 1
    const id = `toast-${toastSeq}`
    set((state) => ({ toasts: [...state.toasts, { id, title, description, tone }] }))
    if (dismissAfter > 0) {
      setTimeout(() => get().dismissToast(id), dismissAfter)
    }
    return id
  },

  dismissToast: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),

  setCommandOpen: (open) => set({ commandOpen: open }),
  toggleCommand: () => set((state) => ({ commandOpen: !state.commandOpen })),

  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),

  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
  toggleSidebarCollapsed: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
}))

export default useUiStore
