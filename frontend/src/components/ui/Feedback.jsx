import cn from '@/lib/cn'
import { Icon } from './Icon'
import { Button } from './Button'
import { formatPrice, discountPercent } from '@/lib/format'

/** −/+ quantity control used in the cart, drawer and PDP. */
export function QuantityStepper({ value, onChange, min = 1, max = 99, size = 'md', className, tone = 'light' }) {
  const decrement = () => onChange(Math.max(min, value - 1))
  const increment = () => onChange(Math.min(max, value + 1))

  const dims = size === 'sm' ? 'h-8 w-8' : 'h-11 w-9 sm:h-11 sm:w-10'
  const base =
    tone === 'dark'
      ? 'border-white/15 text-brand-ivory hover:bg-white/10'
      : 'border-brand-border text-brand-charcoal hover:bg-neutral-100'

  return (
    <div className={cn('inline-flex items-center rounded border', tone === 'dark' ? 'border-white/15' : 'border-brand-border', className)}>
      <button
        type="button"
        onClick={decrement}
        disabled={value <= min}
        aria-label="Decrease quantity"
        className={cn('flex items-center justify-center rounded-l transition disabled:opacity-30 disabled:hover:bg-transparent', dims, base)}
      >
        <Icon name="minus" className="h-3.5 w-3.5" strokeWidth={2.5} />
      </button>
      <span
        className={cn(
          'min-w-[1.75rem] text-center text-body-sm font-semibold tabular-nums sm:min-w-[2.25rem]',
          tone === 'dark' ? 'text-brand-ivory' : 'text-brand-charcoal',
        )}
        aria-live="polite"
      >
        {value}
      </span>
      <button
        type="button"
        onClick={increment}
        disabled={value >= max}
        aria-label="Increase quantity"
        className={cn('flex items-center justify-center rounded-r transition disabled:opacity-30 disabled:hover:bg-transparent', dims, base)}
      >
        <Icon name="plus" className="h-3.5 w-3.5" strokeWidth={2.5} />
      </button>
    </div>
  )
}

/**
 * Price with optional MRP, discount chip and per-ml note.
 * `layout="stack"` puts the MRP above the price (cart lines); the default puts
 * them side by side (product cards).
 */
export function Price({
  price,
  mrp,
  size = 'md',
  layout = 'inline',
  showSavings = false,
  volume,
  className,
  tone = 'light',
}) {
  const percent = discountPercent(mrp, price)
  const sizes = {
    sm: 'text-body-md',
    md: 'text-body-lg',
    lg: 'text-headline-md',
    xl: 'text-headline-xl',
  }

  const priceTone = tone === 'dark' ? 'text-brand-ivory' : 'text-brand-charcoal'
  const mrpTone = tone === 'dark' ? 'text-brand-cream/50' : 'text-[#C81E1E]'

  const perMl =
    volume && price
      ? (() => {
          const ml = parseInt(String(volume).replace(/[^\d]/g, ''), 10)
          return ml > 0 ? Math.round(price / ml) : null
        })()
      : null

  return (
    <div className={cn(layout === 'stack' ? 'flex flex-col gap-1' : 'flex flex-wrap items-baseline gap-2', className)}>
      <span className={cn('font-bold tabular-nums', sizes[size], priceTone)}>{formatPrice(price)}</span>
      {percent > 0 && (
        <>
          <span className={cn('text-body-sm font-medium line-through tabular-nums', mrpTone)}>{formatPrice(mrp)}</span>
          {showSavings && (
            <span className="text-label-sm font-bold uppercase text-emerald-700">Save {formatPrice(mrp - price)}</span>
          )}
        </>
      )}
      {perMl != null && <span className={cn('text-body-sm', mrpTone)}>₹{perMl}/ml</span>}
    </div>
  )
}

/** Inline "show original price" chip used on deal cards. */
export function DiscountRibbon({ percent, className }) {
  if (!percent || percent <= 0) return null
  return (
    <span
      className={cn(
        'inline-flex items-center rounded bg-tier-original px-2.5 py-1 text-label-sm font-bold uppercase text-white',
        className,
      )}
    >
      {percent}% OFF
    </span>
  )
}

/**
 * Empty state shared by the cart, wishlist, search results and order tracking.
 * Always offers a way forward rather than dead-ending the shopper.
 */
export function EmptyState({ icon = 'bag', title, description, actionLabel, actionTo, onAction, secondary, className }) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-16 text-center', className)}>
      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full border border-brand-border bg-white">
        <Icon name={icon} className="h-7 w-7 text-brand-goldDark" strokeWidth={1.5} />
      </div>
      <h3 className="text-headline-sm font-semibold text-brand-charcoal">{title}</h3>
      {description && <p className="mt-2 max-w-md text-body-md text-brand-muted">{description}</p>}
      {(actionLabel || secondary) && (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          {actionLabel && (
            <Button variant="primary" to={actionTo} onClick={onAction}>
              {actionLabel}
            </Button>
          )}
          {secondary}
        </div>
      )}
    </div>
  )
}

/** Skeleton block used while catalogue data resolves. */
export function Skeleton({ className }) {
  return (
    <div className={cn('relative overflow-hidden rounded bg-neutral-100', className)}>
      <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.6s_infinite] bg-gradient-to-r from-transparent via-white/60 to-transparent" />
    </div>
  )
}

/** Toast card — rendered by the Toaster in the app shell. */
export function Toast({ title, description, tone = 'success', onDismiss }) {
  const tones = {
    success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    error: 'border-rose-200 bg-rose-50 text-rose-900',
    info: 'border-brand-border bg-brand-ivory text-brand-charcoal',
  }
  const icons = { success: 'check-circle', error: 'alert-circle', info: 'info' }

  return (
    <div
      role="status"
      className={cn(
        'pointer-events-auto flex w-full max-w-sm animate-slide-up items-start gap-3 rounded border px-4 py-3 shadow-overlay',
        tones[tone],
      )}
    >
      <Icon name={icons[tone]} className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="flex-1">
        <p className="text-body-sm font-semibold">{title}</p>
        {description && <p className="mt-0.5 text-body-sm opacity-80">{description}</p>}
      </div>
      <button type="button" onClick={onDismiss} className="shrink-0 rounded p-0.5 opacity-60 transition hover:opacity-100" aria-label="Dismiss">
        <Icon name="close" className="h-3.5 w-3.5" strokeWidth={2.5} />
      </button>
    </div>
  )
}

export default QuantityStepper
