import cn from '@/lib/cn'
import { Icon } from './Icon'
import { SearchInput } from './Form'

/**
 * The strip above a table: search on the left, filters beside it, actions on
 * the right. Shared so every list screen's toolbar sits at the same height with
 * the same spacing.
 */
export function Toolbar({ search, onSearch, placeholder = 'Search…', filters, actions, className, children }) {
  return (
    <div className={cn('flex flex-wrap items-center gap-2 border-b border-outline-variant/50 px-4 py-3', className)}>
      {onSearch && <SearchInput value={search} onChange={onSearch} placeholder={placeholder} className="w-full sm:w-72" />}
      {filters && <div className="flex flex-wrap items-center gap-2">{filters}</div>}
      <div className="ml-auto flex flex-wrap items-center gap-2">{actions ?? children}</div>
    </div>
  )
}

/** A labelled compact select, sized for a toolbar row. */
export function FilterSelect({ label, value, onChange, options = [], className }) {
  return (
    <label className={cn('relative inline-flex items-center', className)}>
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="field h-[34px] w-auto min-w-[8.5rem] cursor-pointer appearance-none py-0 pl-2.5 pr-8 text-body-sm font-medium"
        title={label}
      >
        {options.map((option) => (
          <option key={option.value ?? option} value={option.value ?? option}>
            {option.label ?? option}
          </option>
        ))}
      </select>
      <Icon name="chevron-down" className="pointer-events-none absolute right-2.5 h-3.5 w-3.5 text-ink-muted" />
    </label>
  )
}

/**
 * Tab strip with per-tab counts — the Orders screen's status filter. Counts are
 * computed from the data, so a tab can never claim a number the table does not
 * hold.
 */
export function PillTabs({ tabs = [], value, onChange, className }) {
  return (
    <div className={cn('no-scrollbar flex items-center gap-1 overflow-x-auto', className)} role="tablist">
      {tabs.map((tab) => {
        const active = tab.value === value
        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.value)}
            className={cn(
              'inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-label-sm font-bold uppercase tracking-wider transition-colors',
              active ? 'bg-shell-obsidian text-surface-low' : 'text-ink-variant hover:bg-surface-low hover:text-ink',
            )}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span className={cn('rounded-full px-1.5 py-px text-[10px]', active ? 'bg-white/20' : 'bg-surface-high text-ink-variant')}>
                {tab.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

/**
 * Page controls. Shows a window of page numbers around the cursor rather than
 * every page, because a 400-row catalogue at 10 a page is 40 buttons.
 */
export function Pagination({ page, pageSize, total, onPageChange, onPageSizeChange, pageSizeOptions = [10, 25, 50], className }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  if (total === 0) return null

  const from = (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)

  const window = []
  const start = Math.max(1, Math.min(page - 1, totalPages - 2))
  for (let i = start; i < start + 3 && i <= totalPages; i += 1) window.push(i)

  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-3 border-t border-outline-variant/50 px-4 py-3', className)}>
      <p className="text-body-sm text-ink-muted">
        Showing <span className="font-semibold text-ink">{from}</span>–<span className="font-semibold text-ink">{to}</span> of{' '}
        <span className="font-semibold text-ink">{total}</span>
      </p>

      <div className="flex items-center gap-3">
        {onPageSizeChange && (
          <label className="hidden items-center gap-1.5 text-body-sm text-ink-muted sm:flex">
            Rows
            <select
              value={pageSize}
              onChange={(event) => onPageSizeChange(Number(event.target.value))}
              className="field h-8 w-auto cursor-pointer py-0 pl-2 pr-6 text-body-sm"
            >
              {pageSizeOptions.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
        )}

        <nav className="flex items-center gap-1" aria-label="Pagination">
          <button
            type="button"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            aria-label="Previous page"
            className="flex h-8 w-8 items-center justify-center rounded border border-outline-variant text-ink-variant transition-colors hover:bg-surface-low disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <Icon name="chevron-left" className="h-3.5 w-3.5" />
          </button>

          {start > 1 && (
            <>
              <PageButton page={1} active={false} onClick={onPageChange} />
              {start > 2 && <span className="px-1 text-ink-muted">…</span>}
            </>
          )}

          {window.map((number) => (
            <PageButton key={number} page={number} active={number === page} onClick={onPageChange} />
          ))}

          {start + 2 < totalPages && (
            <>
              {start + 3 < totalPages && <span className="px-1 text-ink-muted">…</span>}
              <PageButton page={totalPages} active={false} onClick={onPageChange} />
            </>
          )}

          <button
            type="button"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            aria-label="Next page"
            className="flex h-8 w-8 items-center justify-center rounded border border-outline-variant text-ink-variant transition-colors hover:bg-surface-low disabled:opacity-40 disabled:hover:bg-transparent"
          >
            <Icon name="chevron-right" className="h-3.5 w-3.5" />
          </button>
        </nav>
      </div>
    </div>
  )
}

function PageButton({ page, active, onClick }) {
  return (
    <button
      type="button"
      onClick={() => onClick(page)}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'h-8 min-w-8 rounded px-2 text-body-sm font-semibold transition-colors',
        active ? 'bg-shell-obsidian text-surface-low' : 'border border-outline-variant text-ink-variant hover:bg-surface-low',
      )}
    >
      {page}
    </button>
  )
}

export default Toolbar
