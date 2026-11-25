import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Badge'
import { DataTable } from '@/components/ui/DataTable'
import { Modal } from '@/components/ui/Modal'
import { Input } from '@/components/ui/Form'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback'
import { PageHeader } from '@/components/ui/PageHeader'
import { StatCard } from '@/components/ui/StatCard'
import { PillTabs, Toolbar } from '@/components/ui/Toolbar'
import useDocumentTitle from '@/hooks/useDocumentTitle'
import useServerResource, { useServerAction } from '@/hooks/useServerResource'
import { formatDateTime, formatNumber, formatPrice } from '@/lib/format'
import adminApi from '@/services/adminApi'
import { useAdminStore } from '@/store/adminStore'
import { useUiStore } from '@/store/uiStore'

const STATUS_TONES = {
  Requested: 'pending',
  Refunded: 'done',
  Rejected: 'halted',
}

/**
 * Owner-only Manual Refund Queue.
 *
 * When a customer cancels a prepaid (Razorpay / UPI / Card / Net Banking)
 * order before it is Packed, they supply their UPI ID. The Owner transfers
 * the money manually and records the UTR / transaction reference here.
 */
export function RefundRequestsPage() {
  useDocumentTitle('Refund Requests')

  const landOrder = useAdminStore((state) => state.landOrder)
  const pushToast = useUiStore((state) => state.pushToast)
  const resource = useServerResource(() => adminApi.listRefundRequests())
  const { run, busy } = useServerAction()

  const [tab, setTab] = useState('Requested') // Requested | Refunded | Rejected | All
  const [search, setSearch] = useState('')
  const [actionModal, setActionModal] = useState(null) // { mode: 'complete'|'reject', row }
  const [refNote, setRefNote] = useState('')

  const data = resource.data
  const requests = useMemo(() => data?.requests ?? [], [data])
  const summary = data?.summary ?? {}

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return requests.filter((row) => {
      if (tab !== 'All' && row.status !== tab) return false
      if (!q) return true
      return [row.orderId, row.customerName, row.customerPhone, row.customerEmail, row.upiId, row.referenceNote]
        .join(' ')
        .toLowerCase()
        .includes(q)
    })
  }, [requests, tab, search])

  const copyUpi = (upiId) => {
    if (!upiId) return
    navigator.clipboard?.writeText(upiId)
    pushToast({ title: 'UPI ID copied', description: upiId })
  }

  const openModal = (mode, row) => {
    setRefNote('')
    setActionModal({ mode, row })
  }

  const submitAction = async () => {
    if (!actionModal || refNote.trim().length < 3 || busy) return
    const { mode, row } = actionModal
    const isComplete = mode === 'complete'
    const res = await run(
      () =>
        isComplete
          ? adminApi.completeRefundRequest(row.orderId, refNote.trim())
          : adminApi.rejectRefundRequest(row.orderId, refNote.trim()),
      {
        success: isComplete
          ? `Refund marked complete for ${row.orderId}`
          : `Refund request rejected for ${row.orderId}`,
      },
    )
    if (!res) return
    if (res.data?.order) landOrder(res.data.order)
    setActionModal(null)
    resource.reload()
  }

  const columns = [
    {
      key: 'orderId',
      header: 'Order & Payment',
      render: (row) => (
        <span className="block">
          <span className="tabular block font-semibold text-ink">{row.orderId}</span>
          <span className="block text-[12px] uppercase text-ink-muted">
            {row.paymentMethod || 'Online'} · {formatDateTime(row.requestedAt)}
          </span>
        </span>
      ),
    },
    {
      key: 'customer',
      header: 'Customer',
      render: (row) => (
        <span className="block min-w-0">
          <span className="block font-semibold text-ink">{row.customerName}</span>
          <span className="tabular block truncate text-[12px] text-ink-muted">
            {[row.customerPhone, row.customerEmail].filter(Boolean).join(' · ') || '—'}
          </span>
        </span>
      ),
    },
    {
      key: 'amount',
      header: 'Refund Amount',
      align: 'right',
      render: (row) => (
        <span className="tabular block text-right font-semibold text-ink">{formatPrice(row.amount)}</span>
      ),
    },
    {
      key: 'upiId',
      header: 'Customer UPI ID',
      render: (row) => (
        <div className="flex items-center gap-2">
          <span className="rounded border border-brand-gold/40 bg-brand-gold/10 px-2.5 py-1 font-mono text-[12px] font-semibold text-ink">
            {row.upiId || '—'}
          </span>
          {row.upiId && (
            <Button variant="ghost" size="sm" icon="copy" onClick={() => copyUpi(row.upiId)}>
              Copy
            </Button>
          )}
        </div>
      ),
    },
    {
      key: 'reason',
      header: 'Items & Reason',
      render: (row) => (
        <span className="block max-w-xs">
          <span className="block truncate text-body-sm text-ink">{row.reason || 'Cancelled before packing'}</span>
          <span className="block truncate text-[11px] text-ink-muted">{row.items?.join(', ')}</span>
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status & Ref',
      render: (row) => (
        <span className="block">
          <Chip tone={STATUS_TONES[row.status] ?? 'muted'}>{row.status}</Chip>
          {row.referenceNote && (
            <span className="mt-1 block text-[11px] text-ink-muted">Ref: {row.referenceNote}</span>
          )}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Owner Action',
      align: 'right',
      render: (row) =>
        row.status === 'Requested' ? (
          <span className="flex items-center justify-end gap-1.5">
            <Button variant="gold" size="sm" icon="check" onClick={() => openModal('complete', row)}>
              Mark Refunded
            </Button>
            <Button variant="ghost" size="sm" onClick={() => openModal('reject', row)}>
              Reject
            </Button>
          </span>
        ) : (
          <span className="text-[12px] text-ink-muted">
            {row.processedBy ? `By ${row.processedBy}` : 'Closed'}
          </span>
        ),
    },
  ]

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        actions={
          <Button variant="ghost" size="sm" icon="refresh" onClick={resource.reload}>
            Refresh
          </Button>
        }
      />

      <div className="rounded-lg border border-brand-gold/40 bg-brand-gold/10 px-4 py-3 text-body-sm text-ink-variant">
        <strong>Owner-Only Manual Refunds:</strong> Customers can cancel orders only <em>before</em> packing starts. For Razorpay / online payments, their UPI ID appears below — copy the UPI ID, pay manually from PhonePe / GPay / Paytm, and click <strong>Mark Refunded</strong> with the UTR reference number.
      </div>

      {resource.error ? (
        <div className="card-admin">
          <ErrorState error={resource.error} refused={resource.refused} onRetry={resource.reload} />
        </div>
      ) : !data && resource.loading ? (
        <div className="grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-[104px]" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard
              label="Pending Refund Requests"
              value={formatNumber(summary.pendingCount)}
              hint={`${formatPrice(summary.pendingAmount || 0)} waiting to transfer`}
              icon="clock"
              tone={summary.pendingCount ? 'pending' : 'done'}
            />
            <StatCard
              label="Refunded Manually"
              value={formatNumber(summary.refundedCount)}
              hint={`${formatPrice(summary.refundedAmount || 0)} returned to customers`}
              icon="check-circle"
              tone="done"
            />
            <StatCard
              label="Rejected"
              value={formatNumber(summary.rejectedCount)}
              hint="declined refund requests"
              icon="alert"
              tone="halted"
            />
          </div>

          <div className="card-admin-flush">
            <div className="border-b border-outline-variant/50 px-4 pt-3">
              <PillTabs
                value={tab}
                onChange={setTab}
                tabs={[
                  { value: 'Requested', label: 'Pending', count: summary.pendingCount ?? 0 },
                  { value: 'Refunded', label: 'Refunded', count: summary.refundedCount ?? 0 },
                  { value: 'Rejected', label: 'Rejected', count: summary.rejectedCount ?? 0 },
                  { value: 'All', label: 'All', count: requests.length },
                ]}
              />
            </div>

            <Toolbar
              search={search}
              onSearch={setSearch}
              placeholder="Search order #, name, phone or UPI ID…"
              actions={<span className="text-body-sm text-ink-muted">{filtered.length} shown</span>}
            />

            <DataTable
              columns={columns}
              rows={filtered}
              empty={
                <EmptyState
                  icon="card"
                  title={tab === 'Requested' ? 'No pending refund requests' : 'No refund requests here'}
                  description="When a customer cancels a prepaid order before packing and enters their UPI ID, it will show up here for manual refund."
                />
              }
            />
          </div>
        </>
      )}

      <Modal
        open={Boolean(actionModal)}
        onClose={() => setActionModal(null)}
        size="sm"
        title={
          actionModal?.mode === 'complete'
            ? `Complete Refund · ${actionModal.row.orderId}`
            : `Reject Refund · ${actionModal?.row.orderId}`
        }
        description={
          actionModal
            ? `${actionModal.row.customerName} · ${formatPrice(actionModal.row.amount)}`
            : ''
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setActionModal(null)}>
              Cancel
            </Button>
            <Button
              variant={actionModal?.mode === 'complete' ? 'gold' : 'danger'}
              icon={actionModal?.mode === 'complete' ? 'check' : 'close'}
              loading={busy}
              disabled={refNote.trim().length < 3}
              onClick={submitAction}
            >
              {actionModal?.mode === 'complete' ? 'Confirm Refunded' : 'Reject Request'}
            </Button>
          </>
        }
      >
        {actionModal && (
          <div className="flex flex-col gap-4">
            <div className="rounded border border-brand-gold/40 bg-brand-gold/10 p-3.5 text-body-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="text-ink-muted">Customer UPI ID</span>
                <Button variant="ghost" size="sm" icon="copy" onClick={() => copyUpi(actionModal.row.upiId)}>
                  Copy
                </Button>
              </div>
              <p className="mt-1 font-mono text-base font-bold text-ink">{actionModal.row.upiId}</p>
              <p className="mt-1 text-ink-variant">
                Amount to pay: <strong>{formatPrice(actionModal.row.amount)}</strong>
              </p>
            </div>

            <Input
              label={actionModal.mode === 'complete' ? 'UPI / UTR Reference Number' : 'Rejection Reason'}
              required
              value={refNote}
              onChange={(e) => setRefNote(e.target.value)}
              placeholder={
                actionModal.mode === 'complete'
                  ? 'e.g. UTR 432198765432 or Paid via GPay'
                  : 'Explain why refund is declined'
              }
              hint={
                actionModal.mode === 'complete'
                  ? 'Pay manually to the UPI ID above first, then paste the UTR reference number here.'
                  : 'Shown cleanly to owner/customer record.'
              }
              data-autofocus
            />
          </div>
        )}
      </Modal>
    </div>
  )
}

export default RefundRequestsPage

