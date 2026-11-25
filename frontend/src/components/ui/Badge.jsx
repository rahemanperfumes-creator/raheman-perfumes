import cn from '@/lib/cn'
import { getTier } from '@/data/tiers'
import { Icon } from './Icon'

/**
 * Provenance badge — Original / Inspired / Mixed / Attar.
 * The tier palette is defined once in `data/tiers.js` so every surface agrees.
 */
export function TierBadge({ tier, size = 'md', showIcon = false, className }) {
  const config = getTier(tier)
  if (!config) return null

  const sizing =
    size === 'sm' ? 'px-2 py-0.5 text-[9px]' : size === 'lg' ? 'px-3.5 py-1.5 text-[11px]' : 'px-2.5 py-1'

  return (
    <span
      className={cn(
        'tier-chip',
        config.text,
        config.surface,
        config.border,
        sizing,
        className,
      )}
    >
      {showIcon && <Icon name="verified" className="h-3 w-3" strokeWidth={2} />}
      {config.label}
    </span>
  )
}

/** Generic pill for merchandising flags (Bestseller, New In, Limited…). */
export function Flag({ label, className }) {
  if (!label) return null
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-1 text-label-sm font-bold uppercase',
        className,
      )}
    >
      {label}
    </span>
  )
}

/** Small uppercase metadata chip on dark surfaces. */
export function Chip({ children, className, tone = 'neutral' }) {
  const tones = {
    neutral: 'border-white/15 bg-white/5 text-brand-cream/80',
    gold: 'border-brand-gold/40 bg-brand-night/80 text-brand-gold',
    dark: 'border-brand-border bg-brand-cream text-ink-variant',
  }
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-label-sm font-bold uppercase',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

/** Discount percentage chip — only renders when there is a real saving. */
export function SavingsBadge({ percent, className }) {
  if (!percent || percent <= 0) return null
  return (
    <span
      className={cn(
        'inline-flex items-center rounded bg-tier-original px-2 py-1 text-label-sm font-bold uppercase text-white',
        className,
      )}
    >
      {percent}% OFF
    </span>
  )
}

export default TierBadge
