import cn from '@/lib/cn'
import { Icon } from './Icon'
import { Checkbox } from './Form'
import { EmptyState, TableSkeleton } from './Feedback'

/**
 * The panel's table.
 *
 * One component serves every list screen — same header treatment, same hover,
 * same selection behaviour — so Products, Orders, Customers, Inventory and the
 * ledger cannot drift apart visually. Columns are data, not markup: each one
 * names how to render its cell, which keeps a screen's column list readable.
 *
 * @param {{
 *   columns: { key: string, header: string, align?: 'left'|'right'|'center',
 *              sortable?: boolean, width?: string, className?: string,
 *              render: (row: any) => React.ReactNode }[],
 *   rows: any[],
 *   rowKey?: (row: any) => string,
 *   selectable?: boolean,
 *   selectedIds?: string[],
 *   onSelectedChange?: (ids: string[]) => void,
 *   sort?: { key: string, dir: 'asc'|'desc' } | null,
 *   onSortChange?: (sort: { key: string, dir: 'asc'|'desc' }) => void,
 *   loading?: boolean,
 *   empty?: React.ReactNode,
 *   onRowClick?: (row: any) => void,
 *   rowClassName?: (row: any) => string,
 * }} props
 */
export function DataTable({
  columns,
  rows,
  rowKey = (row) => row.id,
  selectable = false,
  selectedIds = [],
  onSelectedChange,
  sort = null,
  onSortChange,
  loading = false,
  empty = null,
  onRowClick,
  rowClassName,
  className,
}) {
  const selected = new Set(selectedIds)
  const pageIds = rows.map(rowKey)
  const allOnPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id))

  const toggleAll = () => {
    if (!onSelectedChange) return
    // Only the visible page is toggled, so "select all" on a filtered view
    // selects what the operator can actually see.
    onSelectedChange(allOnPageSelected ? selectedIds.filter((id) => !pageIds.includes(id)) : [...new Set([...selectedIds, ...pageIds])])
  }

  const toggleRow = (id) => {
    if (!onSelectedChange) return
    onSelectedChange(selected.has(id) ? selectedIds.filter((value) => value !== id) : [...selectedIds, id])
  }

  const requestSort = (key) => {
    if (!onSortChange) return
    if (sort?.key === key) {
      // asc → desc → off, so a third click returns the list to its natural order.
      onSortChange(sort.dir === 'asc' ? { key, dir: 'desc' } : null)
    } else {
      onSortChange({ key, dir: 'asc' })
    }
  }

  const alignClass = { right: 'text-right', center: 'text-center', left: 'text-left' }

  return (
    <div className={cn('w-full overflow-x-auto', className)}>
      <table className="table-admin">
        <thead>
          <tr>
            {selectable && (
              <th className="w-10 pr-0">
                <Checkbox
                  checked={allOnPageSelected}
                  onChange={toggleAll}
                  aria-label="Select all rows on this page"
                  label=""
                  className="[&>span:last-child]:hidden"
                />
              </th>
            )}
            {columns.map((column) => {
              const isSorted = sort?.key === column.key
              return (
                <th
                  key={column.key}
                  style={column.width ? { width: column.width } : undefined}
                  className={cn(alignClass[column.align ?? 'left'], column.className)}
                  aria-sort={isSorted ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                >
                  {column.sortable ? (
                    <button
                      type="button"
                      onClick={() => requestSort(column.key)}
                      className={cn(
                        'inline-flex items-center gap-1 uppercase tracking-wider transition-colors hover:text-ink',
                        isSorted && 'text-ink',
                      )}
                    >
                      {column.header}
                      <Icon
                        name={isSorted && sort.dir === 'desc' ? 'chevron-down' : 'chevron-up'}
                        className={cn('h-3 w-3', !isSorted && 'opacity-25')}
                      />
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <TableSkeleton rows={6} columns={columns.length + (selectable ? 1 : 0)} />
          ) : (
            rows.map((row) => {
              const id = rowKey(row)
              return (
                <tr
                  key={id}
                  data-selected={selected.has(id) ? 'true' : undefined}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={cn(onRowClick && 'cursor-pointer', rowClassName?.(row))}
                >
                  {selectable && (
                    <td className="pr-0" onClick={(event) => event.stopPropagation()}>
                      <Checkbox
                        checked={selected.has(id)}
                        onChange={() => toggleRow(id)}
                        aria-label={`Select row ${id}`}
                        label=""
                        className="[&>span:last-child]:hidden"
                      />
                    </td>
                  )}
                  {columns.map((column) => (
                    <td key={column.key} className={cn(alignClass[column.align ?? 'left'], column.className)}>
                      {column.render(row)}
                    </td>
                  ))}
                </tr>
              )
            })
          )}
        </tbody>
      </table>

      {!loading && rows.length === 0 && (
        <div className="border-t border-outline-variant/40">
          {empty ?? <EmptyState icon="search" title="Nothing matches" description="Try loosening a filter or clearing the search." />}
        </div>
      )}
    </div>
  )
}

/**
 * The bar that appears once rows are selected. Sits above the table so the
 * action it offers is never scrolled out of view.
 */
export function BulkBar({ count, onClear, children }) {
  if (count === 0) return null
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-brand-gold/30 bg-brand-gold/10 px-4 py-2.5 animate-fade-in">
      <div className="flex items-center gap-2">
        <span className="text-body-sm font-semibold text-ink">
          {count} {count === 1 ? 'row' : 'rows'} selected
        </span>
        <button type="button" onClick={onClear} className="text-body-sm text-ink-variant underline underline-offset-2 hover:text-ink">
          Clear
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  )
}

export default DataTable
