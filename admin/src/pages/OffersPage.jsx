import { useMemo, useState } from 'react'
import { Button, IconButton } from '@/components/ui/Button'
import { Chip, StatusPill } from '@/components/ui/Badge'
import { DataTable } from '@/components/ui/DataTable'
import { Toolbar, PillTabs, Pagination } from '@/components/ui/Toolbar'
import { EmptyState, ErrorState } from '@/components/ui/Feedback'
import { Modal } from '@/components/ui/Modal'
import { Input, Textarea, Checkbox, FieldGroup } from '@/components/ui/Form'
import useDataTable from '@/hooks/useDataTable'
import useDocumentTitle from '@/hooks/useDocumentTitle'
import { PageHeader } from '@/components/ui/PageHeader'
import { useServerResource, useServerAction } from '@/hooks/useServerResource'
import { formatPrice, formatDate } from '@/lib/format'
import adminApi from '@/services/adminApi'
import { useAdminStore } from '@/store/adminStore'
import { useSessionStore } from '@/store/sessionStore'

/**
 * Offers & Coupons.
 *
 * The discount codes the storefront's offers page advertises and the cart
 * validates. What is edited here is the **rule**, not the copy: `type`, `value`,
 * `minOrder` and `cap` are the same four fields `couponDiscount()` prices with
 * (`backend/src/lib/pricing.js`), so a code cannot advertise one thing on the
 * offers page and charge another at checkout.
 *
 * This screen keeps no local copy of anything. `../store/adminStore` holds the
 * catalogue, the order book and the ledger, and coupons are deliberately not in
 * it: a coupon table seeded from fixtures would be a list of discounts that do
 * not exist, and it is a short step from there to a shop honouring one. So the
 * read is live, a failure says so, and every write re-reads rather than guessing
 * what the row now looks like.
 */

/** Mirrors `TIERS` in `backend/src/models/Product.js` — the scope a code may target. */
const TIERS = ['Original', 'Inspired', 'Mixed', 'Attar', 'Combo', 'Bakhoor', 'Car Perfume']

const blankCoupon = () => ({
  code: '',
  label: '',
  headline: '',
  description: '',
  terms: '',
  type: 'percent',
  value: '',
  minOrder: '',
  cap: '',
  usageLimit: '',
  startsAt: '',
  endsAt: '',
  active: true,
  tiers: [],
  excludeTiers: [],
  categories: [],
})

/** The server sends ISO instants; `<input type="date">` wants `YYYY-MM-DD`. */
const dateInput = (value) => (value ? String(value).slice(0, 10) : '')

/** "Up to 15% off" — uniform "up to" percentage phrasing across table and modal. */
const describe = (coupon) =>
  coupon.cap ? `Up to ${coupon.value}% off (max ${formatPrice(coupon.cap)})` : `Up to ${coupon.value}% off`

/** Is the code usable *right now*? An inactive code and a future one both read as off. */
function state(coupon) {
  if (!coupon.active) return 'Inactive'
  const now = Date.now()
  if (coupon.startsAt && new Date(coupon.startsAt).getTime() > now) return 'Scheduled'
  if (coupon.endsAt && new Date(coupon.endsAt).getTime() < now) return 'Expired'
  return 'Live'
}

export function OffersPage() {
  useDocumentTitle('Offers & Coupons')

  const isOwner = useSessionStore((state) => state.user?.role === 'owner')
  const categories = useAdminStore((store) => store.categories)
  const { run, busy } = useServerAction()

  const [filter, setFilter] = useState('All')
  const [editing, setEditing] = useState(null)
  const [draft, setDraft] = useState(blankCoupon)

  const { data, loading, error, reload, refused } = useServerResource(() => adminApi.listCoupons())
  const coupons = useMemo(() => data ?? [], [data])

  const counts = useMemo(
    () =>
      coupons.reduce(
        (totals, coupon) => {
          const key = state(coupon)
          totals[key] = (totals[key] ?? 0) + 1
          totals.All += 1
          return totals
        },
        { All: 0 },
      ),
    [coupons],
  )

  const scoped = useMemo(
    () => coupons.filter((coupon) => filter === 'All' || state(coupon) === filter),
    [coupons, filter],
  )

  const table = useDataTable({
    rows: scoped,
    pageSize: 10,
    matches: (coupon, query) =>
      [coupon.code, coupon.label, coupon.headline, coupon.description].join(' ').toLowerCase().includes(query),
    compare: {
      code: (coupon) => coupon.code,
      value: (coupon) => coupon.value,
      minOrder: (coupon) => coupon.minOrder ?? 0,
      used: (coupon) => coupon.usedCount ?? 0,
    },
  })

  const openNew = () => {
    setDraft(blankCoupon())
    setEditing('new')
  }

  const openEdit = (coupon) => {
    // `scope` arrives nested and the form edits it flat, so the four fields are
    // lifted out here rather than carried around as a subdocument the inputs
    // would each have to reach into.
    setDraft({
      ...blankCoupon(),
      ...coupon,
      tiers: coupon.scope?.tiers ?? [],
      excludeTiers: coupon.scope?.excludeTiers ?? [],
      categories: coupon.scope?.categories ?? [],
      startsAt: dateInput(coupon.startsAt),
      endsAt: dateInput(coupon.endsAt),
    })
    setEditing(coupon.id)
  }

  const close = () => setEditing(null)

  const save = async () => {
    const isNew = editing === 'new'
    const result = await run(
      () => (isNew ? adminApi.createCoupon(draft) : adminApi.saveCoupon(editing, draft)),
      { success: isNew ? `${draft.code.toUpperCase()} is live` : `${draft.code.toUpperCase()} updated` },
    )
    // Only close and re-read when the server actually took the change. `run`
    // returns null on both a refusal and an unreachable server, and the form
    // stays open either way so the operator's typing is not thrown away.
    if (!result) return
    close()
    reload()
  }

  const toggleActive = async (coupon) => {
    const result = await run(() => adminApi.setCouponActive(coupon.id, !coupon.active), {
      success: `${coupon.code} ${coupon.active ? 'paused' : 'resumed'}`,
    })
    if (result) reload()
  }

  const remove = async (coupon) => {
    // Deleting a code a shopper has written down is worth a second look, and the
    // panel has no undo. `window.confirm` is enough for a single destructive row.
    if (!window.confirm(`Delete ${coupon.code}? Shoppers holding this code will no longer be able to use it.`)) return
    const result = await run(() => adminApi.deleteCoupon(coupon.id), { success: `${coupon.code} deleted` })
    if (result) reload()
  }

  const columns = [
    {
      key: 'code',
      header: 'Code',
      sortable: true,
      render: (coupon) => (
        <span className="block">
          <span className="tabular block font-semibold uppercase tracking-wide text-ink">{coupon.code}</span>
          <span className="block text-body-sm text-ink-muted">{coupon.label || coupon.headline || '—'}</span>
        </span>
      ),
    },
    {
      key: 'value',
      header: 'Offer',
      sortable: true,
      render: (coupon) => (
        <span className="block">
          <span className="block font-medium text-ink">{`Up to ${coupon.value}% off`}</span>
          <span className="block text-body-sm text-ink-muted">
            {coupon.cap ? `up to ${formatPrice(coupon.cap)} max` : 'uncapped percentage'}
          </span>
        </span>
      ),
    },
    {
      key: 'minOrder',
      header: 'Minimum',
      align: 'right',
      sortable: true,
      render: (coupon) => (
        <span className="tabular text-ink-variant">{coupon.minOrder ? formatPrice(coupon.minOrder) : 'None'}</span>
      ),
    },
    {
      key: 'used',
      header: 'Used',
      align: 'right',
      sortable: true,
      render: (coupon) => (
        <span className="block">
          <span className="tabular block font-semibold text-ink">{coupon.usedCount ?? 0}</span>
          <span className="block text-body-sm text-ink-muted">
            {coupon.usageLimit ? `of ${coupon.usageLimit}` : 'unlimited'}
          </span>
        </span>
      ),
    },
    {
      key: 'window',
      header: 'Window',
      render: (coupon) => (
        <span className="block whitespace-nowrap text-body-sm text-ink-variant">
          {coupon.startsAt || coupon.endsAt ? (
            <>
              <span className="block">{coupon.startsAt ? formatDate(coupon.startsAt) : 'Always'}</span>
              <span className="block text-ink-muted">to {coupon.endsAt ? formatDate(coupon.endsAt) : 'no end'}</span>
            </>
          ) : (
            'Always on'
          )}
        </span>
      ),
    },
    {
      key: 'state',
      header: 'State',
      render: (coupon) => <StatusPill status={state(coupon)} />,
    },
    ...(isOwner
      ? [
          {
            key: 'actions',
            header: 'Action',
            align: 'right',
            render: (coupon) => (
              <span className="flex items-center justify-end gap-0.5" onClick={(event) => event.stopPropagation()}>
                <Button variant="ghost" size="sm" onClick={() => toggleActive(coupon)} disabled={busy}>
                  {coupon.active ? 'Pause' : 'Resume'}
                </Button>
                <IconButton icon="edit" label={`Edit ${coupon.code}`} onClick={() => openEdit(coupon)} />
                <IconButton icon="trash" label={`Delete ${coupon.code}`} tone="danger" onClick={() => remove(coupon)} />
              </span>
            ),
          },
        ]
      : []),
  ]

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        actions={
          <>
            {isOwner && (
              <Button variant="gold" icon="plus" onClick={openNew}>
                New coupon
              </Button>
            )}
            <Button variant="ghost" size="sm" icon="refresh" onClick={reload}>
              Refresh
            </Button>
          </>
        }
      />

      <div className="card-admin-flush">
        <div className="border-b border-outline-variant/50 px-4 pt-3">
          <PillTabs
            value={filter}
            onChange={(value) => {
              setFilter(value)
              table.setPage(1)
            }}
            tabs={['All', 'Live', 'Scheduled', 'Expired', 'Inactive'].map((value) => ({
              value,
              label: value,
              count: counts[value] ?? 0,
            }))}
          />
        </div>

        <Toolbar
          search={table.query}
          onSearch={table.setQuery}
          placeholder="Search by code, label or headline…"
          actions={<span className="text-body-sm text-ink-muted">{table.total} shown</span>}
        />

        {error ? (
          <ErrorState error={error} refused={refused} onRetry={reload} />
        ) : (
          <>
            <DataTable
              columns={columns}
              rows={table.visible}
              loading={loading}
              sort={table.sort}
              onSortChange={table.setSort}
              empty={
                <EmptyState
                  icon="tag"
                  title={coupons.length === 0 ? 'No coupons yet' : 'No codes match'}
                  description={
                    coupons.length === 0
                      ? 'A coupon created here is immediately valid at the website checkout — the cart validates against these same fields.'
                      : 'Nothing on file fits this tab.'
                  }
                  action={
                    isOwner && coupons.length === 0 ? (
                      <Button icon="plus" onClick={openNew}>
                        New coupon
                      </Button>
                    ) : null
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

      <CouponModal open={Boolean(editing)} isNew={editing === 'new'} draft={draft} setDraft={setDraft} categories={categories} busy={busy} onClose={close} onSave={save} />
    </div>
  )
}

/** The create/edit form. Shared, because the two differ only in whether `code` is editable. */
function CouponModal({ open, isNew, draft, setDraft, categories, busy, onClose, onSave }) {
  const set = (patch) => setDraft((current) => ({ ...current, ...patch }))
  const toggleIn = (field, value) =>
    setDraft((current) => ({
      ...current,
      [field]: current[field].includes(value) ? current[field].filter((entry) => entry !== value) : [...current[field], value],
    }))

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={isNew ? 'New coupon' : `Edit ${draft.code || 'coupon'}`}
      description="All coupons give a percentage (%) discount up to a max rupee limit."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={onSave}
            loading={busy}
            disabled={!draft.code.trim() || !(Number(draft.value) > 0 && Number(draft.value) <= 100)}
          >
            {isNew ? 'Create coupon' : 'Save changes'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-6">
        <FieldGroup title="The code" description="The code is what a shopper types. It cannot be changed once created, because shoppers write it down.">
          <Input
            label="Code"
            required
            value={draft.code}
            disabled={!isNew}
            placeholder="Enter coupon code"
            hint={isNew ? 'Letters, digits and dashes. Saved in capital letters.' : 'Cannot be changed — delete and make a new one if needed.'}
            onChange={(event) => set({ code: event.target.value.toUpperCase() })}
          />
          <Input
            label="Label"
            value={draft.label}
            placeholder="e.g. Up to 15% Off"
            hint="Optional — defaults to 'Save up to X%' on the website."
            onChange={(event) => set({ label: event.target.value })}
          />
          <Input
            label="Headline"
            containerClassName="sm:col-span-2"
            value={draft.headline}
            placeholder="Enter offer headline"
            hint="Shown on the website's offers page above the code."
            onChange={(event) => set({ headline: event.target.value })}
          />
        </FieldGroup>

        <FieldGroup title="The rule (Up to % discount)">
          <Input
            label="Percentage off (Up to)"
            required
            type="number"
            min="1"
            max="100"
            value={draft.value}
            suffix="%"
            hint={Number(draft.value) > 0 ? `Preview: ${describe(draft)}` : 'Above 0 and no more than 100.'}
            onChange={(event) => set({ value: event.target.value })}
          />
          <Input
            label="Up to max discount"
            type="number"
            min="0"
            value={draft.cap}
            suffix="₹"
            hint="Maximum discount in ₹. Leave empty for no limit."
            onChange={(event) => set({ cap: event.target.value })}
          />
          <Input
            label="Minimum order"
            type="number"
            min="0"
            value={draft.minOrder}
            suffix="₹"
            hint="Leave empty for no minimum."
            onChange={(event) => set({ minOrder: event.target.value })}
          />
          <Input
            label="Usage limit"
            type="number"
            min="0"
            value={draft.usageLimit}
            hint="Total times this coupon can be used. Leave empty for unlimited."
            onChange={(event) => set({ usageLimit: event.target.value })}
          />
          <div className="flex items-end pb-1">
            <Checkbox
              label="Active"
              description="Inactive codes are refused at checkout but stay on file."
              checked={draft.active}
              onChange={(event) => set({ active: event.target.checked })}
            />
          </div>
        </FieldGroup>

        <FieldGroup title="Window" description="Both ends are optional. A code with neither runs until it is paused.">
          <Input
            label="Starts"
            type="date"
            value={draft.startsAt}
            onChange={(event) => set({ startsAt: event.target.value })}
          />
          <Input
            label="Ends"
            type="date"
            value={draft.endsAt}
            hint="The code stops being valid after this day."
            onChange={(event) => set({ endsAt: event.target.value })}
          />
        </FieldGroup>

        <FieldGroup
          title="Scope"
          columns={1}
          description="Choose which perfumes this code works on. Leave all unticked to allow every perfume."
        >
          <ScopeRow label="Only these types" values={TIERS} selected={draft.tiers} onToggle={(value) => toggleIn('tiers', value)} />
          <ScopeRow
            label="Except these types"
            values={TIERS}
            selected={draft.excludeTiers}
            onToggle={(value) => toggleIn('excludeTiers', value)}
          />
          {categories.length > 0 && (
            <ScopeRow
              label="Categories"
              values={categories.map((category) => category.id)}
              labels={categories.map((category) => category.name)}
              selected={draft.categories}
              onToggle={(value) => toggleIn('categories', value)}
            />
          )}
        </FieldGroup>

        <FieldGroup title="Copy" columns={1} description="Terms and description appear on the offers page and the cart.">
          <Textarea
            label="Description"
            rows={2}
            value={draft.description}
            onChange={(event) => set({ description: event.target.value })}
          />
          <Textarea label="Terms" rows={3} value={draft.terms} onChange={(event) => set({ terms: event.target.value })} />
        </FieldGroup>
      </div>
    </Modal>
  )
}

/** A row of tickable chips — the shape `scope.tiers` and `scope.categories` take. */
function ScopeRow({ label, values, labels, selected, onToggle }) {
  return (
    <div>
      <p className="field-label">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {values.map((value, index) => {
          const active = selected.includes(value)
          return (
            <button
              key={value}
              type="button"
              aria-pressed={active}
              onClick={() => onToggle(value)}
              className={
                active
                  ? 'rounded-full bg-shell-obsidian px-2.5 py-1 text-label-sm font-bold uppercase tracking-wider text-surface-low'
                  : 'rounded-full border border-outline-variant px-2.5 py-1 text-label-sm font-bold uppercase tracking-wider text-ink-variant transition-colors hover:bg-surface-low'
              }
            >
              {labels?.[index] ?? value}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default OffersPage
