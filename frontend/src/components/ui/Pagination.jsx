import cn from '@/lib/cn'
import { Icon } from './Icon'
import { Button } from './Button'

/** Page numbered pagination with windowed ellipsis. */
export function Pagination({ page, totalPages, onChange, className }) {
  if (totalPages <= 1) return null

  const pages = []
  const push = (value) => pages.push(value)
  const window = 1

  push(1)
  if (page - window > 2) push('…')
  for (let i = Math.max(2, page - window); i <= Math.min(totalPages - 1, page + window); i += 1) push(i)
  if (page + window < totalPages - 1) push('…')
  if (totalPages > 1) push(totalPages)

  return (
    <nav className={cn('flex items-center justify-center gap-1.5', className)} aria-label="Pagination">
      <button
        type="button"
        onClick={() => onChange(Math.max(1, page - 1))}
        disabled={page === 1}
        className="inline-flex h-9 items-center gap-1.5 rounded-full border border-brand-border px-3.5 text-label-sm font-bold uppercase text-ink-variant transition hover:border-brand-charcoal hover:text-brand-charcoal disabled:opacity-40 disabled:hover:border-brand-border disabled:hover:text-ink-variant"
      >
        <Icon name="chevron-left" className="h-3.5 w-3.5" strokeWidth={2.5} />
        Prev
      </button>

      {pages.map((entry, index) =>
        entry === '…' ? (
          <span key={`gap-${index}`} className="px-1.5 text-brand-muted">
            …
          </span>
        ) : (
          <button
            key={entry}
            type="button"
            onClick={() => onChange(entry)}
            aria-current={entry === page ? 'page' : undefined}
            className={cn(
              'h-9 w-9 rounded-full border text-body-sm font-semibold transition',
              entry === page
                ? 'border-brand-charcoal bg-brand-charcoal text-white'
                : 'border-brand-border text-ink-variant hover:border-brand-charcoal hover:text-brand-charcoal',
            )}
          >
            {entry}
          </button>
        ),
      )}

      <button
        type="button"
        onClick={() => onChange(Math.min(totalPages, page + 1))}
        disabled={page === totalPages}
        className="inline-flex h-9 items-center gap-1.5 rounded-full border border-brand-border px-3.5 text-label-sm font-bold uppercase text-ink-variant transition hover:border-brand-charcoal hover:text-brand-charcoal disabled:opacity-40 disabled:hover:border-brand-border disabled:hover:text-ink-variant"
      >
        Next
        <Icon name="chevron-right" className="h-3.5 w-3.5" strokeWidth={2.5} />
      </button>
    </nav>
  )
}

/** Result count + page size selector above a product grid. */
export function PaginationBar({ page, pageSize, total, onPageSizeChange, pageSizeOptions = [24, 36, 48], className }) {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)

  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-3 text-body-sm', className)}>
      <p className="text-brand-muted">
        Showing <span className="font-semibold text-brand-charcoal">{from}</span>–
        <span className="font-semibold text-brand-charcoal">{to}</span> of{' '}
        <span className="font-semibold text-brand-charcoal">{total}</span> fragrances
      </p>
      <div className="flex items-center gap-2">
        <span className="text-brand-muted">Per page</span>
        {pageSizeOptions.map((size) => (
          <Button
            key={size}
            variant={size === pageSize ? 'primary' : 'ghost'}
            size="sm"
            className={size === pageSize ? '' : 'border border-brand-border'}
            onClick={() => onPageSizeChange(size)}
          >
            {size}
          </Button>
        ))}
      </div>
    </div>
  )
}

export default Pagination
