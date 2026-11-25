import { useEffect, useMemo, useState } from 'react'
import { Button, IconButton } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Badge'
import { DataTable } from '@/components/ui/DataTable'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/Feedback'
import { Modal } from '@/components/ui/Modal'
import { Input, Select, FieldGroup } from '@/components/ui/Form'
import { Panel } from '@/components/ui/StatCard'
import useDocumentTitle from '@/hooks/useDocumentTitle'
import { PageHeader } from '@/components/ui/PageHeader'
import { useServerResource, useServerAction } from '@/hooks/useServerResource'
import adminApi from '@/services/adminApi'
import { useSessionStore } from '@/store/sessionStore'

/**
 * Settings.
 *
 * The values that used to live in code: what delivery costs, when it becomes
 * free, what the house calls itself on the storefront's footer. Each is read by
 * the storefront through the same `services/settings.js` the panel writes to, so
 * a change here is a change in the shop — no redeploy, no second source of truth.
 *
 * **Authority is the server's, and this screen mirrors it rather than
 * duplicating it.** Every write route carries `requireOwner`, so a manager
 * opening this page would get a 403 on save. The panel therefore does not offer
 * what will be refused: a non-owner sees the values, read-only, with a line
 * saying who can change them. That is a different thing from hiding the screen —
 * knowing the delivery fee is part of doing the job; changing it is not.
 */

/** Staff roles supported by `/admin/staff`. Owner has full control; Staff has bounded shop operations. */
const ROLES = [
  { value: 'staff', label: 'Staff' },
  { value: 'owner', label: 'Owner' },
]

const ROLE_LABEL = Object.fromEntries(ROLES.map((role) => [role.value, role.label]))

export function SettingsPage() {
  useDocumentTitle('Settings')

  const role = useSessionStore((state) => state.user?.role)
  const currentUserId = useSessionStore((state) => state.user?.id)
  const isOwner = role === 'owner'

  const settings = useServerResource(() => adminApi.getSettings())
  // Not even asked for when not an owner: the route answers 403, and a red error
  // block where a table should be would read as a fault rather than a permission.
  const staff = useServerResource(() => adminApi.listStaff(), { enabled: isOwner })

  return (
    <div className="flex flex-col gap-5">
      <PageHeader />

      {!isOwner && (
        <div className="flex items-start gap-3 rounded border border-outline-variant bg-surface-low px-4 py-3">
          <Chip>Read-only</Chip>
          <p className="text-body-sm text-ink-variant">
            You are signed in as {ROLE_LABEL[role] ?? role}. Pricing and store identity are the owner's to change — the API
            refuses these writes from any other role, so they are shown here and not offered.
          </p>
        </div>
      )}

      {settings.error ? (
        <div className="card-admin">
          <ErrorState error={settings.error} refused={settings.refused} onRetry={settings.reload} />
        </div>
      ) : settings.loading || !settings.data ? (
        <div className="flex flex-col gap-5">
          <Skeleton className="h-[260px]" />
          <Skeleton className="h-[320px]" />
        </div>
      ) : (
        <>
          <PricingPanel pricing={settings.data.pricing} canEdit={isOwner} onSaved={settings.reload} />
          <StorePanel store={settings.data.store} canEdit={isOwner} onSaved={settings.reload} />
          <EmailSetupPanel email={settings.data.email} canEdit={isOwner} onSaved={settings.reload} />
        </>
      )}

      {isOwner && <StaffPanel resource={staff} currentUserId={currentUserId} />}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────── pricing ──── */

function PricingPanel({ pricing, canEdit, onSaved }) {
  const { run, busy } = useServerAction()
  const [draft, setDraft] = useState(pricing)

  // Re-seeded from the server's copy, which is the only copy. A save reloads the
  // read, so what the form shows afterwards is what the database holds.
  useEffect(() => setDraft(pricing), [pricing])

  const set = (patch) => setDraft((current) => ({ ...current, ...patch }))
  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(pricing), [draft, pricing])

  const save = async () => {
    const result = await run(() => adminApi.savePricing(draft), { success: 'Pricing updated' })
    if (result) onSaved()
  }

  const field = (label, key, hint, suffix) => (
    <Input
      label={label}
      type="number"
      min="0"
      suffix={suffix}
      value={draft[key] ?? ''}
      hint={hint}
      disabled={!canEdit}
      onChange={(event) => set({ [key]: event.target.value })}
    />
  )

  return (
    <Panel
      title="Website pricing"
      description="What the shop charges on each order."
      action={
        canEdit && (
          <Button icon="check" onClick={save} loading={busy} disabled={!dirty}>
            Save pricing
          </Button>
        )
      }
    >
      <FieldGroup title="Delivery and tax" columns={3}>
        {field('Delivery fee', 'shippingFee', 'Charged when order is below the free delivery limit.', '₹')}
        {field('Free delivery over', 'freeShippingOver', 'Orders at or above this amount get free delivery.', '₹')}
        {field('Gift wrap', 'giftWrapFee', 'Added when the buyer ticks gift wrap.', '₹')}
        {field('GST rate', 'gstRate', 'Tax percentage shown on bills and reports.', '%')}
      </FieldGroup>

      {/*
        Known gap, stated rather than papered over: the server bills with this
        rule, but the storefront checkout still quotes from its own
        `SHIPPING_METHODS` table (`frontend/src/data/content.js`), so the two can
        disagree until the checkout reads this rule.
      */}
    </Panel>
  )
}

/* ──────────────────────────────────────────────────────────── store identity ──── */

function StorePanel({ store, canEdit, onSaved }) {
  const { run, busy } = useServerAction()
  const [draft, setDraft] = useState(store)

  useEffect(() => setDraft(store), [store])

  const set = (patch) => setDraft((current) => ({ ...current, ...patch }))
  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(store), [draft, store])

  const save = async () => {
    const result = await run(() => adminApi.saveStore(draft), { success: 'Store identity updated' })
    if (result) onSaved()
  }

  const field = (label, key, props = {}) => (
    <Input
      label={label}
      value={draft[key] ?? ''}
      disabled={!canEdit}
      onChange={(event) => set({ [key]: event.target.value })}
      {...props}
    />
  )

  return (
    <Panel
      title="Shop details"
      description="Shown in the website footer, contact page and emails."
      action={
        canEdit && (
          <Button icon="check" onClick={save} loading={busy} disabled={!dirty}>
            Save details
          </Button>
        )
      }
    >
      <FieldGroup title="Shop Info">
        {field('Shop name', 'name', { required: true })}
        {field('Legal name', 'legalName', { hint: 'Printed on bills and GST receipts.' })}
        {field('Tagline', 'tagline', { containerClassName: 'sm:col-span-2' })}
      </FieldGroup>

      <FieldGroup title="Contact" className="mt-6">
        {field('Email', 'email', { type: 'email' })}
        {field('Phone', 'phone')}
        {field('Instagram', 'instagram')}
        {field('Hours', 'hours')}
        {field('Address', 'address', { containerClassName: 'sm:col-span-2' })}
        {field('City', 'city')}
      </FieldGroup>
    </Panel>
  )
}

/* ─────────────────────────────────────────────────────── email / SMTP ──── */

function EmailSetupPanel({ email = {}, canEdit, onSaved }) {
  const { run, busy } = useServerAction()
  const [draft, setDraft] = useState({
    host: '',
    port: 587,
    user: '',
    pass: '',
    fromName: 'Raheman Perfumes',
    fromEmail: '',
  })
  const [testTo, setTestTo] = useState('')
  const [testResult, setTestResult] = useState(null)
  const [brevoStatus, setBrevoStatus] = useState(null)

  useEffect(() => {
    setDraft({
      host: email?.host ?? '',
      port: email?.port ?? 587,
      user: email?.user ?? '',
      pass: email?.hasPassword ? '••••••••' : '',
      fromName: email?.fromName ?? 'Raheman Perfumes',
      fromEmail: email?.fromEmail ?? '',
    })
  }, [email])

  const set = (patch) => setDraft((current) => ({ ...current, ...patch }))

  const save = async () => {
    setTestResult(null)
    const out = await run(() => adminApi.saveEmailSettings(draft), { success: 'Email setup saved' })
    if (out) onSaved()
  }

  const sendTest = async () => {
    if (!testTo.trim()) return
    setTestResult(null)
    const out = await run(() => adminApi.testEmailSettings(testTo.trim()))
    if (out?.data) {
      setTestResult(out.data)
      if (out.data.ok) onSaved()
    }
  }

  const checkBrevo = async () => {
    setBrevoStatus(null)
    const out = await run(() => adminApi.verifyBrevoSettings())
    if (out) setBrevoStatus(out)
  }

  return (
    <Panel
      title="Email Setup (Brevo / SMTP)"
      description={
        email?.brevoConfigured
          ? `Brevo API is active via backend/.env (${email.brevoSenderEmail || 'using fallback sender'}). Forgot password, verification codes, and customer benefit emails send through Brevo automatically.`
          : 'Used to send Forgot Password, Email Verification, and Repeat Customer benefit emails. Configure BREVO_API_KEY in backend/.env (recommended) or enter SMTP credentials below.'
      }
      action={
        <div className="flex items-center gap-2">
          <Chip tone={email?.configured ? 'done' : 'pending'}>
            {email?.brevoConfigured
              ? 'Brevo Ready'
              : email?.configured
                ? 'SMTP Ready'
                : 'Not Connected'}
          </Chip>
          {canEdit && (
            <Button icon="check" onClick={save} loading={busy}>
              Save Email Setup
            </Button>
          )}
        </div>
      }
    >
      <FieldGroup title="SMTP Connection" columns={2}>
        <Input
          label="SMTP Host"
          placeholder="smtp.gmail.com"
          value={draft.host}
          disabled={!canEdit}
          onChange={(e) => set({ host: e.target.value })}
        />
        <Input
          label="Port"
          type="number"
          placeholder="587"
          value={draft.port}
          disabled={!canEdit}
          onChange={(e) => set({ port: Number(e.target.value) || 587 })}
          hint="Use 587 (TLS) or 465 (SSL)."
        />
        <Input
          label="Email Login (Username)"
          type="email"
          placeholder="yourshop@gmail.com"
          value={draft.user}
          disabled={!canEdit}
          onChange={(e) => set({ user: e.target.value })}
        />
        <Input
          label="App Password"
          type="password"
          placeholder="16-digit App Password"
          value={draft.pass}
          disabled={!canEdit}
          onChange={(e) => set({ pass: e.target.value })}
          hint={email?.hasPassword ? 'Saved securely. Leave as dots to keep current password.' : ''}
        />
        <Input
          label="Sender Name"
          placeholder="Raheman Perfumes"
          value={draft.fromName}
          disabled={!canEdit}
          onChange={(e) => set({ fromName: e.target.value })}
        />
        <Input
          label="From Email"
          type="email"
          placeholder="yourshop@gmail.com"
          value={draft.fromEmail}
          disabled={!canEdit}
          onChange={(e) => set({ fromEmail: e.target.value })}
        />
      </FieldGroup>

      {canEdit && (
        <div className="mt-5 border-t border-outline-variant/50 pt-4">
          <div className="flex flex-wrap items-end gap-3">
            <Input
              label="Test Your Email Setup"
              type="email"
              placeholder="Enter your own email to send a test"
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
              containerClassName="max-w-xs"
            />
            <Button variant="outline" icon="mail" loading={busy} disabled={!testTo.includes('@')} onClick={sendTest}>
              Send Test Email
            </Button>
            <Button variant="outline" icon="check" loading={busy} onClick={checkBrevo}>
              Verify Brevo Key
            </Button>
          </div>
          {testResult && (
            <p className={`mt-2 text-body-sm ${testResult.ok ? 'text-state-done' : 'text-error'}`}>
              {testResult.ok
                ? `Test email delivered to ${testTo.trim()}${testResult.provider ? ` via ${testResult.provider.toUpperCase()}` : ''}!`
                : testResult.error || 'Could not deliver test email. Add BREVO_API_KEY in backend/.env or configure SMTP credentials.'}
            </p>
          )}
          {brevoStatus && (
            <p className={`mt-2 text-body-sm ${brevoStatus.ok ? 'text-state-done' : 'text-error'}`}>
              {brevoStatus.message}
              {brevoStatus.ok && brevoStatus.credits !== null && brevoStatus.credits !== undefined
                ? ` · Credits remaining: ${brevoStatus.credits}`
                : ''}
            </p>
          )}
        </div>
      )}
    </Panel>
  )
}

/* ───────────────────────────────────────────────────────────────── staff ──── */

function StaffPanel({ resource, currentUserId }) {
  const { data, loading, error, reload, refused } = resource
  const { run, busy } = useServerAction()

  const [editing, setEditing] = useState(null)
  const [draft, setDraft] = useState(null)

  const rows = useMemo(() => data ?? [], [data])

  const openNew = () => {
    setDraft({ name: '', email: '', password: '', role: 'staff' })
    setEditing('new')
  }

  const openEdit = (row) => {
    setDraft({ name: row.name ?? '', email: row.email ?? '', password: '', role: row.role ?? 'staff' })
    setEditing(row.id)
  }

  const save = async () => {
    const isNew = editing === 'new'
    const result = await run(
      () => (isNew ? adminApi.createStaff(draft) : adminApi.saveStaff(editing, draft)),
      { success: isNew ? `${draft.name} can now sign in` : `${draft.name} updated` },
    )
    if (!result) return
    setEditing(null)
    reload()
  }

  const remove = async (row) => {
    if (!window.confirm(`Remove ${row.name}'s access? Their session stops working on the next page load.`)) return
    const result = await run(() => adminApi.deleteStaff(row.id), { success: `${row.name} removed` })
    if (result) reload()
  }

  const columns = [
    {
      key: 'name',
      header: 'Name',
      render: (row) => (
        <span className="block">
          <span className="block font-medium text-ink">
            {row.name}
            {row.id === currentUserId && <span className="ml-2 text-body-sm text-ink-muted">(you)</span>}
          </span>
          <span className="block text-body-sm text-ink-muted">{row.email}</span>
        </span>
      ),
    },
    {
      key: 'role',
      header: 'Role',
      render: (row) => <Chip tone={row.role === 'owner' ? 'gold' : 'active'}>{ROLE_LABEL[row.role] ?? row.role}</Chip>,
    },
    {
      key: 'access',
      header: 'Can',
      render: (row) => (
        <span className="text-body-sm text-ink-muted">
          {row.role === 'owner'
            ? 'Everything, including settings, pricing, profits, deletes and staff list'
            : 'Counter bills (max 15% discount), pack/ship orders, customers & read-only stock'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Action',
      align: 'right',
      render: (row) => (
        <span className="flex items-center justify-end gap-0.5">
          <IconButton icon="edit" label={`Edit ${row.name}`} onClick={() => openEdit(row)} />
          {/*
            Your own row cannot be deleted from here. The API would allow it — there
            is no self-check on the route — and the next page load would sign you
            out with no way back in, because the panel's door needs an account that
            still exists.
          */}
          {row.id !== currentUserId && (
            <IconButton icon="trash" label={`Remove ${row.name}`} tone="danger" onClick={() => remove(row)} />
          )}
        </span>
      ),
    },
  ]

  return (
    <div className="card-admin-flush">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-outline-variant/50 px-4 py-3">
        <div>
          <h2 className="panel-title">Staff &amp; roles</h2>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" icon="refresh" onClick={reload}>
            Refresh
          </Button>
          <Button size="sm" icon="plus" onClick={openNew}>
            Add staff
          </Button>
        </div>
      </div>

      {error ? (
        <ErrorState error={error} refused={refused} onRetry={reload} />
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          loading={loading}
          empty={
            <EmptyState
              icon="users"
              title="No staff accounts"
              description="Only the owner exists. Add an account here to let someone else work the panel."
              action={
                <Button icon="plus" onClick={openNew}>
                  Add staff
                </Button>
              }
            />
          }
        />
      )}

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'Add a staff account' : `Edit ${draft?.name ?? 'account'}`}
        description={
          editing === 'new'
            ? 'The account is created immediately and can sign in at this panel. There is no invitation email.'
            : 'The email address is the account, and cannot be changed. Create a new account instead.'
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button
              onClick={save}
              loading={busy}
              disabled={!draft?.name?.trim() || !draft?.email?.trim() || (editing === 'new' && draft.password.length < 8)}
            >
              {editing === 'new' ? 'Create account' : 'Save changes'}
            </Button>
          </>
        }
      >
        {draft && (
          <FieldGroup
            title="Account"
            description={
              draft.role === 'staff'
                ? 'Staff accounts have strict safety limits: no voids, no price/stock edits, no deletes, no profit reports, and no settings.'
                : 'Owner accounts have full access to everything in this admin panel.'
            }
          >
            <Input label="Name" required value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
            <Input
              label="Email"
              required
              type="email"
              value={draft.email}
              disabled={editing !== 'new'}
              hint={editing === 'new' ? 'This is the login email.' : 'Cannot be changed after creation.'}
              onChange={(event) => setDraft({ ...draft, email: event.target.value })}
            />
            {editing === 'new' && (
              <Input
                label="Password"
                required
                type="password"
                value={draft.password}
                hint="At least 8 characters. Share it directly — nothing is emailed."
                onChange={(event) => setDraft({ ...draft, password: event.target.value })}
              />
            )}
            <Select
              label="Role"
              value={draft.role}
              options={ROLES}
              hint={
                draft.role === 'staff'
                  ? 'Max 15% counter discount · Cannot void/cancel orders, edit prices/stock, delete records, see profits, or change settings.'
                  : 'Owner has full access to everything in this admin panel.'
              }
              onChange={(event) => setDraft({ ...draft, role: event.target.value })}
            />
          </FieldGroup>
        )}
      </Modal>
    </div>
  )
}

export default SettingsPage
