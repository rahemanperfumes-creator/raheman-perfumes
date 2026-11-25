import cn from '@/lib/cn'
import { Icon } from './Icon'

/** Read-only star rating. Uses half-star precision via a clipped overlay. */
export function Rating({ value = 0, count, size = 'md', showValue = true, tone = 'light', className }) {
  const stars = [1, 2, 3, 4, 5]
  const dims = { sm: 'w-3 h-3', md: 'w-3.5 h-3.5', lg: 'w-4 h-4' }[size] ?? 'w-3.5 h-3.5'
  const percent = Math.max(0, Math.min(100, (value / 5) * 100))
  const valueTone = tone === 'dark' ? 'text-brand-cream/80' : 'text-ink-variant'
  const countTone = tone === 'dark' ? 'text-brand-cream/50' : 'text-brand-muted'
  const emptyTone = tone === 'dark' ? 'text-white/20' : 'text-brand-border'

  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      <div className="relative inline-flex" role="img" aria-label={`${value} out of 5 stars`}>
        <div className={cn('flex gap-0.5', emptyTone)}>
          {stars.map((star) => (
            <Icon key={star} name="star" className={dims} />
          ))}
        </div>
        <div
          className="absolute inset-0 flex gap-0.5 overflow-hidden text-brand-goldDark"
          style={{ width: `${percent}%` }}
        >
          {stars.map((star) => (
            <Icon key={star} name="star" className={cn(dims, 'shrink-0')} />
          ))}
        </div>
      </div>
      {showValue && <span className={cn('text-body-sm font-medium', valueTone)}>{value.toFixed(1)}</span>}
      {count != null && <span className={cn('text-body-sm', countTone)}>({count})</span>}
    </div>
  )
}

/** Interactive star input used by the "Write a review" form. */
export function RatingInput({ value, onChange, size = 'lg' }) {
  const dims = size === 'lg' ? 'w-6 h-6' : 'w-5 h-5'
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onChange(star)}
          aria-label={`Rate ${star} star${star > 1 ? 's' : ''}`}
          className="rounded p-0.5 transition hover:scale-110"
        >
          <Icon
            name="star"
            className={cn(dims, star <= value ? 'text-brand-goldDark' : 'text-brand-border')}
          />
        </button>
      ))}
    </div>
  )
}

/** The 5-bar histogram shown beside the PDP review summary. */
export function RatingBreakdown({ rows, total }) {
  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div key={row.star} className="flex items-center gap-3 text-body-sm">
          <span className="w-8 shrink-0 text-ink-variant">{row.star}★</span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-brand-surface">
            <div className="h-full rounded-full bg-brand-gold" style={{ width: `${row.percent}%` }} />
          </div>
          <span className="w-10 shrink-0 text-right text-brand-muted">
            {row.count || (row.percent ? `${row.percent}%` : '0')}
          </span>
        </div>
      ))}
      {total != null && <p className="pt-1 text-body-sm text-brand-muted">{total} verified reviews</p>}
    </div>
  )
}

export default Rating
