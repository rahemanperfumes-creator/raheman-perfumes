import { useCallback, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import cn from '@/lib/cn'
import { Icon } from './Icon'

/**
 * Overlays.
 *
 * Both implement Escape-to-close, a focus trap and a ref-counted body scroll
 * lock, matching the storefront's overlays so the two apps behave identically.
 * The lock is ref-counted because a modal can open on top of a drawer, and the
 * inner one closing must not unlock the page underneath.
 */

let lockCount = 0

export function useScrollLock(active) {
  useEffect(() => {
    if (!active) return undefined
    lockCount += 1
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    return () => {
      lockCount -= 1
      if (lockCount === 0) document.body.style.overflow = overflow
    }
  }, [active])
}

/** Escape closes, and Tab cycles within the panel rather than escaping it. */
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
        event.stopPropagation()
        onCloseRef.current?.()
        return
      }
      if (event.key !== 'Tab') return

      const panel = panelRef.current
      if (!panel) return
      const focusable = panel.querySelectorAll(
        'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
      )
      if (focusable.length === 0) return

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

    // Move focus into the modal ONCE upon opening.
    // If the user already has focus inside an input in the modal, NEVER steal or reset focus!
    let timer = null
    if (!hasFocusedRef.current) {
      hasFocusedRef.current = true
      timer = setTimeout(() => {
        const panel = panelRef.current
        if (!panel) return
        if (panel.contains(document.activeElement)) return
        const target =
          panel.querySelector('[data-autofocus]') ??
          panel.querySelector('input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])')
        target?.focus?.()
      }, 50)
    }

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      if (timer) clearTimeout(timer)
    }
  }, [open, panelRef])
}

/** Centred dialog for forms. */
export function Modal({ open, onClose, title, description, children, footer, actions, size = 'md', className }) {
  const panelRef = useRef(null)
  useScrollLock(open)
  useDialogBehaviour(open, onClose, panelRef)

  if (!open) return null

  const modalFooter = footer || actions

  const sizes = {
    sm: 'max-w-md',
    md: 'max-w-2xl',
    lg: 'max-w-4xl',
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:items-center">
      <div className="fixed inset-0 bg-shell-obsidian/45 backdrop-blur-[2px] animate-fade-in" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          'relative my-auto flex max-h-[calc(100vh-2rem)] w-full flex-col overflow-hidden rounded border border-outline-variant bg-brand-paper shadow-overlay animate-scale-in',
          sizes[size] ?? sizes.md,
          className,
        )}
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-outline-variant/60 px-5 py-4">
          <div>
            <h2 className="font-serif text-headline-sm font-semibold text-ink">{title}</h2>
            {description && <p className="mt-0.5 text-body-sm text-ink-muted">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded p-1.5 text-ink-muted transition-colors hover:bg-surface-low hover:text-ink"
          >
            <Icon name="close" className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-5">{children}</div>

        {modalFooter && (
          <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-outline-variant/60 bg-surface-low/60 px-5 py-3.5">
            {modalFooter}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  )
}

/** Right-hand sheet for inspecting one record without leaving the list. */
export function Drawer({ open, onClose, title, subtitle, children, footer, actions, width = 'max-w-lg' }) {
  const panelRef = useRef(null)
  useScrollLock(open)

  const close = useCallback(() => onClose(), [onClose])
  useDialogBehaviour(open, close, panelRef)

  if (!open) return null

  const modalFooter = footer || actions

  return createPortal(
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-shell-obsidian/40 backdrop-blur-[2px] animate-fade-in" onClick={close} aria-hidden="true" />
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn('absolute right-0 top-0 flex h-full w-full flex-col border-l border-outline-variant bg-brand-paper shadow-overlay animate-slide-in-right', width)}
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-outline-variant/60 px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate font-serif text-headline-sm font-semibold text-ink">{title}</h2>
            {subtitle && <p className="mt-0.5 truncate text-body-sm text-ink-muted">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="rounded p-1.5 text-ink-muted transition-colors hover:bg-surface-low hover:text-ink"
          >
            <Icon name="close" className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-5">{children}</div>

        {modalFooter && (
          <footer className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-outline-variant/60 bg-surface-low/60 px-5 py-3.5">
            {modalFooter}
          </footer>
        )}
      </aside>
    </div>,
    document.body,
  )
}

export default Modal
