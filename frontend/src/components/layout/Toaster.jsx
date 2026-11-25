import { createPortal } from 'react-dom'
import cn from '@/lib/cn'
import useUiStore from '@/store/uiStore'
import { Toast } from '@/components/ui/Feedback'

/** Fixed toast stack. Mounted once by the app shell. */
export function Toaster() {
  const toasts = useUiStore((state) => state.toasts)
  const dismissToast = useUiStore((state) => state.dismissToast)
  const cartDrawerOpen = useUiStore((state) => state.cartDrawerOpen)

  if (!toasts.length) return null

  return createPortal(
    <div
      className={cn(
        'pointer-events-none fixed z-[80] flex w-[calc(100%-2.5rem)] max-w-sm flex-col gap-2 sm:w-full',
        cartDrawerOpen ? 'top-16 right-4 md:top-auto md:bottom-5 md:right-[27.5rem]' : 'bottom-5 right-5',
      )}
      aria-live="polite"
    >
      {toasts.map((toast) => (
        <Toast
          key={toast.id}
          title={toast.title}
          description={toast.description}
          tone={toast.tone}
          onDismiss={() => dismissToast(toast.id)}
        />
      ))}
    </div>,
    document.body,
  )
}

export default Toaster
