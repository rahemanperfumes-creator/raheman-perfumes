import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useLenis } from 'lenis/react'
import cn from '@/lib/cn'
import { Icon } from './Icon'

/** Locks body scroll while any overlay is open, ref-counted. */
let lockCount = 0
function useScrollLock(active) {
  const lenis = useLenis()

  useEffect(() => {
    if (!active) return undefined
    lockCount += 1
    const { overflow, paddingRight } = document.body.style
    const gap = window.innerWidth - document.documentElement.clientWidth
    document.body.style.overflow = 'hidden'
    if (gap > 0) document.body.style.paddingRight = `${gap}px`

    // Hiding overflow is not enough on its own: Lenis reads wheel events
    // directly, so without this the page carries on scrolling behind the
    // overlay and is simply invisible while it does. `stop()` is idempotent and
    // ref-counting is handled by `lockCount` below, so nested overlays unwind
    // cleanly — only the last one out restarts the engine.
    lenis?.stop()

    return () => {
      lockCount -= 1
      if (lockCount === 0) {
        document.body.style.overflow = overflow
        document.body.style.paddingRight = paddingRight
        lenis?.start()
      }
    }
  }, [active, lenis])
}

/** Calls `onClose` on Escape, and traps Tab focus inside the panel. */
function useDialogBehaviour(open, onClose, panelRef) {
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  const hasFocusedRef = useRef(false)

  useEffect(() => {
    if (!open) {
      hasFocusedRef.current = false
      return undefined
    }

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        onCloseRef.current?.()
        return
      }
      if (event.key !== 'Tab' || !panelRef.current) return

      const focusable = panelRef.current.querySelectorAll(
        'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
      )
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)

    let timer = null
    if (!hasFocusedRef.current) {
      hasFocusedRef.current = true
      timer = setTimeout(() => {
        if (!panelRef.current) return
        if (panelRef.current.contains(document.activeElement)) return
        const target = panelRef.current.querySelector('[data-autofocus]') ?? panelRef.current
        target?.focus?.()
      }, 40)
    }

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      if (timer) clearTimeout(timer)
    }
  }, [open, panelRef])
}

/** Centred modal dialog. Renders into a portal above everything else. */
export function Modal({ open, onClose, title, description, children, footer, size = 'md', className }) {
  const panelRef = useRef(null)
  useScrollLock(open)
  useDialogBehaviour(open, onClose, panelRef)

  if (!open) return null

  const widths = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl',
    full: 'max-w-6xl',
  }

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center p-0 sm:items-center sm:p-6">
      <div
        className="absolute inset-0 animate-fade-in bg-brand-charcoal/40 backdrop-blur-[8px]"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        tabIndex={-1}
        className={cn(
          'relative z-10 max-h-[92vh] w-full animate-slide-up overflow-hidden rounded-t-xl bg-brand-ivory shadow-overlay sm:rounded-xl',
          widths[size] ?? widths.md,
          className,
        )}
      >
        {(title || onClose) && (
          <div className="flex items-start justify-between gap-4 border-b border-brand-border px-6 py-5">
            <div>
              {title && <h3 className="text-headline-sm font-semibold text-brand-charcoal">{title}</h3>}
              {description && <p className="mt-1 text-body-sm text-brand-muted">{description}</p>}
            </div>
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="-mr-1 shrink-0 rounded-full p-2 text-brand-muted transition hover:bg-neutral-100 hover:text-brand-charcoal"
                aria-label="Close dialog"
              >
                <Icon name="close" className="h-4 w-4" strokeWidth={2} />
              </button>
            )}
          </div>
        )}
        <div className="max-h-[calc(92vh-9rem)] overflow-y-auto px-6 py-5">{children}</div>
        {footer && (
          <div className="border-t border-brand-border bg-white px-6 py-4">{footer}</div>
        )}
      </div>
    </div>,
    document.body,
  )
}

/** Side panel. `side="right"` is the cart drawer; `"left"` is the mobile nav. */
export function Drawer({ open, onClose, side = 'right', title, children, footer, className, width = 'max-w-md' }) {
  const panelRef = useRef(null)
  useScrollLock(open)
  useDialogBehaviour(open, onClose, panelRef)

  if (!open) return null

  return createPortal(
    <div className="fixed inset-0 z-[65]">
      <div
        className="absolute inset-0 animate-fade-in bg-brand-charcoal/40 backdrop-blur-[8px]"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        tabIndex={-1}
        className={cn(
          'absolute inset-y-0 flex w-full flex-col bg-brand-ivory shadow-overlay',
          width,
          side === 'right' ? 'right-0 animate-slide-in-right' : 'left-0 animate-slide-in-left',
          className,
        )}
      >
        {children}
      </div>
    </div>,
    document.body,
  )
}

export { useScrollLock }
export default Modal
