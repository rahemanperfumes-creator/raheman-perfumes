import cn from '@/lib/cn'

/**
 * Every status pill in the panel.
 *
 * One lookup keyed by the lowercase status string, so an order's "Shipped", a
 * product's "Active" and a brand's "Stocked" all resolve their colour the same
 * way and a new status only has to be taught once. Unknown values fall back to
 * the neutral tone rather than rendering unstyled.
 */

const TONES = {
  done: 'bg-state-doneSurface text-state-done ring-state-done/20',
  active: 'bg-state-activeSurface text-state-active ring-state-active/20',
  pending: 'bg-state-pendingSurface text-state-pending ring-state-pending/20',
  halted: 'bg-state-haltedSurface text-state-halted ring-state-halted/20',
  gold: 'bg-brand-gold/25 text-brand-goldInk ring-brand-gold/40',
  muted: 'bg-surface text-ink-muted ring-outline-variant/50',
}

const STATUS_TONES = {
  // Order fulfilment
  pending: 'pending',
  packed: 'active',
  shipped: 'active',
  delivered: 'done',
  cancelled: 'halted',
  // Payment
  paid: 'done',
  'cod pending': 'pending',
  refunded: 'halted',
  failed: 'halted',
  // Product lifecycle
  active: 'done',
  draft: 'pending',
  archived: 'muted',
  // Coupon state — derived from `active` and the start/end window
  live: 'done',
  scheduled: 'pending',
  expired: 'halted',
  inactive: 'muted',
  // Stock health
  healthy: 'done',
  watch: 'pending',
  low: 'pending',
  depleted: 'halted',
  'out of stock': 'halted',
  // Customers and maisons
  vip: 'gold',
  blocked: 'halted',
  stocked: 'done',
  paused: 'pending',
  discontinued: 'muted',
  hidden: 'pending',
}

const DOTS = {
  done: 'bg-state-done',
  active: 'bg-state-active',
  pending: 'bg-state-pending',
  halted: 'bg-state-halted',
  gold: 'bg-brand-goldDark',
  muted: 'bg-outline',
}

export function StatusPill({ status, dot = true, className }) {
  if (!status) return null
  const tone = STATUS_TONES[String(status).toLowerCase()] ?? 'muted'
  return (
    <span className={cn('pill ring-1 ring-inset', TONES[tone], className)}>
      {dot && <span className={cn('h-1.5 w-1.5 rounded-full', DOTS[tone])} aria-hidden="true" />}
      {status}
    </span>
  )
}

/** Provenance badge — Original / Inspired / Mixed / Attar / Combo. */
export function TierBadge({ tier, className }) {
  const tones = {
    Original: 'border-tier-original/25 bg-tier-originalSurface text-tier-original',
    Inspired: 'border-tier-inspired/25 bg-tier-inspiredSurface text-tier-inspired',
    Mixed: 'border-tier-mixed/25 bg-tier-mixedSurface text-tier-mixed',
    Attar: 'border-brand-goldDark/30 bg-brand-gold/15 text-brand-goldInk',
    Combo: 'border-emerald-700/25 bg-emerald-50 text-emerald-800',
    Bakhoor: 'border-amber-800/25 bg-amber-50 text-amber-900',
    'Car Perfume': 'border-sky-700/25 bg-sky-50 text-sky-800',
  }
  return (
    <span className={cn('tier-chip', tones[tier] ?? tones.Combo, className)}>{tier}</span>
  )
}

/**
 * Stock on hand as a bar against its safe limit. The bar caps at double the
 * limit so a healthy row still reads as "full" rather than as an ever-growing
 * line, and the colour follows the same rule as `stockState`.
 */
export function StockBar({ stock, safeLimit, className }) {
  const limit = safeLimit || 1
  const fill = Math.min(100, Math.round((stock / (limit * 2)) * 100))
  const tone = stock <= 0 ? 'bg-error' : stock <= limit ? 'bg-brand-goldDark' : 'bg-state-done'

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-surface-high" role="presentation">
        <div className={cn('h-full rounded-full transition-[width] duration-300', tone)} style={{ width: `${fill}%` }} />
      </div>
      <span className="tabular text-body-sm font-semibold text-ink">{stock}</span>
    </div>
  )
}

/** Small neutral label — counts, tags, "3 New". */
export function Chip({ children, tone = 'neutral', className }) {
  const tones = {
    neutral: 'bg-surface text-ink-variant',
    gold: 'bg-brand-gold/25 text-brand-goldInk',
    dark: 'bg-shell-obsidian text-surface-low',
    error: 'bg-error text-white',
  }
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-label-sm font-bold uppercase tracking-wider', tones[tone], className)}>
      {children}
    </span>
  )
}

export default StatusPill
