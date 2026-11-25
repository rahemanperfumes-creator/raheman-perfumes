import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { DataTable } from '@/components/ui/DataTable'
import { PillTabs } from '@/components/ui/Toolbar'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback'
import { StatCard, Panel } from '@/components/ui/StatCard'
import { BarChart, ShareBars } from '@/components/ui/Chart'
import useDocumentTitle from '@/hooks/useDocumentTitle'
import { PageHeader } from '@/components/ui/PageHeader'
import { useServerResource } from '@/hooks/useServerResource'
import { formatPrice, formatNumber } from '@/lib/format'
import adminApi from '@/services/adminApi'

/**
 * Analytics & Reports.
 *
 * The long view. The dashboard answers "how is today going" with tiles that
 * auto-refresh; this screen answers "where is the business going" over a window
 * the operator chooses, and is deliberately read-only — every number here is an
 * aggregation over the order book, and there is nothing to edit.
 *
 * Two facts about what this screen can and cannot say, both worth stating plainly
 * rather than letting the charts imply otherwise:
 *
 *  - The window is **daily buckets**, `days` back from today. Month, quarter and
 *    financial-year rollups are not built yet.
 *  - Revenue is **net of cancellations** (`status: { $ne: 'Cancelled' }` on every
 *    aggregation) but not net of returns, and gross of tax. It is the same figure
 *    the dashboard's tiles sum, so the two can never disagree.
 */

const WINDOWS = [
  { value: 30, label: '30 days' },
  { value: 90, label: '90 days' },
  { value: 180, label: '6 months' },
  { value: 365, label: '1 year' },
]

export function AnalyticsPage() {
  useDocumentTitle('Reports')

  const [days, setDays] = useState(90)

  const summary = useServerResource(() => adminApi.getAnalyticsSummary())
  const revenue = useServerResource(() => adminApi.getAnalyticsRevenue(days), { key: String(days) })

  const series = revenue.data?.series ?? []
  const topProducts = useMemo(() => revenue.data?.topProducts ?? [], [revenue.data])
  const byCategory = useMemo(() => revenue.data?.byCategory ?? [], [revenue.data])
  const byTier = useMemo(() => revenue.data?.byTier ?? [], [revenue.data])

  const tiles = summary.data

  /**
   * Share bars want a percentage and a readable figure in the same row, and the
   * percentage has to be of the whole — not of the largest row, which is what the
   * bar's own width already encodes.
   */
  const shareRows = (rows, key, labelOf) => {
    const total = rows.reduce((sum, row) => sum + (row.revenue ?? 0), 0)
    return rows.map((row) => ({
      id: row[key] ?? row._id ?? labelOf(row),
      label: labelOf(row),
      share: total > 0 ? Math.round(((row.revenue ?? 0) / total) * 100) : 0,
      revenue: row.revenue ?? 0,
      units: row.units ?? 0,
    }))
  }

  const categoryRows = useMemo(
    () => shareRows(byCategory, 'category', (row) => row.category ?? 'Unfiled'),
    [byCategory],
  )
  const tierRows = useMemo(() => shareRows(byTier, 'tier', (row) => row.tier ?? 'Unknown'), [byTier])

  /** What is on screen, as a file. Built from the rows already fetched — no new endpoint. */
  const exportBestSellers = () => {
    const header = ['Fragrance', 'SKU', 'Units', 'Revenue']
    const lines = topProducts.map((row) => [row.name, row.sku ?? '', row.units, row.revenue])
    const csv = [header, ...lines]
      .map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `rehman-best-sellers-${new Date().toISOString().slice(0, 10)}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const columns = [
    {
      key: 'name',
      header: 'Fragrance',
      render: (row) => (
        <span className="block">
          <span className="block font-medium text-ink">{row.name}</span>
          <span className="block text-body-sm text-ink-muted">{row.sku || 'No SKU'}</span>
        </span>
      ),
    },
    {
      key: 'units',
      header: 'Units',
      align: 'right',
      render: (row) => <span className="tabular text-ink-variant">{formatNumber(row.units)}</span>,
    },
    {
      key: 'revenue',
      header: 'Revenue',
      align: 'right',
      render: (row) => <span className="tabular font-semibold text-ink">{formatPrice(row.revenue)}</span>,
    },
  ]

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        actions={
          <>
            <Button variant="outline" icon="download" onClick={exportBestSellers} disabled={topProducts.length === 0}>
              Export best sellers
            </Button>
            {/* Refresh is never the reason someone opened a report, so it is the
                quietest thing on the row now. */}
            <Button variant="ghost" size="sm" icon="refresh" onClick={() => { summary.reload(); revenue.reload() }}>
              Refresh
            </Button>
          </>
        }
      />

      {summary.error ? (
        <div className="card-admin">
          <ErrorState error={summary.error} refused={summary.refused} onRetry={summary.reload} />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {summary.loading || !tiles ? (
            Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-[104px]" />)
          ) : (
            <>
              <StatCard
                label="Revenue"
                value={formatPrice(tiles.revenue)}
                icon="trending-up"
                tone="done"
                hint={`${formatNumber(tiles.orders?.total ?? 0)} orders, cancellations excluded`}
              />
              <StatCard
                label="Typical order"
                value={formatPrice(tiles.averageOrder)}
                icon="card"
                hint="Across every order that was not cancelled"
              />
              <StatCard
                label="Units sold"
                value={formatNumber(tiles.units)}
                icon="package"
                hint="Bottles, across all volumes"
              />
              <StatCard
                label="Discount given"
                value={formatPrice(tiles.discount)}
                icon="tag"
                tone="pending"
                hint="Total value of coupons redeemed"
              />
            </>
          )}
        </div>
      )}

      <Panel
        title="Revenue over time"
        description="Daily takings, cancellations excluded. Hover a column for that day's orders."
        action={
          <PillTabs value={days} onChange={setDays} tabs={WINDOWS.map((window) => ({ value: window.value, label: window.label }))} />
        }
      >
        {revenue.error ? (
          <ErrorState error={revenue.error} refused={revenue.refused} onRetry={revenue.reload} />
        ) : revenue.loading ? (
          <Skeleton className="h-[248px]" />
        ) : series.every((day) => day.revenue === 0) ? (
          <EmptyState
            icon="analytics"
            title="Nothing sold in this window"
            description="No order in the selected period contributed revenue. Try a longer window."
          />
        ) : (
          <BarChart data={series} height={200} />
        )}
      </Panel>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Sales by category" description="Which categories the money comes from.">
          {revenue.loading ? (
            <Skeleton className="h-[180px]" />
          ) : categoryRows.length === 0 ? (
            <EmptyState icon="layers" title="No category sales yet" description="None of the orders in this window match a category." />
          ) : (
            <ShareBars rows={categoryRows} formatValue={(row) => `${row.share}% · ${formatPrice(row.revenue)}`} />
          )}
        </Panel>

        <Panel title="Sales by type" description="Your own blends against the branded stock you buy in — by revenue.">
          {revenue.loading ? (
            <Skeleton className="h-[180px]" />
          ) : tierRows.length === 0 ? (
            <EmptyState icon="flask" title="No type sales yet" description="None of the orders in this window match a product type." />
          ) : (
            <ShareBars rows={tierRows} formatValue={(row) => `${row.share}% · ${formatPrice(row.revenue)}`} />
          )}
        </Panel>
      </div>

      <Panel
        title="Best sellers"
        description="By revenue, across every order that was not cancelled."
        flush
        action={
          <Button variant="ghost" size="sm" icon="download" onClick={exportBestSellers} disabled={topProducts.length === 0}>
            CSV
          </Button>
        }
      >
        {revenue.error ? (
          <ErrorState error={revenue.error} refused={revenue.refused} onRetry={revenue.reload} />
        ) : (
          <DataTable
            columns={columns}
            rows={topProducts}
            loading={revenue.loading}
            empty={<EmptyState icon="package" title="Nothing sold yet" description="Best sellers appear once orders have been placed." />}
          />
        )}
      </Panel>
    </div>
  )
}

export default AnalyticsPage
