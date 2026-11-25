import { useMemo, useState } from 'react'
import { Button, IconButton } from '@/components/ui/Button'
import { Chip, StatusPill } from '@/components/ui/Badge'
import { DataTable, BulkBar } from '@/components/ui/DataTable'
import { Toolbar, PillTabs, Pagination } from '@/components/ui/Toolbar'
import { EmptyState, ErrorState } from '@/components/ui/Feedback'
import { Drawer } from '@/components/ui/Modal'
import { DetailRow } from '@/components/ui/Form'
import { Icon } from '@/components/ui/Icon'
import useDataTable from '@/hooks/useDataTable'
import useDocumentTitle from '@/hooks/useDocumentTitle'
import { PageHeader } from '@/components/ui/PageHeader'
import { useServerResource, useServerAction } from '@/hooks/useServerResource'
import { formatDate, formatRating } from '@/lib/format'
import adminApi from '@/services/adminApi'
import { useSessionStore } from '@/store/sessionStore'
import { useUiStore } from '@/store/uiStore'

/**
 * The moderation queue.
 *
 * Nothing a shopper writes is published when they submit it. A review arrives as
 * `Pending` and sits here until someone reads it, which matters because the star
 * rating on every product card and the catalogue's own sort are computed from
 * **Published** rows only (`products.reviewStats()`). This screen is therefore
 * upstream of what shoppers see, not a record of it.
 *
 * `verified` is shown and never set. It is derived on the server from whether the
 * reviewer has a delivered order containing that fragrance — offering a tick box
 * here would make the badge a claim rather than a fact, which is the one thing a
 * "verified purchase" label must not be.
 */

const REVIEW_STATUSES = ['Published', 'Pending', 'Rejected']

/** Five stars, filled to the rating. The number sits beside it for precision. */
function Stars({ rating }) {
  return (
    <span className="flex items-center gap-0.5" title={`${formatRating(rating)} out of 5`}>
      {[1, 2, 3, 4, 5].map((step) => (
        <Icon
          key={step}
          name="star"
          className={step <= Math.round(rating) ? 'h-3.5 w-3.5 text-brand-goldDark' : 'h-3.5 w-3.5 text-outline-variant'}
        />
      ))}
      <span className="tabular ml-1 text-body-sm font-semibold text-ink">{formatRating(rating)}</span>
    </span>
  )
}

export function ReviewsPage() {
  useDocumentTitle('Reviews')

  const isOwner = useSessionStore((state) => state.user?.role === 'owner')
  const pushToast = useUiStore((state) => state.pushToast)
  const { run, busy } = useServerAction()

  const [status, setStatus] = useState('Pending')
  const [openId, setOpenId] = useState(null)

  const { data, loading, error, reload, refused } = useServerResource(() => adminApi.listReviews())
  const reviews = useMemo(() => data ?? [], [data])

  const counts = useMemo(
    () =>
      reviews.reduce(
        (totals, review) => {
          totals[review.status] = (totals[review.status] ?? 0) + 1
          totals.All += 1
          return totals
        },
        { All: 0 },
      ),
    [reviews],
  )

  const scoped = useMemo(
    () => (status === 'All' ? reviews : reviews.filter((review) => review.status === status)),
    [reviews, status],
  )

  const table = useDataTable({
    rows: scoped,
    pageSize: 10,
    matches: (review, query) =>
      [review.name, review.city, review.title, review.body, review.product].join(' ').toLowerCase().includes(query),
    compare: {
      rating: (review) => review.rating,
      product: (review) => review.product,
      reviewer: (review) => review.name,
      date: (review) => review.date,
    },
    initialSort: { key: 'date', dir: 'desc' },
  })

  const open = reviews.find((review) => review.id === openId) ?? null

  const decide = async (review, next) => {
    const result = await run(() => adminApi.setReviewStatus(review.id, next), {
      success: `${review.product || 'Review'} ${next.toLowerCase()}`,
    })
    if (!result) return
    setOpenId(null)
    reload()
  }

  const remove = async (review) => {
    if (!window.confirm(`Delete this review by ${review.name || 'an anonymous reviewer'}? Its photographs go with it.`)) return
    const result = await run(() => adminApi.deleteReview(review.id), { success: 'Review deleted' })
    if (!result) return
    setOpenId(null)
    reload()
  }

  /**
   * Bulk moderation is a loop, not a batch request.
   *
   * There is no `/reviews/bulk` route, so this sends one decision per row. That
   * makes it **not atomic**, and the honest thing is to say so in the outcome:
   * if row four fails, the toast reports that three landed rather than implying
   * the whole selection did. It stops at the first failure so the count in the
   * message is exactly what the database holds.
   *
   * A single summary toast rather than one per row, which is why this does not go
   * through `useServerAction` — five rows would be five toasts.
   */
  const bulk = async (next) => {
    const ids = [...table.selectedIds]
    if (ids.length === 0) return

    let done = 0
    for (const id of ids) {
      try {
        const result = await adminApi.setReviewStatus(id, next)
        if (!result || result.live === false) throw new Error('The server could not be reached.')
        done += 1
      } catch (failure) {
        pushToast({
          tone: 'error',
          title: `${done} of ${ids.length} updated`,
          description: `${failure.message} The rest were left untouched.`,
          dismissAfter: 0,
        })
        table.clearSelection()
        reload()
        return
      }
    }

    pushToast({ title: `${done} ${done === 1 ? 'review' : 'reviews'} set to ${next.toLowerCase()}` })
    table.clearSelection()
    reload()
  }

  const bulkDelete = async () => {
    const ids = [...table.selectedIds]
    if (ids.length === 0) return
    if (!window.confirm(`Delete ${ids.length} ${ids.length === 1 ? 'review' : 'reviews'}? Photographs are removed too, and there is no undo.`)) return

    let done = 0
    for (const id of ids) {
      try {
        const result = await adminApi.deleteReview(id)
        if (!result || result.live === false) throw new Error('The server could not be reached.')
        done += 1
      } catch (failure) {
        pushToast({ tone: 'error', title: `${done} of ${ids.length} deleted`, description: failure.message, dismissAfter: 0 })
        table.clearSelection()
        reload()
        return
      }
    }

    pushToast({ title: `${done} ${done === 1 ? 'review' : 'reviews'} deleted` })
    table.clearSelection()
    reload()
  }

  const columns = [
    {
      key: 'rating',
      header: 'Rating',
      sortable: true,
      render: (review) => <Stars rating={review.rating} />,
    },
    {
      key: 'review',
      header: 'Review',
      render: (review) => (
        <span className="block max-w-[22rem]">
          <span className="block truncate font-medium text-ink">{review.title || 'Untitled'}</span>
          <span className="block truncate text-body-sm text-ink-muted">{review.body || 'No body.'}</span>
        </span>
      ),
    },
    {
      key: 'product',
      header: 'Fragrance',
      sortable: true,
      render: (review) => <span className="text-ink-variant">{review.product || '—'}</span>,
    },
    {
      key: 'reviewer',
      header: 'Reviewer',
      sortable: true,
      render: (review) => (
        <span className="block">
          <span className="block font-medium text-ink">{review.name || 'Anonymous'}</span>
          <span className="block text-body-sm text-ink-muted">{review.city || 'No city'}</span>
        </span>
      ),
    },
    {
      key: 'trust',
      header: 'Trust',
      render: (review) => (
        <span className="flex flex-col items-start gap-1">
          {review.verified ? <Chip tone="gold">Verified</Chip> : <Chip>Unverified</Chip>}
          {review.photos > 0 && (
            <span className="flex items-center gap-1 text-body-sm text-ink-muted">
              <Icon name="eye" className="h-3 w-3" />
              {review.photos} photo{review.photos === 1 ? '' : 's'}
            </span>
          )}
        </span>
      ),
    },
    {
      key: 'date',
      header: 'Written',
      align: 'right',
      sortable: true,
      render: (review) => <span className="tabular whitespace-nowrap text-ink-muted">{formatDate(review.date)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (review) => <StatusPill status={review.status} />,
    },
    {
      key: 'actions',
      header: 'Action',
      align: 'right',
      render: (review) => (
        <span className="flex items-center justify-end gap-0.5" onClick={(event) => event.stopPropagation()}>
          {isOwner && review.status !== 'Published' && (
            <Button variant="outline" size="sm" disabled={busy} onClick={() => decide(review, 'Published')}>
              Publish
            </Button>
          )}
          {isOwner && review.status !== 'Rejected' && (
            <IconButton icon="close" label="Reject" tone="danger" disabled={busy} onClick={() => decide(review, 'Rejected')} />
          )}
          <IconButton icon="eye" label="Read in full" onClick={() => setOpenId(review.id)} />
        </span>
      ),
    },
  ]

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        actions={
          <Button variant="ghost" size="sm" icon="refresh" onClick={reload}>
            Refresh
          </Button>
        }
      />

      <div className="card-admin-flush">
        <div className="border-b border-outline-variant/50 px-4 pt-3">
          <PillTabs
            value={status}
            onChange={(value) => {
              setStatus(value)
              table.clearSelection()
              table.setPage(1)
            }}
            tabs={['All', ...REVIEW_STATUSES].map((value) => ({ value, label: value, count: counts[value] ?? 0 }))}
          />
        </div>

        <Toolbar
          search={table.query}
          onSearch={table.setQuery}
          placeholder="Search by reviewer, fragrance or text…"
          actions={<span className="text-body-sm text-ink-muted">{table.total} shown</span>}
        />

        {isOwner && (
          <BulkBar count={table.selectedIds.length} onClear={table.clearSelection}>
            <Button variant="outline" size="sm" icon="check" onClick={() => bulk('Published')}>
              Publish selected
            </Button>
            <Button variant="outline" size="sm" icon="close" onClick={() => bulk('Rejected')}>
              Reject selected
            </Button>
            <Button variant="danger" size="sm" icon="trash" onClick={bulkDelete}>
              Delete selected
            </Button>
          </BulkBar>
        )}

        {error ? (
          <ErrorState error={error} refused={refused} onRetry={reload} />
        ) : (
          <>
            <DataTable
              columns={columns}
              rows={table.visible}
              loading={loading}
              selectable={isOwner}
              selectedIds={table.selectedIds}
              onSelectedChange={table.setSelectedIds}
              sort={table.sort}
              onSortChange={table.setSort}
              onRowClick={(review) => setOpenId(review.id)}
              empty={
                <EmptyState
                  icon="star"
                  title={status === 'Pending' ? 'Nothing waiting' : 'No reviews match'}
                  description={
                    status === 'Pending'
                      ? 'Every review has been read. New submissions from the website arrive here.'
                      : 'Nothing on file fits this tab.'
                  }
                />
              }
            />

            <Pagination
              page={table.page}
              pageSize={table.pageSize}
              total={table.total}
              onPageChange={table.setPage}
              onPageSizeChange={table.setPageSize}
            />
          </>
        )}
      </div>

      <Drawer
        open={Boolean(open)}
        onClose={() => setOpenId(null)}
        title={open?.title || 'Untitled review'}
        subtitle={open ? `${open.product || 'Unknown fragrance'} · ${open.name || 'Anonymous'}` : ''}
        footer={
          open && isOwner ? (
            <>
              {open.status !== 'Rejected' && (
                <Button variant="outline" icon="close" onClick={() => decide(open, 'Rejected')} loading={busy}>
                  Reject
                </Button>
              )}
              {open.status !== 'Published' ? (
                <Button icon="check" onClick={() => decide(open, 'Published')} loading={busy}>
                  Publish
                </Button>
              ) : (
                <Button variant="outline" icon="refresh" onClick={() => decide(open, 'Pending')} loading={busy}>
                  Return to queue
                </Button>
              )}
            </>
          ) : null
        }
      >
        {open && (
          <div className="flex flex-col gap-5">
            <div>
              <Stars rating={open.rating} />
              <p className="mt-2 whitespace-pre-line text-body-md text-ink-variant">{open.body || 'No body was written.'}</p>
            </div>

            <dl className="divide-y divide-outline-variant/50 border-y border-outline-variant/50">
              <DetailRow label="Fragrance">{open.product || '—'}</DetailRow>
              <DetailRow label="Reviewer">
                {open.name || 'Anonymous'}
                {open.city ? ` · ${open.city}` : ''}
              </DetailRow>
              <DetailRow label="Written">{formatDate(open.date)}</DetailRow>
              <DetailRow label="Trust">
                {open.verified ? 'Verified purchase — matched to a delivered order' : 'Not matched to a delivered order'}
              </DetailRow>
              <DetailRow label="Photographs">{open.photos || 'None'}</DetailRow>
              <DetailRow label="Marked helpful">{open.helpful ?? 0}</DetailRow>
              <DetailRow label="Status">
                <StatusPill status={open.status} />
              </DetailRow>
            </dl>

            {isOwner && (
              <Button variant="danger" icon="trash" onClick={() => remove(open)} loading={busy}>
                Delete review
              </Button>
            )}
          </div>
        )}
      </Drawer>
    </div>
  )
}

export default ReviewsPage
