import cn from '@/lib/cn'
import { Icon } from './Icon'

/** Underlined tab bar in the design's champagne-gold active treatment. */
export function Tabs({ tabs = [], value, onChange, className, tone = 'light', size = 'md' }) {
  const activeClass = tone === 'dark' ? 'border-brand-gold text-brand-gold' : 'border-brand-goldDark text-brand-charcoal'
  const idleClass = tone === 'dark' ? 'border-transparent text-brand-cream/60 hover:text-brand-ivory' : 'border-transparent text-brand-muted hover:text-brand-charcoal'

  return (
    <div
      role="tablist"
      className={cn(
        'flex gap-6 overflow-x-auto border-b no-scrollbar',
        tone === 'dark' ? 'border-white/10' : 'border-brand-border',
        className,
      )}
    >
      {tabs.map((tab) => {
        const active = tab.id === value
        return (
          <button
            key={tab.id}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange?.(tab.id)}
            className={cn(
              'flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 pb-3 pt-1 font-semibold uppercase tracking-wider transition-colors',
              size === 'sm' ? 'text-[10px]' : 'text-label-sm',
              active ? activeClass : idleClass,
            )}
          >
            {tab.icon && <Icon name={tab.icon} className="h-3.5 w-3.5" />}
            {tab.label}
            {tab.count != null && (
              <span
                className={cn(
                  'rounded-full px-1.5 py-0.5 text-[9px] font-bold',
                  active ? 'bg-brand-charcoal text-white' : tone === 'dark' ? 'bg-white/10 text-brand-cream/70' : 'bg-neutral-100 text-brand-muted',
                )}
              >
                {tab.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

/** Pill-style filter row (category and brand filters). */
export function PillTabs({ tabs = [], value, onChange, className }) {
  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {tabs.map((tab) => {
        const active = tab.id === value
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange?.(tab.id)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-label-sm font-bold uppercase transition',
              active
                ? 'border-brand-charcoal bg-brand-charcoal text-brand-ivory'
                : 'border-brand-border bg-brand-ivory text-ink-variant hover:border-brand-gold hover:text-brand-goldDark',
            )}
          >
            {tab.icon && <Icon name={tab.icon} className="h-3.5 w-3.5" />}
            {tab.label}
            {tab.count != null && <span className={cn('font-semibold', active ? 'text-brand-gold' : 'text-brand-muted')}>({tab.count})</span>}
          </button>
        )
      })}
    </div>
  )
}

export default Tabs
