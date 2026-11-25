import { useState } from 'react'
import cn from '@/lib/cn'
import { Icon } from './Icon'

/**
 * Accordion used for FAQs, PDP detail panels and offer terms.
 * Uncontrolled by default; pass `openId`/`onToggle` to drive it externally.
 */
export function Accordion({ items = [], defaultOpenId = null, allowMultiple = false, className, tone = 'light' }) {
  const [openIds, setOpenIds] = useState(() => (defaultOpenId ? [defaultOpenId] : []))

  const toggle = (id) => {
    setOpenIds((current) => {
      const isOpen = current.includes(id)
      if (allowMultiple) {
        return isOpen ? current.filter((entry) => entry !== id) : [...current, id]
      }
      return isOpen ? [] : [id]
    })
  }

  return (
    <div className={cn('divide-y divide-brand-border', tone === 'dark' && 'divide-white/10', className)}>
      {items.map((item) => {
        const open = openIds.includes(item.id)
        return (
          <div key={item.id}>
            <button
              type="button"
              onClick={() => toggle(item.id)}
              aria-expanded={open}
              className="flex w-full items-center justify-between gap-4 py-5 text-left"
            >
              <span
                className={cn(
                  'text-body-md font-semibold transition-colors',
                  tone === 'dark' ? 'text-brand-ivory' : 'text-brand-charcoal',
                  open && 'text-brand-goldDark',
                )}
              >
                {item.question ?? item.title}
              </span>
              <Icon
                name="chevron-down"
                className={cn(
                  'h-4 w-4 shrink-0 transition-transform duration-300',
                  tone === 'dark' ? 'text-brand-gold' : 'text-brand-muted',
                  open && 'rotate-180',
                )}
                strokeWidth={2}
              />
            </button>
            <div
              className={cn(
                'grid transition-all duration-300 ease-out',
                open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
              )}
            >
              <div className="overflow-hidden">
                <div
                  className={cn(
                    'pb-5 pr-8 text-body-md leading-relaxed',
                    tone === 'dark' ? 'text-brand-cream/70' : 'text-brand-muted',
                  )}
                >
                  {item.answer ?? item.body}
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/**
 * Collapsible section with a bordered header — the PDP's detail panels.
 */
export function CollapsiblePanel({ title, icon, children, defaultOpen = false, className }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className={cn('border-b border-brand-border last:border-b-0', className)}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-4 py-4 text-left"
      >
        <span className="flex items-center gap-2.5">
          {icon && <Icon name={icon} className="h-4 w-4 text-brand-goldDark" />}
          <span className="text-label-md font-bold uppercase text-brand-charcoal">{title}</span>
        </span>
        <Icon
          name="chevron-down"
          className={cn('h-4 w-4 shrink-0 text-brand-muted transition-transform duration-300', open && 'rotate-180')}
          strokeWidth={2}
        />
      </button>
      {open && <div className="animate-fade-in pb-5 text-body-md leading-relaxed text-brand-muted">{children}</div>}
    </div>
  )
}

export default Accordion
