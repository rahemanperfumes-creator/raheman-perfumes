import { useMemo, useRef, useState } from 'react'

/**
 * The sorting, searching and paging engine behind every list screen.
 *
 * One hook drives Products, Orders, Customers, Inventory and the ledger, so
 * "sorted by X, filtered to Y, page 2 of 5, three rows ticked" means the same
 * thing everywhere.
 *
 * The predicate and the comparators are read through refs rather than taken as
 * dependencies. Callers write them inline — `matches={(row, q) => …}` — which
 * would otherwise be a new function on every render and defeat memoisation
 * entirely, re-sorting the whole catalogue on every keystroke elsewhere on the
 * page. Reading through a ref keeps the memo keyed to the data and the query,
 * which are the only things that actually change the result.
 *
 * @param {{
 *   rows: any[],
 *   pageSize?: number,
 *   matches: (row: any, query: string) => boolean,
 *   compare?: Record<string, (row: any) => string | number>,
 *   initialSort?: { key: string, dir: 'asc'|'desc' } | null,
 * }} options
 */
export function useDataTable({ rows, pageSize: initialPageSize = 10, matches, compare = {}, initialSort = null }) {
  const [query, setQueryRaw] = useState('')
  const [sort, setSortRaw] = useState(initialSort)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSizeRaw] = useState(initialPageSize)
  const [selectedIds, setSelectedIds] = useState([])

  const matchesRef = useRef(matches)
  matchesRef.current = matches
  const compareRef = useRef(compare)
  compareRef.current = compare

  const filtered = useMemo(
    () => (query.trim() ? rows.filter((row) => matchesRef.current(row, query.trim().toLowerCase())) : rows),
    [rows, query],
  )

  const sorted = useMemo(() => {
    if (!sort) return filtered
    const read = compareRef.current[sort.key]
    if (!read) return filtered
    const direction = sort.dir === 'desc' ? -1 : 1
    return [...filtered].sort((a, b) => {
      const left = read(a)
      const right = read(b)
      if (left === right) return 0
      // Numbers compare numerically, everything else as a locale-aware string,
      // so "₹10,000" and "₹9,000" do not sort as text.
      if (typeof left === 'number' && typeof right === 'number') return (left - right) * direction
      return String(left).localeCompare(String(right), 'en-IN', { numeric: true }) * direction
    })
  }, [filtered, sort])

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize))
  // A filter that shrinks the list can leave the cursor past the end; clamping
  // here rather than in an effect avoids rendering an empty page for a frame.
  const safePage = Math.min(page, totalPages)
  const visible = useMemo(
    () => sorted.slice((safePage - 1) * pageSize, safePage * pageSize),
    [sorted, safePage, pageSize],
  )

  return {
    query,
    setQuery: (value) => {
      setQueryRaw(value)
      setPage(1)
    },
    sort,
    setSort: (value) => {
      setSortRaw(value)
      setPage(1)
    },
    page: safePage,
    setPage,
    pageSize,
    setPageSize: (value) => {
      setPageSizeRaw(value)
      setPage(1)
    },
    /** Every row surviving the search, before paging. */
    filtered,
    sorted,
    /** Just this page. */
    visible,
    total: sorted.length,
    totalPages,
    selectedIds,
    setSelectedIds,
    /** Ids on the current page, for a "select all" that respects the filter. */
    pageIds: visible.map((row) => row.id),
    clearSelection: () => setSelectedIds([]),
  }
}

export default useDataTable
