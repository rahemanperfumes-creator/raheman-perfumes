import { Link } from '@/components/ui/AppLink'
import cn from '@/lib/cn'
import { Icon } from './Icon'

/** Breadcrumb trail. The final crumb is rendered as plain text. */
export function Breadcrumbs({ items = [], className }) {
  if (!items.length) return null
  return (
    <nav aria-label="Breadcrumb" className={cn('flex flex-wrap items-center gap-1.5 text-body-sm', className)}>
      {items.map((item, index) => {
        const isLast = index === items.length - 1
        return (
          <span key={`${item.label}-${index}`} className="flex items-center gap-1.5">
            {isLast || !item.to ? (
              <span className="font-medium text-brand-charcoal">{item.label}</span>
            ) : (
              <Link to={item.to} className="text-brand-muted transition-colors hover:text-brand-goldDark">
                {item.label}
              </Link>
            )}
            {!isLast && <Icon name="chevron-right" className="h-3 w-3 text-brand-border" strokeWidth={2.5} />}
          </span>
        )
      })}
    </nav>
  )
}

/**
 * Section heading with the editorial eyebrow + serif title pattern used
 * throughout the design, plus an optional trailing action.
 */
export function SectionHeading({
  eyebrow,
  title,
  subtitle,
  action,
  align = 'left',
  tone = 'light',
  className,
  as: Tag = 'h2',
}) {
  const alignment = align === 'center' ? 'text-center items-center' : 'text-left items-start'
  const titleTone = tone === 'dark' ? 'text-brand-ivory' : 'text-brand-charcoal'
  const subTone = tone === 'dark' ? 'text-brand-cream/70' : 'text-brand-muted'

  return (
    <div
      className={cn(
        'flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between',
        align === 'center' && 'sm:flex-col sm:items-center',
        className,
      )}
    >
      <div className={cn('flex flex-col', alignment)}>
        {eyebrow && (
          <span className="mb-2 text-label-md font-bold uppercase text-brand-goldDark">{eyebrow}</span>
        )}
        {title && (
          <Tag className={cn('font-cormorant text-2xl font-semibold sm:text-3xl lg:text-headline-xl', titleTone)}>{title}</Tag>
        )}
        {subtitle && (
          <p className={cn('mt-2 max-w-2xl text-body-md', subTone, align === 'center' && 'mx-auto')}>
            {subtitle}
          </p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

/** A thin gold rule with a centred label — the design's section divider. */
export function SectionDivider({ label, className }) {
  return (
    <div className={cn('flex items-center gap-4', className)}>
      <span className="h-px flex-1 bg-brand-border" />
      {label && <span className="text-label-md font-bold uppercase text-brand-muted">{label}</span>}
      <span className="h-px flex-1 bg-brand-border" />
    </div>
  )
}

export default SectionHeading
