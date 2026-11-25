import cn from '@/lib/cn'
import { Icon } from './Icon'
import { Button } from './Button'
import { useUiStore } from '@/store/uiStore'

/** Skeleton block for a table or panel that is still loading. */
export function Skeleton({ className }) {
  return <div className={cn('animate-pulse rounded bg-surface-high', className)} />
}

/** The placeholder a table shows while its rows are on the way. */
export function TableSkeleton({ rows = 6, columns = 5 }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <tr key={rowIndex}>
          {Array.from({ length: columns }).map((__, cellIndex) => (
            <td key={cellIndex} className="px-4 py-3">
              <Skeleton className={cn('h-4', cellIndex === 0 ? 'w-32' : 'w-20')} />
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}

/** Nothing to show — an empty table, a filtered-to-zero result, a cleared inbox. */
export function EmptyState({ icon = 'package', title, description, action, className }) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-14 text-center', className)}>
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-surface text-ink-muted">
        <Icon name={icon} className="h-5 w-5" />
      </span>
      <p className="mt-4 font-serif text-headline-sm font-semibold text-ink">{title}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

/**
 * A read that failed.
 *
 * Distinct from `EmptyState` on purpose. "Nothing here yet" and "we could not
 * ask" look identical in a table and mean opposite things — one is a fact about
 * the shop, the other is a fact about the connection — so a screen with no
 * fixtures says which one it is, and offers the retry that only the second needs.
 *
 * `refused` splits the second case again: a 401/403 means the server answered and
 * said no, which is a session problem, not an outage.
 */
export function ErrorState({ error, refused = false, onRetry, className }) {
  const heading = refused ? 'Your session has ended' : 'The server could not be reached'
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-14 text-center', className)}>
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-surface text-ink-muted">
        <Icon name={refused ? 'lock' : 'alert-circle'} className="h-5 w-5" />
      </span>
      <p className="mt-4 font-serif text-headline-sm font-semibold text-ink">{heading}</p>
      {error?.message && <p className="mt-1.5 max-w-sm text-body-sm text-ink-muted">{error.message}</p>}
      {onRetry && (
        <div className="mt-5">
          <Button variant="outline" icon="refresh" onClick={onRetry}>
            Try again
          </Button>
        </div>
      )}
    </div>
  )
}

/** One toast. Announced politely so a screen reader hears the change. */
export function Toast({ title, description, tone = 'success', onDismiss }) {
  const tones = {
    success: 'border-state-done/25 bg-brand-paper',
    error: 'border-state-halted/30 bg-brand-paper',
    info: 'border-outline-variant bg-brand-paper',
  }
  const icons = { success: 'check-circle', error: 'alert-circle', info: 'info' }
  const iconTones = { success: 'text-state-done', error: 'text-error', info: 'text-ink-variant' }

  return (
    <div
      role="status"
      className={cn(
        'pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded border p-3.5 shadow-overlay animate-slide-up',
        tones[tone] ?? tones.success,
      )}
    >
      <Icon name={icons[tone] ?? icons.success} className={cn('mt-0.5 h-4 w-4 shrink-0', iconTones[tone] ?? iconTones.success)} />
      <div className="min-w-0 flex-1">
        <p className="text-body-sm font-semibold text-ink">{title}</p>
        {description && <p className="mt-0.5 text-body-sm text-ink-muted">{description}</p>}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="shrink-0 rounded p-1 text-ink-muted transition-colors hover:bg-surface-low hover:text-ink"
      >
        <Icon name="close" className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

/**
 * Mounted once by the shell. Reads the toast queue out of the UI store, so any
 * action anywhere can raise feedback without prop-drilling a handler.
 */
export function Toaster() {
  const toasts = useUiStore((state) => state.toasts)
  const dismissToast = useUiStore((state) => state.dismissToast)

  if (toasts.length === 0) return null

  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[60] flex w-full max-w-sm flex-col gap-2">
      {toasts.map((toast) => (
        <Toast key={toast.id} {...toast} onDismiss={() => dismissToast(toast.id)} />
      ))}
    </div>
  )
}

export default Toast
