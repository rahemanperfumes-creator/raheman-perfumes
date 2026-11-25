import { useId } from 'react'
import cn from '@/lib/cn'
import { formatCompactINR } from '@/lib/format'

/**
 * Charts, drawn as SVG by hand.
 *
 * The panel needs a sparkline, a bar chart and some share bars — not a charting
 * library. Shipping one would add more bytes than the whole admin bundle to
 * draw three shapes, and every one of them would still need restyling to match
 * the house palette.
 */

/** Turn a series of numbers into the `d` attribute of a polyline over 0–100. */
function linePath(values, width = 100, height = 32) {
  if (values.length < 2) return ''
  const max = Math.max(...values)
  const min = Math.min(...values)
  const span = max - min || 1
  return values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * width
      const y = height - ((value - min) / span) * height
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`
    })
    .join(' ')
}

/**
 * Inline trend line. `area` fills beneath the stroke, which is what makes a
 * 32px-tall chart readable at a glance.
 */
export function Sparkline({ values = [], className, tone = 'gold', area = true, strokeWidth = 1.75 }) {
  const gradientId = useId()
  const path = linePath(values)
  if (!path) return null

  const strokes = {
    gold: 'text-brand-goldDark',
    done: 'text-state-done',
    halted: 'text-state-halted',
    active: 'text-state-active',
  }

  return (
    <svg
      viewBox="0 0 100 32"
      preserveAspectRatio="none"
      className={cn('h-8 w-full', strokes[tone] ?? strokes.gold, className)}
      aria-hidden="true"
    >
      {area && (
        <>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.22" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={`${path} L100 32 L0 32 Z`} fill={`url(#${gradientId})`} />
        </>
      )}
      <path d={path} fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

/**
 * Column chart with a hover tooltip and an axis of rupees. Bars are drawn from
 * the same series the tiles sum, so the two can never disagree.
 *
 * @param {{date: string, revenue: number, orders: number}[]} data
 */
export function BarChart({ data = [], className, height = 200 }) {
  if (data.length === 0) return null

  const max = Math.max(...data.map((d) => d.revenue))
  const total = data.reduce((sum, d) => sum + d.revenue, 0)
  // Only every nth label is drawn, so a 90-day axis does not turn into mush.
  const labelEvery = Math.max(1, Math.ceil(data.length / 8))
  // Past about six weeks a bare day number is ambiguous — `20` could be July or
  // August — so a long window carries the month as well. Both forms fit, because
  // `labelEvery` holds the number of labels at eight however many bars there are.
  const labelOf = data.length > 45 ? (date) => date.slice(5) : (date) => date.slice(8)
  // The gap has to give way before the columns do. A year is 365 columns and 364
  // three-pixel gaps — more gap than the panel is wide, so every column collapses
  // to zero and the year view draws blank under a caption that still reads
  // "₹2.13L over 365 days". Past ~120 bars the columns simply touch. The axis
  // below shares this value, so its labels stay under their own columns.
  const columnGap = data.length > 120 ? 0 : 3

  return (
    <div className={cn('w-full', className)}>
      <div className="flex items-end" style={{ height, gap: columnGap }}>
        {data.map((day, index) => {
          const percent = max ? (day.revenue / max) * 100 : 0
          return (
            <div key={day.date} className="group relative flex h-full flex-1 items-end">
              <div
                className="w-full rounded-t-sm bg-brand-gold/45 transition-colors duration-150 group-hover:bg-brand-goldDark"
                style={{ height: `${Math.max(percent, 1.5)}%` }}
              />
              {/* Tooltip. `pointer-events-none` keeps it from stealing the hover
                  that produced it. */}
              <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded border border-outline-variant bg-shell-obsidian px-2.5 py-1.5 text-label-sm font-semibold text-surface-low shadow-overlay group-hover:block">
                <span className="block text-brand-gold">{formatCompactINR(day.revenue)}</span>
                <span className="block font-normal opacity-70">
                  {day.orders} orders · {day.date.slice(5)}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {/* One span per bar, so the labels line up with the columns above. At 90
          days a span is about eight pixels wide — narrower than the label — so
          the ink is meant to spill past the box. That needs both halves: `min-w-0`
          to let a `nowrap` span shrink below its text (without it the row grows
          to ninety labels wide and overflows the panel), and nothing to hide the
          overflow (`truncate` on this span turned every date into "2…"). */}
      <div className="mt-2 flex border-t border-outline-variant/50 pt-2" style={{ gap: columnGap }}>
        {data.map((day, index) => (
          <span
            key={day.date}
            className="min-w-0 flex-1 whitespace-nowrap text-center text-[9px] uppercase tracking-wider text-ink-muted"
          >
            {index % labelEvery === 0 ? labelOf(day.date) : ''}
          </span>
        ))}
      </div>

      <p className="mt-2 text-body-sm text-ink-muted">
        <span className="font-semibold text-ink">{formatCompactINR(total)}</span> over {data.length} days
      </p>
    </div>
  )
}

/**
 * Horizontal share bars — revenue by channel, provenance mix, top cities. The
 * bar and the percentage scale together off the largest row, so a 3% channel
 * still reads as small next to a 68% one.
 */
export function ShareBars({ rows = [], className, valueKey = 'share', labelKey = 'label', formatValue }) {
  const max = Math.max(...rows.map((row) => row[valueKey]), 1)

  return (
    <ul className={cn('space-y-3', className)}>
      {rows.map((row) => (
        <li key={row.id ?? row[labelKey]}>
          <div className="flex items-baseline justify-between gap-3 text-body-sm">
            <span className="font-medium text-ink">{row[labelKey]}</span>
            <span className="tabular font-semibold text-ink-variant">
              {formatValue ? formatValue(row) : `${row[valueKey]}%`}
            </span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-high">
            <div
              className="h-full rounded-full bg-brand-gold"
              style={{ width: `${(row[valueKey] / max) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  )
}

export default Sparkline
