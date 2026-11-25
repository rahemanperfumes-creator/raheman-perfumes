import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Link } from '@/components/ui/AppLink'
import cn from '@/lib/cn'
import { formatPrice, formatDate, initials } from '@/lib/format'
import useAuthStore from '@/store/authStore'
import useWishlistStore from '@/store/wishlistStore'
import useCartStore from '@/store/cartStore'
import useUiStore, { toast } from '@/store/uiStore'
import { Icon } from '@/components/ui/Icon'
import { Button } from '@/components/ui/Button'
import { Chip, TierBadge } from '@/components/ui/Badge'
import { Input, Select, Checkbox } from '@/components/ui/Form'
import { Modal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/Feedback'
import { FlaconStage } from '@/components/product/FlaconArt'
import { productImage } from '@/data/productImages'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { ORDER_STATUS, formatOrderStatus } from '@/data/account'
import { AddressFields, districtsMatch } from '@/components/ui/AddressFields'
import { pincodeDetails } from '@/services/postalApi'
import { useCatalogueStore } from '@/store/catalogueStore'

const NAV_GROUPS = [
  [
    { id: 'overview', label: 'Overview', icon: 'grid' },
    { id: 'orders', label: 'My Orders', icon: 'package' },
  ],
  [
    { id: 'profile', label: 'Personal Information', icon: 'user' },
    { id: 'rewards', label: 'Rewards', icon: 'award' },
    { id: 'addresses', label: 'Addresses', icon: 'map-pin' },
    { id: 'preferences', label: 'Preferences', icon: 'sliders' },
  ],
]

const VALID_TABS = new Set(NAV_GROUPS.flat().map((item) => item.id))

const EMPTY_ADDRESS = {
  tag: '',
  name: '',
  phone: '',
  line1: '',
  line2: '',
  area: '',
  city: '',
  district: '',
  state: 'Maharashtra',
  pincode: '',
  type: 'Home',
}

/** Split full name safely into { firstName, lastName }. */
function splitName(fullName = '') {
  const parts = String(fullName).trim().split(/\s+/).filter(Boolean)
  return {
    firstName: parts[0] ?? '',
    lastName: parts.slice(1).join(' '),
  }
}

/** Shared top header banner inside the right-side detail card (matching the profile card header structure). */
function PanelBanner({ icon = 'shield', title, description, action }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-brand-border bg-white px-6 py-6 sm:px-8">
      <div className="flex items-start gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-brand-gold/35 bg-brand-gold/15 text-brand-goldDark">
          <Icon name={icon} className="h-6 w-6" />
        </span>
        <div>
          <h1 className="font-serif text-2xl font-semibold text-brand-charcoal sm:text-3xl">{title}</h1>
          {description && <p className="mt-1 max-w-xl text-body-sm text-brand-muted">{description}</p>}
        </div>
      </div>
      {action}
    </div>
  )
}

/** One dashboard statistic. */
function StatCard({ icon, label, value, note }) {
  return (
    <div className="rounded-lg border border-brand-border/80 bg-white/55 p-4">
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-cream text-brand-goldDark">
        <Icon name={icon} className="h-4 w-4" />
      </span>
      <p className="mt-3 font-serif text-2xl font-semibold text-brand-charcoal">{value}</p>
      <p className="mt-0.5 text-label-sm font-bold uppercase tracking-wider text-brand-muted">{label}</p>
      {note && <p className="mt-1 text-body-xs text-brand-muted">{note}</p>}
    </div>
  )
}

/** Overview panel: activity summary, loyalty status, recent orders & default delivery. */
function OverviewTab({ onTab }) {
  const user = useAuthStore((state) => state.user)
  const orders = useAuthStore((state) => state.orders)
  const addresses = useAuthStore((state) => state.addresses)
  const wishlistCount = useWishlistStore((state) => state.items.length)

  const activeOrders = orders.filter((order) => !['Delivered', 'Cancelled'].includes(order.status))
  const lifetime = orders
    .filter((order) => order.status !== 'Cancelled')
    .reduce((sum, order) => sum + (order.total ?? 0), 0)

  return (
    <div>
      <PanelBanner
        icon="grid"
        title="Account Overview"
        description={`Member since ${formatDate(user?.memberSince)} · ${user?.tier ?? 'Member'}.`}
        action={
          <Button variant="outline" size="sm" to="/shop">
            Browse Shop
          </Button>
        }
      />

      <div className="space-y-8 p-6 sm:p-8">
        <div className="grid gap-4 sm:grid-cols-3">
          <StatCard
            icon="package"
            label="Orders Placed"
            value={orders.length}
            note={activeOrders.length > 0 ? `${activeOrders.length} in progress` : 'All settled'}
          />
          <StatCard icon="heart" label="Wishlist" value={wishlistCount || user?.stats?.wishlist || 0} note="Fragrances saved" />
          <StatCard icon="tag" label="Lifetime Spend" value={formatPrice(lifetime)} note={`${user?.loyaltyPoints ?? 0} points`} />
        </div>

        {/* Recent orders */}
        <div>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 className="text-label-md font-bold uppercase tracking-widest text-brand-charcoal">Recent Orders</h2>
            <button
              type="button"
              onClick={() => onTab('orders')}
              className="text-label-sm font-bold uppercase text-brand-goldDark underline-offset-4 hover:underline"
            >
              View all
            </button>
          </div>

          {orders.length === 0 ? (
            <p className="mt-4 rounded-lg border border-brand-border/70 bg-white/40 px-4 py-4 text-body-sm text-brand-muted">
              No orders placed yet.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-brand-border rounded-lg border border-brand-border bg-white/40">
              {orders.slice(0, 3).map((order) => (
                <li key={order.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div>
                    <p className="text-body-sm font-semibold text-brand-charcoal">{order.id}</p>
                    <p className="text-body-sm text-brand-muted">
                      {formatDate(order.date)} · {order.items.length} {order.items.length === 1 ? 'item' : 'items'} ·{' '}
                      {formatPrice(order.total)}
                    </p>
                    {(order.courier || order.awb || order.tracking?.courier || order.tracking?.awb) && (
                      <p className="mt-0.5 text-body-xs font-medium text-emerald-800">
                        {order.courier || order.tracking?.courier || 'Dispatched'} · AWB:{' '}
                        <strong className="font-mono">{order.awb || order.tracking?.awb || order.trackingId}</strong>
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span
                      className={cn(
                        'rounded-full border px-3 py-1 text-label-sm font-bold uppercase',
                        ORDER_STATUS[formatOrderStatus(order.status)] ?? ORDER_STATUS[order.status] ?? 'border-brand-border text-brand-muted',
                      )}
                    >
                      {formatOrderStatus(order.status)}
                    </span>
                    {order.canTrack && (
                      <Button variant="ghost" size="sm" className="border border-brand-border" to={`/track-order?order=${order.id}`}>
                        Track
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Default address */}
        <div>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 className="text-label-md font-bold uppercase tracking-widest text-brand-charcoal">Default Delivery</h2>
            <button
              type="button"
              onClick={() => onTab('addresses')}
              className="text-label-sm font-bold uppercase text-brand-goldDark underline-offset-4 hover:underline"
            >
              Manage addresses
            </button>
          </div>
          {addresses.length === 0 ? (
            <p className="mt-4 rounded-lg border border-brand-border/70 bg-white/40 px-4 py-4 text-body-sm text-brand-muted">
              No address on file yet.
            </p>
          ) : (
            (() => {
              const address = addresses.find((entry) => entry.id === user?.defaultAddressId) ?? addresses[0]
              return (
                <address className="mt-4 space-y-0.5 rounded-lg border border-brand-border bg-white/50 p-5 text-body-sm not-italic text-ink-variant">
                  <p className="font-semibold text-brand-charcoal">{address.name}</p>
                  <p>{address.line1}</p>
                  {address.line2 && <p>{address.line2}</p>}
                  <p>
                    {address.city}, {address.state} {address.pincode}
                  </p>
                  <p className="pt-1">{address.phone}</p>
                </address>
              )
            })()
          )}
        </div>
      </div>
    </div>
  )
}

const UPI_PATTERN = /^[a-zA-Z0-9.\-_]{2,64}@[a-zA-Z0-9]{2,32}$/

/** Order history with pre-packing cancel + UPI refund requests and tracking. */
function OrdersTab() {
  const orders = useAuthStore((state) => state.orders)
  const cancelOrder = useAuthStore((state) => state.cancelOrder)
  const addItem = useCartStore((state) => state.addItem)
  const openCartDrawer = useUiStore((state) => state.openCartDrawer)
  const catalogue = useCatalogueStore((state) => state.bySlug)

  const [cancelling, setCancelling] = useState(null)
  const [upiId, setUpiId] = useState('')
  const [reason, setReason] = useState('')
  const [cancelError, setCancelError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const openCancel = (order) => {
    setCancelling(order)
    setUpiId(order.refund?.upiId || '')
    setReason('')
    setCancelError('')
  }

  const submitCancel = async (event) => {
    event.preventDefault()
    if (!cancelling || submitting) return

    const cleanUpi = upiId.trim()
    if (cancelling.isPrepaid && !UPI_PATTERN.test(cleanUpi)) {
      setCancelError('Please enter a valid UPI ID (for example: name@oksbi or 9876543210@ybl).')
      return
    }

    setCancelError('')
    setSubmitting(true)
    const result = await cancelOrder(cancelling.id, {
      upiId: cancelling.isPrepaid ? cleanUpi : '',
      reason: reason.trim(),
    })
    setSubmitting(false)

    if (!result.ok) {
      setCancelError(result.message)
      return
    }

    toast({
      title: cancelling.isPrepaid ? `Order ${cancelling.id} cancelled & refund requested` : `Order ${cancelling.id} cancelled`,
      description: cancelling.isPrepaid
        ? `Owner will manually transfer ${formatPrice(cancelling.total)} to ${cleanUpi}.`
        : 'Your COD order has been cancelled.',
      tone: 'info',
    })
    setCancelling(null)
  }

  return (
    <div>
      <PanelBanner
        icon="package"
        title="My Orders"
        action={
          <Button variant="outline" size="sm" to="/track-order">
            Track by Number
          </Button>
        }
      />

      <div className="p-6 sm:p-8">
        {orders.length === 0 ? (
          <EmptyState
            icon="package"
            title="No orders yet"
            actionLabel="Browse Fragrances"
            actionTo="/shop"
          />
        ) : (
          <ul className="space-y-5">
            {orders.map((order) => {
              // Strictly allowed ONLY before Packed (`Processing` / raw `Pending` / `Order Confirmed`)
              const cancellable = order.canCancel ?? ['Processing', 'Pending', 'Order Confirmed'].includes(order.status)
              const packedOrAfter = ['Packaging', 'In Transit'].includes(order.status)
              const refund = order.refund
              return (
                <li key={order.id} className="overflow-hidden rounded-lg border border-brand-border bg-white/55">
                  <div className="flex flex-wrap items-center justify-between gap-4 border-b border-brand-border bg-brand-cream/45 px-5 py-4">
                    <div>
                      <p className="text-body-sm font-semibold text-brand-charcoal">Order {order.id}</p>
                      <p className="text-body-sm text-brand-muted">
                        Placed {formatDate(order.date)} · {formatPrice(order.total)}
                        {order.paymentMethod ? ` · ${order.paymentMethod.toUpperCase()}` : ''}
                      </p>
                    </div>
                    <span
                      className={cn(
                        'rounded-full border px-3 py-1 text-label-sm font-bold uppercase',
                        ORDER_STATUS[formatOrderStatus(order.status)] ?? ORDER_STATUS[order.status] ?? 'border-brand-border text-brand-muted',
                      )}
                    >
                      {formatOrderStatus(order.status)}
                    </span>
                  </div>

                  <ul className="divide-y divide-brand-border">
                    {order.items.map((item) => (
                      <li key={`${order.id}-${item.slug}-${item.volume}`}>
                        <Link
                          to={item.slug ? `/product/${item.slug}` : '#'}
                          className="group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-brand-cream/40"
                        >
                          <span className="w-12 shrink-0 transition-transform group-hover:scale-105">
                            <FlaconStage tier="Inspired" seed={item.slug} label={item.name} image={productImage(item)} compact />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-body-sm font-semibold text-brand-charcoal transition-colors group-hover:text-brand-goldDark">
                              {item.name}
                            </span>
                            <span className="block text-body-sm text-brand-muted">
                              {item.volume} · Qty {item.qty}
                            </span>
                          </span>
                          <span className="shrink-0 text-body-sm font-semibold text-brand-charcoal">
                            {formatPrice(item.price * item.qty)}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>

                  {refund?.status && refund.status !== 'None' && (
                    <div
                      className={cn(
                        'border-t px-5 py-3 text-body-sm',
                        refund.status === 'Refunded'
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                          : refund.status === 'Rejected'
                            ? 'border-rose-200 bg-rose-50 text-rose-900'
                            : 'border-amber-200 bg-amber-50 text-amber-900',
                      )}
                    >
                      {refund.status === 'Requested' && (
                        <span>
                          <strong>Refund Requested:</strong> {formatPrice(refund.amount || order.total)} will be manually
                          transferred by the Shop Owner to UPI ID <strong className="font-mono">{refund.upiId}</strong>.
                        </span>
                      )}
                      {refund.status === 'Refunded' && (
                        <span>
                          <strong>Refund Completed:</strong> {formatPrice(refund.amount || order.total)} transferred to UPI{' '}
                          <strong className="font-mono">{refund.upiId}</strong>
                          {refund.referenceNote ? ` · Ref: ${refund.referenceNote}` : ''}.
                        </span>
                      )}
                      {refund.status === 'Rejected' && (
                        <span>
                          <strong>Refund Note:</strong> {refund.referenceNote || 'Please contact store support.'}
                        </span>
                      )}
                    </div>
                  )}

                  {(order.courier || order.awb || order.tracking?.courier || order.tracking?.awb) && (
                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-brand-border bg-emerald-50/70 px-5 py-3 text-emerald-950">
                      <div className="flex items-center gap-2.5">
                        <Icon name="truck" className="h-4 w-4 shrink-0 text-emerald-700" />
                        <span className="text-body-sm font-medium">
                          Shipped via <strong>{order.courier || order.tracking?.courier || 'Courier Partner'}</strong>
                          {(order.awb || order.tracking?.awb || order.trackingId) && (
                            <>
                              {' '}· Tracking Ref / AWB: <strong className="font-mono">{order.awb || order.tracking?.awb || order.trackingId}</strong>
                            </>
                          )}
                        </span>
                      </div>
                      <Link
                        to={`/track-order?order=${order.id}`}
                        className="text-label-sm font-bold uppercase tracking-wider text-emerald-800 underline-offset-2 hover:underline"
                      >
                        Track Live →
                      </Link>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-3 border-t border-brand-border px-5 py-4">
                    {order.canTrack && (
                      <Button variant="outline" size="sm" to={`/track-order?order=${order.id}`}>
                        <Icon name="truck" className="h-3.5 w-3.5" />
                        Track Order
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="border border-brand-border"
                      onClick={() => {
                        let addedCount = 0
                        order.items.forEach((item) => {
                          const product = catalogue[item.slug]
                          if (product) {
                            addItem(product)
                            addedCount += 1
                          }
                        })
                        if (addedCount > 0) {
                          toast({ title: 'Added to bag', description: `${addedCount} items from order ${order.id}` })
                          openCartDrawer()
                        }
                      }}
                    >
                      <Icon name="refresh" className="h-3.5 w-3.5" />
                      Buy Again
                    </Button>
                    {cancellable ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="border border-tier-original/30 text-tier-original"
                        onClick={() => openCancel(order)}
                      >
                        Cancel Order
                      </Button>
                    ) : packedOrAfter ? (
                      <span className="ml-auto text-body-sm text-brand-muted">
                        Parcel is packed — cancellation is locked.{' '}
                        <Link to="/pages/return-refund" className="link-underline text-brand-goldDark">
                          Return & Refund Policy
                        </Link>
                      </span>
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <Modal
        open={Boolean(cancelling)}
        onClose={() => !submitting && setCancelling(null)}
        title={cancelling ? `Cancel Order ${cancelling.id}` : 'Cancel Order'}
      >
        {cancelling && (
          <form onSubmit={submitCancel} className="space-y-4">
            <div className="rounded-lg border border-brand-border bg-brand-cream/50 p-4 text-body-sm text-ink-variant">
              <p className="font-semibold text-brand-charcoal">Cancellation &amp; Refund Policy</p>
              <p className="mt-1">
                Orders can only be cancelled <strong>before they are packed</strong>.
                {cancelling.isPrepaid
                  ? ` Since you paid online (${formatPrice(cancelling.total)}), please add your UPI ID below so the Shop Owner can manually transfer your refund.`
                  : ' Your Cash on Delivery order will be cancelled immediately with no charge.'}
              </p>
            </div>

            {cancelling.isPrepaid && (
              <Input
                label="Your UPI ID for Refund"
                required
                value={upiId}
                onChange={(event) => {
                  setUpiId(event.target.value)
                  if (cancelError) setCancelError('')
                }}
                placeholder="yourname@oksbi or 9876543210@ybl"
                hint="Owner will send the manual UPI refund to this exact ID within 2–3 working days."
              />
            )}

            <Input
              label="Reason for cancellation (optional)"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="e.g. Ordered by mistake / Want to change perfume"
            />

            {cancelError && <p className="text-body-sm font-medium text-rose-700">{cancelError}</p>}

            <div className="flex flex-wrap justify-end gap-3 border-t border-brand-border pt-4">
              <Button
                type="button"
                variant="ghost"
                className="border border-brand-border"
                disabled={submitting}
                onClick={() => setCancelling(null)}
              >
                Keep Order
              </Button>
              <Button type="submit" variant="primary" loading={submitting} disabled={submitting}>
                {cancelling.isPrepaid ? 'Cancel & Request UPI Refund' : 'Confirm Cancel'}
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  )
}

/** Personal Information panel matching the clean reference structure. */
function ProfileTab({ onOpenVerify }) {
  const user = useAuthStore((state) => state.user)
  const updateProfile = useAuthStore((state) => state.updateProfile)

  const initialNames = splitName(user?.name)
  const [draft, setDraft] = useState({
    firstName: user?.firstName ?? initialNames.firstName,
    lastName: user?.lastName ?? initialNames.lastName,
    phone: user?.phone ?? '',
    city: user?.city ?? '',
  })
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)

  useEffect(() => {
    const names = splitName(user?.name)
    setDraft({
      firstName: user?.firstName ?? names.firstName,
      lastName: user?.lastName ?? names.lastName,
      phone: user?.phone ?? '',
      city: user?.city ?? '',
    })
  }, [user?.id, user?.name, user?.firstName, user?.lastName, user?.phone, user?.city])

  const save = async (event) => {
    event.preventDefault()
    if (savingRef.current) return

    const next = {}
    const first = draft.firstName.trim()
    const last = draft.lastName.trim()
    const fullName = [first, last].filter(Boolean).join(' ')
    if (!first) next.firstName = 'Enter your first name.'
    if (!draft.phone.trim() || !/^[+]?[\d\s-]{10,15}$/.test(draft.phone.trim())) {
      next.phone = 'Mobile number is required (10 digits).'
    }
    if (!draft.city.trim()) {
      next.city = 'City is required.'
    }
    setErrors(next)
    if (Object.keys(next).length > 0) return

    savingRef.current = true
    setSaving(true)
    try {
      const result = await updateProfile({
        name: fullName,
        phone: draft.phone.trim(),
        city: draft.city.trim(),
      })
      if (result?.ok) {
        toast({ title: 'Personal information updated' })
      } else {
        toast({ title: 'Could not save profile', description: result?.message, tone: 'error' })
      }
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  return (
    <div>
      <PanelBanner
        icon="shield"
        title="Personal Information"
      />

      <form onSubmit={save} className="space-y-6 p-6 sm:p-8">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="First name"
            required
            value={draft.firstName}
            error={errors.firstName}
            placeholder="Enter your first name"
            onChange={(event) => {
              setErrors((prev) => ({ ...prev, firstName: '' }))
              setDraft((prev) => ({ ...prev, firstName: event.target.value }))
            }}
          />
          <Input
            label="Last name"
            value={draft.lastName}
            placeholder="Enter your last name"
            onChange={(event) => setDraft((prev) => ({ ...prev, lastName: event.target.value }))}
          />
        </div>

        <div>
          <div className="flex items-center justify-between">
            <label htmlFor="profile-email-display" className="field-label">
              Email
            </label>
            {user?.isEmailVerified ? (
              <span className="mb-1 inline-flex items-center gap-1 text-body-xs font-semibold text-emerald-700">
                <Icon name="check" className="h-3 w-3" /> Verified
              </span>
            ) : (
              <button
                type="button"
                onClick={onOpenVerify}
                className="mb-1 text-body-xs font-semibold text-brand-goldDark underline underline-offset-4 hover:text-brand-charcoal"
              >
                Verify email
              </button>
            )}
          </div>
          <Input
            id="profile-email-display"
            type="email"
            icon="mail"
            value={user?.email ?? ''}
            readOnly
            disabled
            className="cursor-not-allowed bg-brand-cream/40 text-ink-muted"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Mobile *"
            type="tel"
            required
            icon="phone"
            value={draft.phone}
            error={errors.phone}
            placeholder="Enter your mobile number"
            onChange={(event) => {
              setErrors((prev) => ({ ...prev, phone: '' }))
              setDraft((prev) => ({ ...prev, phone: event.target.value }))
            }}
          />
          <Input
            label="City *"
            required
            icon="map-pin"
            value={draft.city}
            error={errors.city}
            placeholder="Enter your city"
            onChange={(event) => {
              setErrors((prev) => ({ ...prev, city: '' }))
              setDraft((prev) => ({ ...prev, city: event.target.value }))
            }}
          />
        </div>

        <div className="flex flex-wrap gap-3 border-t border-brand-border/70 pt-5">
          <Button type="submit" variant="primary" loading={saving} disabled={saving}>
            Save
          </Button>
        </div>
      </form>
    </div>
  )
}

/** Loyalty & Rewards panel. */
function RewardsTab() {
  const user = useAuthStore((state) => state.user)
  const addFreeAttarReward = useCartStore((state) => state.addFreeAttarReward)
  const removeFreeAttarReward = useCartStore((state) => state.removeFreeAttarReward)
  const hasRewardInCart = useCartStore((state) => state.hasFreeAttarReward())
  const points = user?.loyaltyPoints ?? 0
  const unlocked = points >= 10
  const progress = Math.min(100, (points / 10) * 100)

  return (
    <div>
      <PanelBanner
        icon="award"
        title="Rewards & Loyalty"
        description="View your loyalty points balance and unlock complimentary rewards."
      />

      <div className="space-y-6 p-6 sm:p-8">
        {/* Main Points Card */}
        <div className="overflow-hidden rounded-xl border border-brand-gold/60 bg-gradient-to-br from-white via-brand-cream/30 to-amber-50/50 p-6 shadow-card">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <Chip tone="gold">
                <Icon name="crown" className="h-3.5 w-3.5" />
                {user?.tier ?? 'Patron Member'}
              </Chip>
              <p className="mt-4 font-serif text-3xl font-semibold text-brand-charcoal">{points} Points</p>
            </div>

            <div className="w-full max-w-xs">
              <div className="flex justify-between text-body-sm text-brand-muted">
                <span>{points} / 10 pts</span>
                <span>{unlocked ? 'Unlocked! 🎉' : `${Math.max(0, 10 - points)} pts left`}</span>
              </div>
              <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-brand-border">
                <div
                  className={cn(
                    'h-full rounded-full transition-all duration-500',
                    unlocked ? 'bg-emerald-600' : 'bg-brand-goldDark',
                  )}
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="mt-2 text-body-xs text-brand-muted">
                {unlocked
                  ? 'Complimentary reward unlocked with your next order!'
                  : `${Math.max(0, 10 - points)} more points needed to unlock reward.`}
              </p>
            </div>
          </div>

          {/* Claim Reward Banner if Unlocked */}
          {unlocked && (
            <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-amber-300 bg-amber-50/90 p-4">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-200 text-amber-900">
                  <Icon name="gift" className="h-6 w-6" />
                </span>
                <div>
                  <p className="text-body-sm font-bold text-amber-950">
                    Free 5ml Pure Attar Unlocked!
                  </p>
                  <p className="text-body-xs text-amber-800">
                    Redeem 10 of your points for a complimentary 5ml pure artisan attar at ₹0.
                  </p>
                </div>
              </div>

              {hasRewardInCart ? (
                <div className="flex items-center gap-3">
                  <span className="text-body-xs font-semibold text-emerald-800">
                    ✓ Claimed in Cart
                  </span>
                  <Button variant="outline" size="sm" to="/cart">
                    View Cart
                  </Button>
                </div>
              ) : (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    addFreeAttarReward()
                    toast({
                      title: 'Free 5ml Attar Added!',
                      description: 'Added to your bag at ₹0. 10 points will be redeemed at checkout.',
                    })
                  }}
                  className="bg-brand-charcoal hover:bg-brand-goldDark"
                >
                  <Icon name="plus" className="h-4 w-4" />
                  Add Free 5ml Attar (₹0)
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Reward Showcase & Links */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-brand-border bg-white/50 p-5">
            <h3 className="text-body-md font-semibold text-brand-charcoal">Saved Wishlist</h3>
            <p className="mt-1 text-body-sm text-brand-muted">Revisit fragrances you have hearted for later.</p>
            <Button variant="outline" size="sm" className="mt-4" to="/wishlist">
              <Icon name="heart" className="h-3.5 w-3.5" />
              View Wishlist
            </Button>
          </div>
          <div className="rounded-lg border border-brand-border bg-white/50 p-5">
            <h3 className="text-body-md font-semibold text-brand-charcoal">Live Website Offers</h3>
            <p className="mt-1 text-body-sm text-brand-muted">Browse coupon codes ready to apply at checkout.</p>
            <Button variant="outline" size="sm" className="mt-4" to="/offers">
              <Icon name="tag" className="h-3.5 w-3.5" />
              See Offers
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

/** Saved addresses with full CRUD through the auth store. */
function AddressesTab() {
  const addresses = useAuthStore((state) => state.addresses)
  const user = useAuthStore((state) => state.user)
  const addAddress = useAuthStore((state) => state.addAddress)
  const updateAddress = useAuthStore((state) => state.updateAddress)
  const removeAddress = useAuthStore((state) => state.removeAddress)
  const setDefaultAddress = useAuthStore((state) => state.setDefaultAddress)

  const [editing, setEditing] = useState(null)
  const [draft, setDraft] = useState(EMPTY_ADDRESS)
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)

  const openNew = () => {
    setDraft({ ...EMPTY_ADDRESS, name: user?.name ?? '', phone: user?.phone ?? '' })
    setErrors({})
    setEditing('new')
  }

  const openEdit = (address) => {
    setDraft({ ...EMPTY_ADDRESS, ...address })
    setErrors({})
    setEditing(address.id)
  }

  const save = async (event) => {
    event.preventDefault()
    if (savingRef.current) return

    const next = {}
    if (!draft.tag.trim()) next.tag = 'Give this address a label.'
    if (!draft.name.trim()) next.name = 'Required.'
    if (!draft.phone.trim() || !/^[+]?[\d\s-]{10,15}$/.test(draft.phone.trim())) {
      next.phone = 'Mobile number is required (10 digits).'
    }
    if (!draft.line1.trim()) next.line1 = 'Required.'
    if (!draft.district.trim()) next.district = 'Required.'
    if (!draft.state.trim()) next.state = 'Required.'
    if (!draft.city.trim()) next.city = 'Required.'
    if (!/^\d{6}$/.test(draft.pincode)) next.pincode = 'Enter a 6-digit PIN code.'
    setErrors(next)
    if (Object.keys(next).length > 0) return

    if (/^\d{6}$/.test(draft.pincode)) {
      const pinDetails = await pincodeDetails(draft.pincode)
      if (pinDetails?.district && !districtsMatch(draft.district, pinDetails.district)) {
        setErrors((prev) => ({
          ...prev,
          pincode: `PIN code ${draft.pincode} belongs to ${pinDetails.district}, not ${draft.district}.`,
        }))
        toast({
          title: 'Location mismatch',
          description: `PIN code ${draft.pincode} belongs to ${pinDetails.district}. Please match the district.`,
          tone: 'error',
        })
        return
      }
    }

    savingRef.current = true
    setSaving(true)
    try {
      if (editing === 'new') {
        await addAddress(draft)
        toast({ title: 'Address saved', description: draft.tag })
      } else {
        await updateAddress(editing, draft)
        toast({ title: 'Address updated', description: draft.tag })
      }
      setEditing(null)
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  return (
    <div>
      <PanelBanner
        icon="map-pin"
        title="Saved Addresses"
        action={
          <Button variant="primary" size="sm" onClick={openNew}>
            <Icon name="plus" className="h-4 w-4" strokeWidth={2.5} />
            Add Address
          </Button>
        }
      />

      <div className="p-6 sm:p-8">
        {addresses.length === 0 ? (
          <EmptyState
            icon="map-pin"
            title="No saved addresses"
            actionLabel="Add Address"
            onAction={openNew}
          />
        ) : (
          <ul className="grid gap-5 sm:grid-cols-2">
            {addresses.map((address) => {
              const isDefault = address.id === user?.defaultAddressId
              return (
                <li
                  key={address.id}
                  className={cn(
                    'flex flex-col rounded-lg border bg-white/55 p-5',
                    isDefault ? 'border-brand-gold' : 'border-brand-border',
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-body-md font-semibold text-brand-charcoal">{address.tag}</p>
                      <p className="mt-0.5 text-label-sm font-bold uppercase text-brand-muted">
                        {address.type}
                        {isDefault && <span className="ml-2 text-brand-goldDark">· Default</span>}
                      </p>
                    </div>
                    <Icon name={address.type === 'Office' ? 'delivery' : 'map-pin'} className="h-5 w-5 text-brand-goldDark" />
                  </div>

                  <address className="mt-4 space-y-0.5 text-body-sm not-italic text-ink-variant">
                    <p className="font-medium text-brand-charcoal">{address.name}</p>
                    <p>{address.line1}</p>
                    {address.line2 && <p>{address.line2}</p>}
                    <p>
                      {address.area ? `${address.area}, ` : ''}
                      {address.city}
                      {address.district && address.district.toLowerCase() !== address.city.toLowerCase() ? `, ${address.district}` : ''}
                      , {address.state} {address.pincode}
                    </p>
                    <p className="pt-1">{address.phone}</p>
                  </address>

                  <div className="mt-auto flex flex-wrap gap-3 border-t border-brand-border pt-4">
                    <Button variant="ghost" size="sm" className="border border-brand-border" onClick={() => openEdit(address)}>
                      <Icon name="edit" className="h-3.5 w-3.5" />
                      Edit
                    </Button>
                    {!isDefault && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="border border-brand-border"
                        onClick={() => {
                          setDefaultAddress(address.id)
                          toast({ title: 'Default address updated', description: address.tag })
                        }}
                      >
                        Make Default
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="border border-tier-original/30 text-tier-original"
                      onClick={() => {
                        removeAddress(address.id)
                        toast({ title: 'Address removed', description: address.tag, tone: 'info' })
                      }}
                    >
                      <Icon name="trash" className="h-3.5 w-3.5" />
                      Remove
                    </Button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <Modal
        open={editing !== null}
        onClose={() => !saving && setEditing(null)}
        title={editing === 'new' ? 'Add Address' : 'Edit Address'}
        size="lg"
      >
        <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Label"
            required
            containerClassName="sm:col-span-2"
            placeholder="Enter a label for this address"
            value={draft.tag}
            error={errors.tag}
            onChange={(event) => setDraft({ ...draft, tag: event.target.value })}
          />
          <Input
            label="Recipient name"
            required
            value={draft.name}
            error={errors.name}
            onChange={(event) => setDraft({ ...draft, name: event.target.value })}
          />
          <Input
            label="Mobile"
            type="tel"
            required
            icon="phone"
            value={draft.phone}
            error={errors.phone}
            placeholder="10-digit mobile number"
            onChange={(event) => {
              setErrors((prev) => ({ ...prev, phone: '' }))
              setDraft({ ...draft, phone: event.target.value })
            }}
          />
          <Input
            label="Address line 1"
            required
            containerClassName="sm:col-span-2"
            value={draft.line1}
            error={errors.line1}
            onChange={(event) => setDraft({ ...draft, line1: event.target.value })}
          />
          <Input
            label="Address line 2"
            containerClassName="sm:col-span-2"
            value={draft.line2}
            onChange={(event) => setDraft({ ...draft, line2: event.target.value })}
          />
          <AddressFields
            value={draft}
            onChange={(patch) => setDraft((current) => ({ ...current, ...patch }))}
            errors={errors}
          />
          <Select
            label="Address type"
            options={['Home', 'Office', 'Other']}
            value={draft.type}
            onChange={(event) => setDraft({ ...draft, type: event.target.value })}
          />

          <div className="flex flex-wrap justify-end gap-3 border-t border-brand-border pt-5 sm:col-span-2">
            <Button type="button" variant="ghost" disabled={saving} className="border border-brand-border" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={saving} disabled={saving}>
              {editing === 'new' ? 'Save Address' : 'Update Address'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

/** Notification & communication preferences. */
function PreferencesTab({ onOpenVerify }) {
  const user = useAuthStore((state) => state.user)

  return (
    <div>
      <PanelBanner
        icon="sliders"
        title="Contact Preferences"
      />

      <div className="space-y-6 p-6 sm:p-8">
        <div className="rounded-lg border border-brand-border bg-white/55 p-6">
          <h3 className="text-label-md font-bold uppercase tracking-widest text-brand-charcoal">Notifications</h3>
          <div className="mt-4 space-y-4">
            <Checkbox defaultChecked label="Order & delivery updates" />
            <Checkbox defaultChecked label="New stock releases" />
            <Checkbox label="Fragrance blog" />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-brand-border bg-white/55 p-6">
          <div>
            <h3 className="text-body-md font-semibold text-brand-charcoal">Email Verification</h3>
            <p className="mt-1 text-body-sm text-brand-muted">
              {user?.isEmailVerified
                ? `${user.email} is verified for password recovery and order receipts.`
                : `${user?.email} is unverified — verify it to secure account recovery.`}
            </p>
          </div>
          {user?.isEmailVerified ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-label-sm font-semibold text-emerald-800">
              <Icon name="check" className="h-3.5 w-3.5" />
              Verified
            </span>
          ) : (
            <Button variant="primary" size="sm" onClick={onOpenVerify}>
              Verify Email
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

export function AccountPage() {
  useDocumentTitle('My Account')

  const [searchParams, setSearchParams] = useSearchParams()
  const user = useAuthStore((state) => state.user)
  const orders = useAuthStore((state) => state.orders)
  const status = useAuthStore((state) => state.status)
  const signOut = useAuthStore((state) => state.signOut)
  const verifyEmailStore = useAuthStore((state) => state.verifyEmail)
  const sendVerificationCodeStore = useAuthStore((state) => state.sendVerificationCode)

  const initialTab = VALID_TABS.has(searchParams.get('tab')) ? searchParams.get('tab') : 'profile'
  const [tab, setTabState] = useState(initialTab)

  const setTab = (next) => {
    setTabState(next)
    if (next === 'profile') {
      setSearchParams({}, { replace: true })
    } else {
      setSearchParams({ tab: next }, { replace: true })
    }
  }

  // Verification modal state
  const [showVerifyModal, setShowVerifyModal] = useState(false)
  const [verifyCode, setVerifyCode] = useState('')
  const [verifyBusy, setVerifyBusy] = useState(false)
  const [verifyMsg, setVerifyMsg] = useState('')
  const [verifyError, setVerifyError] = useState('')

  const handleOpenVerifyModal = async () => {
    setShowVerifyModal(true)
    setVerifyError('')
    setVerifyMsg('Sending verification code to your email...')
    setVerifyBusy(true)
    const res = await sendVerificationCodeStore(user?.email)
    setVerifyBusy(false)
    if (res.ok) {
      setVerifyMsg(res.message || 'Verification code sent to your email.')
    } else {
      setVerifyError(res.message || 'Failed to send verification code.')
    }
  }

  const handleVerifySubmit = async (e) => {
    e.preventDefault()
    if (!verifyCode.trim()) {
      setVerifyError('Please enter the 6-digit verification code.')
      return
    }
    setVerifyBusy(true)
    setVerifyError('')
    const res = await verifyEmailStore(verifyCode.trim())
    setVerifyBusy(false)
    if (res.ok) {
      setShowVerifyModal(false)
      toast({ title: 'Email Verified', description: 'Your email address is now verified.' })
    } else {
      setVerifyError(res.message)
    }
  }

  const handleSignOut = () => {
    signOut()
    toast({ title: 'Signed out', tone: 'info' })
  }

  if (status === 'restoring') {
    return (
      <div className="shell py-16">
        <p className="text-body-md text-brand-muted">Loading your account…</p>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="shell py-16">
        <EmptyState
          icon="user"
          title="You are signed out"
          description="Sign back in to view your profile, orders, and delivery addresses."
          actionLabel="Sign In"
          actionTo="/sign-in"
        />
      </div>
    )
  }

  const counts = { orders: orders.length }

  return (
    <div className="shell py-8 lg:py-12">
      <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[17.5rem_minmax(0,1fr)] lg:items-start">
        {/* Left Navigation Sidebar (mirrors clean vertical profile structure) */}
        <aside className="overflow-hidden rounded-xl border border-brand-border bg-white shadow-card">
          {/* Identity Summary */}
          <div className="border-b border-brand-border px-5 py-6 text-center">
            <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-brand-charcoal font-serif text-xl font-semibold text-brand-gold ring-2 ring-brand-gold/40 ring-offset-2 ring-offset-white">
              {user.avatarInitials ?? initials(user.name)}
            </span>

            <h2 className="mt-3.5 font-serif text-xl font-semibold text-brand-charcoal">{user.name}</h2>
            {user.username && <p className="text-body-xs font-medium text-brand-muted">@{user.username}</p>}

            <div className="mt-3">
              <p className="font-serif text-xl font-semibold text-brand-charcoal">
                {user.loyaltyPoints ?? 0} pts
              </p>
              <p className="text-label-sm font-bold uppercase tracking-wider text-brand-muted">
                {user.tier ?? 'Balance'}
              </p>
            </div>
          </div>

          {/* Mobile horizontal nav */}
          <nav aria-label="Account sections mobile" className="no-scrollbar flex gap-2 overflow-x-auto border-b border-brand-border/70 px-4 py-3 lg:hidden">
            {NAV_GROUPS.flat().map((item) => {
              const active = tab === item.id
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id)}
                  className={cn(
                    'flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-body-xs font-medium transition',
                    active
                      ? 'border-brand-goldDark bg-brand-charcoal text-brand-ivory'
                      : 'border-brand-border bg-white/60 text-ink-variant',
                  )}
                >
                  <Icon name={item.icon} className="h-3.5 w-3.5" />
                  {item.label}
                </button>
              )
            })}
          </nav>

          {/* Desktop vertical navigation menu */}
          <nav aria-label="Account navigation" className="hidden lg:block py-2">
            {NAV_GROUPS.map((group, groupIdx) => (
              <div key={groupIdx} className={cn(groupIdx > 0 && 'mt-1.5 border-t border-brand-border/70 pt-1.5')}>
                {group.map((item) => {
                  const active = tab === item.id
                  const badge = counts[item.id]
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setTab(item.id)}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'flex w-full items-center justify-between border-l-[3px] px-5 py-3 text-left text-body-sm transition',
                        active
                          ? 'border-brand-goldDark bg-neutral-50 font-semibold text-brand-charcoal'
                          : 'border-transparent text-ink-variant hover:bg-neutral-50 hover:text-brand-charcoal',
                      )}
                    >
                      <span className="flex items-center gap-3">
                        <Icon
                          name={item.icon}
                          className={cn('h-4 w-4 shrink-0', active ? 'text-brand-goldDark' : 'text-brand-muted')}
                        />
                        {item.label}
                      </span>
                      {badge > 0 && (
                        <span className="rounded-full border border-brand-border bg-white px-2 py-0.5 text-label-sm font-semibold text-brand-charcoal">
                          {badge}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            ))}

            {/* Bottom Help & Sign Out section */}
            <div className="mt-1.5 border-t border-brand-border/70 pt-1.5">
              <Link
                to="/pages/contact"
                className="flex w-full items-center gap-3 border-l-[3px] border-transparent px-5 py-3 text-body-sm text-ink-variant transition hover:bg-neutral-50 hover:text-brand-charcoal"
              >
                <Icon name="info" className="h-4 w-4 shrink-0 text-brand-muted" />
                Need Help
              </Link>
              <button
                type="button"
                onClick={handleSignOut}
                className="flex w-full items-center gap-3 border-l-[3px] border-transparent px-5 py-3 text-left text-body-sm text-tier-original transition hover:bg-tier-originalSurface"
              >
                <Icon name="logout" className="h-4 w-4 shrink-0" />
                Sign Out
              </button>
            </div>
          </nav>

          {/* Mobile Help & Sign Out strip */}
          <div className="flex items-center justify-between border-t border-brand-border/70 px-4 py-2.5 text-body-xs lg:hidden">
            <Link to="/pages/contact" className="inline-flex items-center gap-1.5 text-brand-muted hover:text-brand-charcoal">
              <Icon name="info" className="h-3.5 w-3.5" />
              Need Help
            </Link>
            <button
              type="button"
              onClick={handleSignOut}
              className="inline-flex items-center gap-1.5 font-semibold text-tier-original"
            >
              <Icon name="logout" className="h-3.5 w-3.5" />
              Sign Out
            </button>
          </div>
        </aside>

        {/* Right Content Card */}
        <section className="overflow-hidden rounded-xl border border-brand-border bg-white shadow-card">
          {tab === 'overview' && <OverviewTab onTab={setTab} />}
          {tab === 'orders' && <OrdersTab />}
          {tab === 'profile' && <ProfileTab onOpenVerify={handleOpenVerifyModal} />}
          {tab === 'rewards' && <RewardsTab />}
          {tab === 'addresses' && <AddressesTab />}
          {tab === 'preferences' && <PreferencesTab onOpenVerify={handleOpenVerifyModal} />}
        </section>
      </div>

      {/* Email Verification Modal */}
      <Modal
        open={showVerifyModal}
        onClose={() => setShowVerifyModal(false)}
        title="Verify your email address"
      >
        <div className="space-y-4">
          <p className="text-body-sm text-brand-muted">
            We sent a 6-digit confirmation code to{' '}
            <strong className="text-brand-charcoal">{user.email}</strong>.
            Please check your email inbox and enter it below.
          </p>

          {verifyMsg && (
            <p className="rounded border border-emerald-200 bg-emerald-50 p-2 text-body-xs text-emerald-800">
              {verifyMsg}
            </p>
          )}

          {verifyError && (
            <p className="rounded border border-tier-original/30 bg-tier-originalSurface p-2 text-body-xs text-tier-original">
              {verifyError}
            </p>
          )}

          <form onSubmit={handleVerifySubmit} className="space-y-4">
            <Input
              label="6-Digit Verification Code"
              required
              maxLength={6}
              value={verifyCode}
              onChange={(e) => setVerifyCode(e.target.value)}
              placeholder="Enter the 6-digit code"
              className="text-center font-mono text-lg tracking-widest"
            />

            <div className="flex gap-2">
              <Button type="submit" variant="primary" loading={verifyBusy} fullWidth>
                Verify Now
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowVerifyModal(false)}
                className="border-brand-border"
              >
                Skip / Later
              </Button>
            </div>
          </form>

          <div className="flex items-center justify-between border-t border-brand-border pt-3 text-body-xs text-brand-muted">
            <span>Did not receive it?</span>
            <button
              type="button"
              onClick={handleOpenVerifyModal}
              disabled={verifyBusy}
              className="font-semibold text-brand-goldDark underline hover:text-brand-charcoal"
            >
              Resend code
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

export default AccountPage
