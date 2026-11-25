import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, IconButton } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Badge'
import { DataTable } from '@/components/ui/DataTable'
import { Drawer, Modal } from '@/components/ui/Modal'
import { Input, SearchInput } from '@/components/ui/Form'
import { Icon } from '@/components/ui/Icon'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback'
import { PageHeader } from '@/components/ui/PageHeader'
import { Panel, StatCard } from '@/components/ui/StatCard'
import { PillTabs, Toolbar, FilterSelect } from '@/components/ui/Toolbar'
import { BenefitEmailModal } from '@/components/modals/BenefitEmailModal'
import useDocumentTitle from '@/hooks/useDocumentTitle'
import useServerResource, { useServerAction } from '@/hooks/useServerResource'
import { formatDate, formatDateTime, formatNumber, formatPrice, formatRelative, initials } from '@/lib/format'
import adminApi from '@/services/adminApi'
import { useSessionStore } from '@/store/sessionStore'

const SEGMENT_TONES = {
  VIP: 'gold',
  Regular: 'done',
  Repeat: 'active',
  'One-Time': 'muted',
}

/**
 * Customer Repetition Analysis & Email Benefits.
 *
 * Groups all Shop Counter bills and Website orders by Email, Phone, and Name
 * so the shop owner can immediately spot repeat buyers, view what perfumes they
 * buy, configure automatic loyalty rewards, and send discount codes via email.
 */
export function RepeatCustomersPage() {
  useDocumentTitle('Repeat Customers')
  const navigate = useNavigate()
  const isOwner = useSessionStore((state) => state.user?.role === 'owner')

  const resource = useServerResource(() => adminApi.getRepeatCustomers())
  const { run, busy } = useServerAction()

  const [tab, setTab] = useState('analysis') // analysis | rules | emails
  const [segment, setSegment] = useState('repeat') // all | repeat | regular | vip | one
  const [channelFilter, setChannelFilter] = useState('all') // all | Shop | Website | both
  const [matchFilter, setMatchFilter] = useState('all') // all | email | phone | name-only
  const [search, setSearch] = useState('')

  const [openKey, setOpenKey] = useState(null)
  const [benefitTarget, setBenefitTarget] = useState(null)
  const [bulkTargets, setBulkTargets] = useState(null)
  const [emailPreview, setEmailPreview] = useState(null)

  const [rulesDraft, setRulesDraft] = useState(null)

  const data = resource.data
  const customers = useMemo(() => data?.customers ?? [], [data])
  const summary = data?.summary ?? {}
  const rules = data?.rules
  const smtp = data?.smtp ?? {}
  const emailLogs = useMemo(() => data?.emailLogs ?? [], [data])

  useEffect(() => {
    if (rules) setRulesDraft(rules)
  }, [rules])

  const filteredCustomers = useMemo(() => {
    const q = search.trim().toLowerCase()
    return customers.filter((c) => {
      if (segment === 'repeat' && c.visits < 2) return false
      if (segment === 'regular' && c.visits < 3) return false
      if (segment === 'vip' && c.visits < 5) return false
      if (segment === 'one' && c.visits !== 1) return false

      if (channelFilter === 'Shop' && c.shopVisits === 0) return false
      if ((channelFilter === 'Website' || channelFilter === 'Storefront') && c.onlineVisits === 0) return false
      if (channelFilter === 'both' && (c.shopVisits === 0 || c.onlineVisits === 0)) return false

      if (matchFilter === 'email' && !c.hasRealEmail) return false
      if (matchFilter === 'phone' && !c.phoneKey) return false
      if (matchFilter === 'name-only' && (c.hasRealEmail || c.phoneKey)) return false

      if (!q) return true
      const haystack = [
        c.name,
        c.phone,
        c.email,
        c.matchedBy?.join(' '),
        ...(c.topProducts ?? []).map((p) => p.name),
      ]
        .join(' ')
        .toLowerCase()
      return haystack.includes(q)
    })
  }, [customers, segment, channelFilter, matchFilter, search])

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.key === openKey) ?? null,
    [customers, openKey],
  )

  const repeatWithEmail = useMemo(
    () => customers.filter((c) => c.visits >= 2 && c.hasRealEmail),
    [customers],
  )

  const openEmailPreviewModal = async (logId) => {
    try {
      const res = await adminApi.getEmailLog(logId)
      setEmailPreview(res.email)
    } catch {
      // handled cleanly by silence
    }
  }

  const saveRules = async () => {
    if (!rulesDraft || busy) return
    const res = await run(() => adminApi.saveRepeatRules(rulesDraft), {
      success: 'Repeat benefit rules saved',
    })
    if (res) resource.reload()
  }

  const columns = [
    {
      key: 'name',
      header: 'Customer & Match',
      render: (c) => (
        <span className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-shell-obsidian text-[11px] font-bold text-brand-gold">
            {initials(c.name)}
          </span>
          <span className="min-w-0">
            <span className="flex flex-wrap items-center gap-1.5">
              <span className="truncate font-semibold text-ink">{c.name}</span>
              <Chip tone={SEGMENT_TONES[c.segment] ?? 'muted'}>{c.segment}</Chip>
              {c.staff && <Chip tone="muted">Staff</Chip>}
            </span>
            <span className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px] text-ink-muted">
              Matched by: {(c.matchedBy ?? ['Name']).join(' + ')}
            </span>
          </span>
        </span>
      ),
    },
    {
      key: 'contact',
      header: 'Phone & Email',
      render: (c) => (
        <span className="block min-w-0">
          <span className="tabular block text-body-sm font-medium text-ink">
            {c.phone || <span className="text-ink-muted">No phone</span>}
          </span>
          <span className="block truncate text-[12px] text-ink-muted">
            {c.email || <span className="text-state-pending">No email yet</span>}
          </span>
        </span>
      ),
    },
    {
      key: 'visits',
      header: 'Repetition / Visits',
      align: 'right',
      render: (c) => (
        <span className="block text-right">
          <span className="tabular block font-semibold text-ink">
            {c.visits} {c.visits === 1 ? 'visit' : 'visits'}
          </span>
          <span className="block text-[11px] text-ink-muted">
            {c.shopVisits > 0 ? `${c.shopVisits} Shop` : ''}
            {c.shopVisits > 0 && c.onlineVisits > 0 ? ' · ' : ''}
            {c.onlineVisits > 0 ? `${c.onlineVisits} Online` : ''}
            {c.avgDaysBetweenVisits !== null ? ` · ~${c.avgDaysBetweenVisits}d gap` : ''}
          </span>
        </span>
      ),
    },
    {
      key: 'spent',
      header: 'Spend & Favorite',
      align: 'right',
      render: (c) => (
        <span className="block text-right">
          <span className="tabular block font-semibold text-ink">{formatPrice(c.totalSpent)}</span>
          <span className="block truncate text-[11px] text-ink-muted">
            Avg {formatPrice(c.averageBill)}
            {c.topProducts?.[0] ? ` · ${c.topProducts[0].name}` : ''}
          </span>
        </span>
      ),
    },
    {
      key: 'benefit',
      header: 'Customer Benefit',
      render: (c) => {
        const activeCoupon = c.issuedCoupons?.find((cp) => cp.active)
        return (
          <span className="block">
            {c.eligibleBenefit ? (
              <Chip tone="gold">{c.eligibleBenefit.discountPercent}% OFF eligible</Chip>
            ) : (
              <span className="text-[12px] text-ink-muted">
                {c.nextBenefit ? `Next bill (${c.nextBenefit.minVisits}): ${c.nextBenefit.discountPercent}% off` : '1st visit'}
              </span>
            )}
            {activeCoupon && (
              <span className="mt-1 block font-mono text-[11px] font-semibold text-state-done">
                Code: {activeCoupon.code}
              </span>
            )}
          </span>
        )
      },
    },
    {
      key: 'actions',
      header: 'Action',
      align: 'right',
      render: (c) => (
        <span className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
          <IconButton icon="eye" label={`View ${c.name} history`} onClick={() => setOpenKey(c.key)} />
          <Button
            variant={c.visits >= 2 ? 'gold' : 'outline'}
            size="sm"
            icon="mail"
            onClick={() => setBenefitTarget(c)}
          >
            {c.hasRealEmail ? 'Send Benefit' : 'Add Email & Send'}
          </Button>
        </span>
      ),
    },
  ]

  const emailLogColumns = [
    {
      key: 'recipient',
      header: 'Customer & Email',
      render: (row) => (
        <span className="block">
          <span className="block font-semibold text-ink">{row.recipientName || 'Customer'}</span>
          <span className="block text-body-sm text-ink-muted">{row.to}</span>
        </span>
      ),
    },
    {
      key: 'coupon',
      header: 'Benefit & Code',
      render: (row) => (
        <span className="block">
          <span className="font-mono font-semibold text-ink">{row.couponCode || '—'}</span>
          <span className="block text-[12px] text-ink-muted">
            {row.discountPercent ? `${row.discountPercent}% OFF` : ''} · Visit #{row.visitsAtSend || 1}
          </span>
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (row) => (
        <Chip tone={row.status === 'sent' ? 'done' : row.status === 'failed' ? 'halted' : 'pending'}>
          {row.status === 'sent' ? 'Delivered' : row.status === 'failed' ? 'Failed' : 'Preview Ready'}
        </Chip>
      ),
    },
    {
      key: 'sentAt',
      header: 'When',
      align: 'right',
      render: (row) => (
        <span className="block text-right text-body-sm text-ink-muted">
          <span className="block">{formatDateTime(row.sentAt)}</span>
          <span className="block text-[11px]">by {row.sentBy}</span>
        </span>
      ),
    },
    {
      key: 'action',
      header: '',
      align: 'right',
      render: (row) => (
        <Button variant="outline" size="sm" icon="eye" onClick={() => openEmailPreviewModal(row.id)}>
          View Email
        </Button>
      ),
    },
  ]

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" icon="receipt" onClick={() => navigate('/billing')}>
              Counter Sale
            </Button>
            {isOwner && (
              <Button
                variant="gold"
                size="sm"
                icon="mail"
                disabled={repeatWithEmail.length === 0}
                onClick={() => setBulkTargets(repeatWithEmail)}
              >
                Email All Repeat ({repeatWithEmail.length})
              </Button>
            )}
            <Button variant="ghost" size="sm" icon="refresh" onClick={resource.reload}>
              Refresh
            </Button>
          </div>
        }
      />

      {!smtp.configured && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-state-pending/40 bg-state-pendingSurface/60 px-4 py-3 text-body-sm">
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-ink">Email delivery is in Preview Mode (Gmail / SMTP not added yet)</p>
            <p className="text-ink-variant">
              {isOwner
                ? 'Coupons still work immediately and email previews are saved below. Connect Gmail / SMTP in Settings to send directly to customer inboxes.'
                : 'Coupons work immediately at checkout and counter billing. Ask the Shop Owner to connect Gmail / SMTP in Settings.'}
            </p>
          </div>
          {isOwner && (
            <Button variant="outline" size="sm" icon="settings" onClick={() => navigate('/settings')}>
              Setup Gmail / SMTP
            </Button>
          )}
        </div>
      )}

      {resource.error ? (
        <div className="card-admin">
          <ErrorState error={resource.error} refused={resource.refused} onRetry={resource.reload} />
        </div>
      ) : !data && resource.loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-[104px]" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Identified Customers"
              value={formatNumber(summary.totalCustomers)}
              hint={
                summary.anonymousCounterBills > 0
                  ? `${summary.anonymousCounterBills} walk-in bills had no name/phone`
                  : 'Matched across Name, Phone & Email'
              }
              icon="users"
            />
            <StatCard
              label="Repeat Customers (2+)"
              value={formatNumber(summary.repeatCustomers)}
              hint={`${summary.repeatRatePercent ?? 0}% of customers came back`}
              icon="history"
              tone="gold"
            />
            <StatCard
              label="Repeat Customer Sales"
              value={formatPrice(summary.repeatRevenue)}
              hint={`${summary.repeatRevenuePercent ?? 0}% of total revenue`}
              icon="trending-up"
              tone="done"
            />
            <StatCard
              label="Benefits Emailed"
              value={formatNumber(summary.benefitsSentCount)}
              hint={`${summary.activeBenefitCoupons ?? 0} active reward codes`}
              icon="mail"
              tone="active"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <PillTabs
              tabs={[
                { value: 'analysis', label: 'Repeat Analysis', count: customers.length },
                { value: 'rules', label: 'Benefit Rules' },
                { value: 'emails', label: 'Sent Benefit Emails', count: emailLogs.length },
              ]}
              value={tab}
              onChange={setTab}
            />
          </div>

          {tab === 'analysis' && (
            <div className="card-admin-flush">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-outline-variant/50 px-4 py-3">
                <PillTabs
                  tabs={[
                    { value: 'repeat', label: 'All Repeat (2+)', count: summary.repeatCustomers },
                    { value: 'regular', label: 'Regular (3+)', count: summary.regularCustomers },
                    { value: 'vip', label: 'VIP (5+)', count: summary.vipCustomers },
                    { value: 'all', label: 'Everyone', count: summary.totalCustomers },
                    { value: 'one', label: '1st Visit Only', count: summary.oneTimeCustomers },
                  ]}
                  value={segment}
                  onChange={setSegment}
                />
              </div>

              <Toolbar
                search={search}
                onSearch={setSearch}
                placeholder="Search name, phone, email or perfume…"
                filters={
                  <>
                    <FilterSelect
                      label="Channel"
                      value={channelFilter}
                      onChange={setChannelFilter}
                      options={[
                        { value: 'all', label: 'Shop + Online' },
                        { value: 'Shop', label: 'Shop Counter Bills' },
                        { value: 'Website', label: 'Website Orders' },
                        { value: 'both', label: 'Both Shop & Online' },
                      ]}
                    />
                    <FilterSelect
                      label="Contact Info"
                      value={matchFilter}
                      onChange={setMatchFilter}
                      options={[
                        { value: 'all', label: 'Any Identifier' },
                        { value: 'email', label: 'Has Real Email' },
                        { value: 'phone', label: 'Has Phone Number' },
                        { value: 'name-only', label: 'Matched by Name Only' },
                      ]}
                    />
                  </>
                }
                actions={<span className="text-body-sm text-ink-muted">{filteredCustomers.length} shown</span>}
              />

              <DataTable
                columns={columns}
                rows={filteredCustomers}
                onRowClick={(c) => setOpenKey(c.key)}
                empty={
                  <EmptyState
                    icon="history"
                    title="No customers in this filter yet"
                    description="Whenever a customer buys again at Counter Sale or Website with the same Email, Phone, or Name, their repeat visits will appear here automatically."
                  />
                }
              />
            </div>
          )}

          {tab === 'rules' && rulesDraft && (
            <Panel
              title="Automatic Repeat Customer Benefits"
              description="Decide when a returning customer earns a discount coupon and whether it emails automatically after billing."
              action={
                isOwner && (
                  <Button variant="gold" icon="check" loading={busy} onClick={saveRules}>
                    Save Rules
                  </Button>
                )
              }
            >
              <div className="flex flex-col gap-5">
                <label className="flex cursor-pointer items-start justify-between gap-4 rounded border border-outline-variant/60 bg-surface-low/50 p-4">
                  <div>
                    <p className="font-semibold text-ink">Auto-email benefit coupon on repeat purchase</p>
                    <p className="mt-0.5 text-body-sm text-ink-muted">
                      When ON, if a customer has an email and crosses a visit milestone below (shop counter or website), the system issues a personal discount code and emails it automatically.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={Boolean(rulesDraft.autoSendEmail)}
                    disabled={!isOwner}
                    onChange={(e) => setRulesDraft((prev) => ({ ...prev, autoSendEmail: e.target.checked }))}
                    className="mt-1 h-5 w-5 accent-brand-gold"
                  />
                </label>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Input
                    label="Coupon Valid Days"
                    type="number"
                    min="1"
                    max="365"
                    suffix="days"
                    disabled={!isOwner}
                    value={rulesDraft.validityDays}
                    onChange={(e) => setRulesDraft((prev) => ({ ...prev, validityDays: Number(e.target.value) || 30 }))}
                  />
                  <Input
                    label="Minimum Order for Reward"
                    type="number"
                    min="0"
                    suffix="₹"
                    disabled={!isOwner}
                    value={rulesDraft.minOrderAmount}
                    onChange={(e) => setRulesDraft((prev) => ({ ...prev, minOrderAmount: Number(e.target.value) || 0 }))}
                    hint="0 means customer can use the reward on any order."
                  />
                </div>

                <div>
                  <p className="field-label mb-2">Repeat Customer Discount Tiers</p>
                  <div className="flex flex-col gap-3">
                    {(rulesDraft.tiers ?? []).map((tier, idx) => (
                      <div
                        key={tier.id || idx}
                        className="grid gap-3 rounded border border-outline-variant/60 bg-surface-low/40 p-3 sm:grid-cols-[1fr_130px_130px]"
                      >
                        <Input
                          label="Tier Name"
                          disabled={!isOwner}
                          value={tier.label}
                          onChange={(e) =>
                            setRulesDraft((prev) => ({
                              ...prev,
                              tiers: prev.tiers.map((t, i) => (i === idx ? { ...t, label: e.target.value } : t)),
                            }))
                          }
                        />
                        <Input
                          label="Min Visits"
                          type="number"
                          min="2"
                          max="100"
                          disabled={!isOwner}
                          value={tier.minVisits}
                          onChange={(e) =>
                            setRulesDraft((prev) => ({
                              ...prev,
                              tiers: prev.tiers.map((t, i) =>
                                i === idx ? { ...t, minVisits: Number(e.target.value) || 2 } : t,
                              ),
                            }))
                          }
                        />
                        <Input
                          label="Discount %"
                          type="number"
                          min="1"
                          max="80"
                          suffix="%"
                          disabled={!isOwner}
                          value={tier.discountPercent}
                          onChange={(e) =>
                            setRulesDraft((prev) => ({
                              ...prev,
                              tiers: prev.tiers.map((t, i) =>
                                i === idx ? { ...t, discountPercent: Number(e.target.value) || 5 } : t,
                              ),
                            }))
                          }
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </Panel>
          )}

          {tab === 'emails' && (
            <div className="card-admin-flush">
              <DataTable
                columns={emailLogColumns}
                rows={emailLogs}
                empty={
                  <EmptyState
                    icon="mail"
                    title="No benefit emails yet"
                    description="Click Send Benefit on any repeat customer or create a bill with a customer's email."
                  />
                }
              />
            </div>
          )}
        </>
      )}

      {/* Customer Repeat History Drawer */}
      <Drawer
        open={Boolean(selectedCustomer)}
        onClose={() => setOpenKey(null)}
        title={selectedCustomer?.name || 'Customer'}
        subtitle={
          selectedCustomer
            ? `${selectedCustomer.visits} ${selectedCustomer.visits === 1 ? 'purchase' : 'purchases'} · Matched by ${(selectedCustomer.matchedBy ?? ['Name']).join(', ')}`
            : ''
        }
        width="max-w-xl"
        footer={
          selectedCustomer && (
            <>
              <Button variant="ghost" onClick={() => setOpenKey(null)}>
                Close
              </Button>
              <Button
                variant="gold"
                icon="mail"
                onClick={() => {
                  const target = selectedCustomer
                  setOpenKey(null)
                  setBenefitTarget(target)
                }}
              >
                {selectedCustomer.hasRealEmail ? 'Send Benefit Email' : 'Add Email & Send Benefit'}
              </Button>
            </>
          )
        }
      >
        {selectedCustomer && (
          <div className="flex flex-col gap-5">
            <div className="rounded border border-outline-variant/60 bg-surface-low/50 p-3.5 text-body-sm">
              <div className="flex flex-wrap items-center gap-2">
                <Chip tone={SEGMENT_TONES[selectedCustomer.segment] ?? 'muted'}>{selectedCustomer.segment}</Chip>
                {selectedCustomer.eligibleBenefit && (
                  <Chip tone="gold">{selectedCustomer.eligibleBenefit.discountPercent}% Benefit Eligible</Chip>
                )}
              </div>
              <p className="mt-2 text-ink-variant">
                <strong>Phone:</strong> {selectedCustomer.phone || 'Not saved'} · <strong>Email:</strong>{' '}
                {selectedCustomer.email || 'Not saved yet'}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: 'Total Visits', value: selectedCustomer.visits },
                { label: 'Shop / Online', value: `${selectedCustomer.shopVisits} / ${selectedCustomer.onlineVisits}` },
                { label: 'Total Spent', value: formatPrice(selectedCustomer.totalSpent) },
                { label: 'Avg Bill', value: formatPrice(selectedCustomer.averageBill) },
              ].map((stat) => (
                <div key={stat.label} className="rounded border border-outline-variant/60 bg-surface-low/40 px-3 py-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-ink-muted">{stat.label}</p>
                  <p className="tabular mt-0.5 text-body-md font-semibold text-ink">{stat.value}</p>
                </div>
              ))}
            </div>

            {selectedCustomer.topProducts?.length > 0 && (
              <section>
                <h3 className="mb-2 text-label-md font-bold uppercase text-ink-variant">Most Bought Perfumes</h3>
                <div className="flex flex-wrap gap-2">
                  {selectedCustomer.topProducts.map((p) => (
                    <Chip key={p.name} tone="active">
                      {p.name} ({p.qty})
                    </Chip>
                  ))}
                </div>
              </section>
            )}

            {selectedCustomer.issuedCoupons?.length > 0 && (
              <section>
                <h3 className="mb-2 text-label-md font-bold uppercase text-ink-variant">Personal Benefit Coupons</h3>
                <ul className="divide-y divide-outline-variant/40 rounded border border-outline-variant/60">
                  {selectedCustomer.issuedCoupons.map((cp) => (
                    <li key={cp.code} className="flex items-center justify-between gap-2 px-3 py-2 text-body-sm">
                      <div>
                        <span className="font-mono font-semibold text-ink">{cp.code}</span>
                        <span className="ml-2 text-ink-muted">{cp.value}% OFF</span>
                      </div>
                      <Chip tone={cp.usedCount > 0 ? 'muted' : cp.active ? 'done' : 'halted'}>
                        {cp.usedCount > 0 ? 'Used' : cp.active ? 'Ready to Use' : 'Expired'}
                      </Chip>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section>
              <h3 className="mb-2 text-label-md font-bold uppercase text-ink-variant">
                Every Visit &amp; Bill ({selectedCustomer.orders.length})
              </h3>
              <ul className="divide-y divide-outline-variant/40 rounded border border-outline-variant/60">
                {selectedCustomer.orders.map((ord) => (
                  <li key={ord.number} className="flex flex-col gap-1 px-3.5 py-2.5 text-body-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-ink">
                        {ord.number} · {ord.channel === 'Shop' ? 'Shop Counter Bill' : 'Website Order'}
                      </span>
                      <span className="tabular font-semibold text-ink">{formatPrice(ord.amount)}</span>
                    </div>
                    <p className="text-ink-muted">{ord.itemsSummary || 'Perfume purchase'}</p>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-ink-muted">
                      <span>
                        {formatDate(ord.placedAt)} ({formatRelative(ord.placedAt)}) · {ord.paymentMethod}
                      </span>
                      <span>Matched via {ord.matchedVia?.join(', ')}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        )}
      </Drawer>

      <BenefitEmailModal
        open={Boolean(benefitTarget) || Boolean(bulkTargets)}
        target={benefitTarget}
        bulkRecipients={bulkTargets}
        rules={rules}
        onSent={resource.reload}
        onClose={() => {
          setBenefitTarget(null)
          setBulkTargets(null)
        }}
      />

      <Modal
        open={Boolean(emailPreview)}
        onClose={() => setEmailPreview(null)}
        size="lg"
        title={emailPreview?.subject || 'Email Preview'}
        description={emailPreview ? `To: ${emailPreview.to} · Coupon: ${emailPreview.couponCode || '—'}` : ''}
        footer={
          <Button variant="gold" onClick={() => setEmailPreview(null)}>
            Close
          </Button>
        }
      >
        {emailPreview && (
          <div className="flex flex-col gap-3">
            {emailPreview.html ? (
              <div
                className="max-h-[65vh] overflow-y-auto rounded border border-outline-variant bg-white p-2"
                dangerouslySetInnerHTML={{ __html: emailPreview.html }}
              />
            ) : (
              <pre className="whitespace-pre-wrap rounded border border-outline-variant bg-surface-low p-4 text-body-sm text-ink">
                {emailPreview.text}
              </pre>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}

export default RepeatCustomersPage
