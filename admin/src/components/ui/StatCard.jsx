import { Link } from 'react-router-dom'
import cn from '@/lib/cn'
import { Icon } from './Icon'
import { Sparkline } from './Chart'
import { formatDelta } from '@/lib/format'

/**
 * A dashboard tile.
 *
 * The value is passed in already formatted — a tile should not know whether the
 * figure it shows is money, a count or a percentage, and every caller here
 * formats through `lib/format` so the panel's numbers read consistently.
 */
export function StatCard({
  label,
  value,
  delta,
  hint = 'vs last period',
  icon,
  spark,
  tone = 'gold',
  onClick,
  to,
  className,
}) {
  const toneClasses = {
    gold: 'bg-brand-gold/20 text-brand-goldDeep',
    done: 'bg-state-doneSurface text-state-done',
    active: 'bg-state-activeSurface text-state-active',
    halted: 'bg-state-haltedSurface text-state-halted',
    pending: 'bg-state-pendingSurface text-state-pending',
  }

  const rising = Number(delta) >= 0

  const body = (
    <div className="flex flex-col justify-between h-full">
      <div>
        <div className="flex items-start justify-between gap-2">
          <span className="text-label-sm font-bold uppercase tracking-wider text-ink-muted">{label}</span>
          {icon && (
            <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded', toneClasses[tone] ?? toneClasses.gold)}>
              <Icon name={icon} className="h-4 w-4" />
            </span>
          )}
        </div>

        <div className="mt-2.5">
          <p className="tabular font-serif text-[28px] font-semibold leading-none text-ink">{value}</p>
        </div>
      </div>

      <div className="mt-3">
        <div className="flex min-h-[22px] items-center gap-1.5 flex-wrap">
          {delta !== undefined && delta !== null && (
            <span
              className={cn(
                'inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-bold',
                rising ? 'bg-state-doneSurface text-state-done' : 'bg-state-haltedSurface text-state-halted',
              )}
            >
              <Icon name={rising ? 'trending-up' : 'trending-down'} className="h-3 w-3" />
              {formatDelta(delta)}
            </span>
          )}
          {hint && <span className="text-[11px] text-ink-muted truncate">{hint}</span>}
        </div>

        {spark && spark.length > 1 && (
          <div className="mt-2.5 border-t border-outline-variant/40 pt-2">
            <Sparkline values={spark} tone={rising ? 'gold' : 'halted'} className="h-5" area={false} />
          </div>
        )}
      </div>
    </div>
  )

  const classes = cn(
    'card-admin block w-full p-3.5 text-left transition-all duration-200',
    (onClick || to) && 'hover:-translate-y-0.5 hover:border-brand-gold/50 hover:shadow-lift',
    className,
  )

  if (to) {
    return (
      // `Link`, not `<a>`: a tile that reloads the whole panel to move one
      // screen would drop the persisted store's in-memory identity with it.
      <Link to={to} className={classes}>
        {body}
      </Link>
    )
  }

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={classes}>
        {body}
      </button>
    )
  }

  return <div className={classes}>{body}</div>
}

/**
 * A panel: titled card used for every secondary block on the dashboard and the
 * detail sections in the drawers.
 */
export function Panel({ title, description, action, children, className, bodyClassName, flush = false }) {
  return (
    <section className={cn('card-admin', flush && 'overflow-hidden', className)}>
      {(title || action) && (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-outline-variant/50 px-4 py-3">
          <div>
            {title && <h2 className="panel-title">{title}</h2>}
          </div>
          {action}
        </header>
      )}
      <div className={cn(flush ? '' : 'p-4', bodyClassName)}>{children}</div>
    </section>
  )
}

export default StatCard
