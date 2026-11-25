import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Chip } from '@/components/ui/Badge'
import { Input, Textarea } from '@/components/ui/Form'
import { Modal } from '@/components/ui/Modal'
import { useServerAction } from '@/hooks/useServerResource'
import { formatPrice } from '@/lib/format'
import adminApi from '@/services/adminApi'
import { useSessionStore } from '@/store/sessionStore'
import { useUiStore } from '@/store/uiStore'

const PRESET_DISCOUNTS = [5, 10, 15, 20]

/**
 * Issue a personal coupon code and email the repeat-customer benefit.
 * Supports single customer (with editable email if missing yet) or bulk repeat buyers.
 */
export function BenefitEmailModal({ open, onClose, target = null, bulkRecipients = null, rules = {}, onSent }) {
  const { run, busy } = useServerAction()
  const isOwner = useSessionStore((state) => state.user?.role === 'owner')
  const pushToast = useUiStore((state) => state.pushToast)

  const isBulk = Array.isArray(bulkRecipients) && bulkRecipients.length > 0

  const [email, setEmail] = useState('')
  const [discountPercent, setDiscountPercent] = useState(10)
  const [minOrder, setMinOrder] = useState(0)
  const [validityDays, setValidityDays] = useState(30)
  const [customMessage, setCustomMessage] = useState('')
  const [result, setResult] = useState(null)

  useEffect(() => {
    if (!open) return
    setResult(null)
    setEmail(target?.email ?? '')
    const initialPct = target?.eligibleBenefit?.discountPercent || (isBulk ? 10 : 5)
    setDiscountPercent(!isOwner && initialPct > 15 ? 15 : initialPct)
    setMinOrder(rules?.minOrderAmount ?? 0)
    setValidityDays(rules?.validityDays ?? 30)
    setCustomMessage('')
  }, [open, target, isBulk, rules, isOwner])

  if (!open) return null

  const cleanEmail = email.trim()
  const validEmail = cleanEmail.includes('@') && cleanEmail.includes('.')
  const maxPct = isOwner ? 80 : 15
  const validPct = Number(discountPercent) >= 1 && Number(discountPercent) <= maxPct
  const canSend = validPct && (isBulk ? bulkRecipients.length > 0 : validEmail)

  const send = async () => {
    if (!canSend || busy) return
    if (isBulk) {
      const out = await run(
        () =>
          adminApi.sendBulkRepeatBenefit({
            recipients: bulkRecipients.map((c) => ({
              customerId: c.customerId || null,
              name: c.name,
              phone: c.phone,
              email: c.email,
              visits: c.visits,
            })),
            discountPercent: Number(discountPercent),
            minOrder: Number(minOrder) || 0,
            validityDays: Number(validityDays) || 30,
            customMessage: customMessage.trim(),
          }),
        { success: `Benefit prepared for ${bulkRecipients.length} customers` },
      )
      if (!out) return
      setResult({ isBulk: true, ...out.data })
      onSent?.()
      return
    }

    const out = await run(() =>
      adminApi.sendRepeatBenefit({
        customerId: target?.customerId || null,
        name: target?.name || '',
        phone: target?.phone || '',
        email: cleanEmail,
        discountPercent: Number(discountPercent),
        minOrder: Number(minOrder) || 0,
        validityDays: Number(validityDays) || 30,
        visits: target?.visits || 1,
        customMessage: customMessage.trim(),
      }),
    )
    if (!out) return
    const data = out.data
    setResult({ isBulk: false, ...data })
    pushToast({
      tone: data.emailLog?.status === 'failed' ? 'error' : 'done',
      title:
        data.emailLog?.status === 'sent'
          ? `Benefit emailed to ${cleanEmail}`
          : `Coupon ${data.coupon?.code} created & email ready`,
      description:
        data.emailLog?.status === 'sent'
          ? `Code ${data.coupon?.code} (${data.coupon?.value}% OFF) sent.`
          : 'Add Gmail / SMTP under Settings to send straight to inbox, or copy message below.',
    })
    onSent?.()
  }

  const copyText = (value, label) => {
    navigator.clipboard?.writeText(value)
    pushToast({ title: `${label} copied` })
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title={isBulk ? `Email Benefit to ${bulkRecipients.length} Repeat Customers` : `Send Benefit — ${target?.name || 'Customer'}`}
      description={
        isBulk
          ? 'Creates a personal discount code for each selected repeat customer with an email address.'
          : `${target?.visits || 1} ${(target?.visits || 1) === 1 ? 'purchase' : 'purchases'} · Total spent ${formatPrice(target?.totalSpent || 0)}`
      }
      footer={
        result ? (
          <Button variant="gold" onClick={onClose}>
            Done
          </Button>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="gold" icon="mail" loading={busy} disabled={!canSend} onClick={send}>
              {isBulk ? `Send to ${bulkRecipients.length} Customers` : 'Create Coupon & Email'}
            </Button>
          </>
        )
      }
    >
      {result ? (
        <div className="flex flex-col gap-4">
          {result.isBulk ? (
            <div className="rounded border border-state-done/40 bg-state-doneSurface/30 p-4">
              <p className="font-semibold text-ink">
                Processed {result.total} customer emails ({result.succeeded} prepared/sent, {result.failed} failed)
              </p>
              <p className="mt-1 text-body-sm text-ink-muted">
                Every customer received their own single-use coupon code under Sent Benefit Emails.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="rounded border border-brand-gold/50 bg-brand-gold/10 p-4 text-center">
                <p className="text-label-sm font-bold uppercase text-ink-muted">Personal Reward Coupon Created</p>
                <p className="mt-1 font-serif text-2xl font-bold tracking-wider text-ink">{result.coupon?.code}</p>
                <p className="mt-1 text-body-sm text-ink-variant">
                  {result.coupon?.value}% OFF · Works online &amp; in-shop counter
                </p>
              </div>

              <div className="rounded border border-outline-variant/60 bg-surface-low/60 px-3.5 py-2.5 text-body-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-ink">Email status</span>
                  <Chip tone={result.emailLog?.status === 'sent' ? 'done' : result.emailLog?.status === 'failed' ? 'halted' : 'pending'}>
                    {result.emailLog?.status === 'sent'
                      ? 'Delivered via Email'
                      : result.emailLog?.status === 'failed'
                        ? 'SMTP Error'
                        : 'Preview Saved (SMTP not set)'}
                  </Chip>
                </div>
                {result.emailLog?.error && <p className="mt-1 text-[12px] text-ink-muted">{result.emailLog.error}</p>}
              </div>

              {result.whatsappText && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    icon="copy"
                    onClick={() => copyText(result.coupon?.code || '', 'Coupon code')}
                  >
                    Copy Code
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    icon="share"
                    onClick={() => copyText(result.whatsappText, 'Customer message')}
                  >
                    Copy WhatsApp / SMS Text
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {!isBulk && (
            <Input
              label="Customer Email"
              type="email"
              required
              icon="mail"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Enter customer email (e.g. name@gmail.com)"
              hint={
                target?.email
                  ? 'We will send the coupon code to this email address.'
                  : 'No email saved from billing yet — adding it here also saves it to this customer profile.'
              }
            />
          )}

          <div>
            <span className="field-label">Discount Percentage</span>
            <div className="mb-2 flex flex-wrap gap-2">
              {PRESET_DISCOUNTS.filter((pct) => pct <= maxPct).map((pct) => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => setDiscountPercent(pct)}
                  className={`btn btn-sm border ${
                    Number(discountPercent) === pct
                      ? 'border-shell-obsidian bg-shell-obsidian text-surface-low'
                      : 'border-outline-variant bg-brand-paper text-ink-variant hover:border-brand-gold'
                  }`}
                >
                  {pct}% OFF
                </button>
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Input
                label="Custom %"
                type="number"
                min="1"
                max={maxPct}
                suffix="%"
                value={discountPercent}
                onChange={(event) => setDiscountPercent(event.target.value)}
                hint={!isOwner ? 'Staff limit: max 15%' : undefined}
              />
              <Input
                label="Min Bill"
                type="number"
                min="0"
                suffix="₹"
                value={minOrder}
                onChange={(event) => setMinOrder(event.target.value)}
                hint="0 = any amount"
              />
              <Input
                label="Valid For"
                type="number"
                min="1"
                max="365"
                suffix="days"
                value={validityDays}
                onChange={(event) => setValidityDays(event.target.value)}
              />
            </div>
          </div>

          <Textarea
            label="Personal Note (Optional)"
            rows={2}
            value={customMessage}
            onChange={(event) => setCustomMessage(event.target.value)}
            placeholder="Thank you for visiting Raheman Perfumes! Enjoy this special discount on your next bottle."
          />
        </div>
      )}
    </Modal>
  )
}

export default BenefitEmailModal

