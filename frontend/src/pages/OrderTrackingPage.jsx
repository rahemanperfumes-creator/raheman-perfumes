import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import cn from '@/lib/cn'
import { formatDate, formatPrice } from '@/lib/format'
import { orderService } from '@/services/orderService'
import useAuthStore from '@/store/authStore'
import { useCartStore } from '@/store/cartStore'
import { useUiStore, toast } from '@/store/uiStore'
import { Icon } from '@/components/ui/Icon'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Form'
import { EmptyState } from '@/components/ui/Feedback'
import { FlaconStage } from '@/components/product/FlaconArt'
import { productImage } from '@/data/productImages'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { ORDER_STATUS, formatOrderStatus } from '@/data/account'
import { TaxInvoice, TaxInvoiceModal } from '@/components/order/TaxInvoice'

/** Helper to extract short formatted date e.g. 'OCT 19' */
function shortDate(dateStr) {
  if (!dateStr) return ''
  try {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return dateStr
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }).toUpperCase()
  } catch {
    return dateStr
  }
}

/** Get direct external courier tracking portal link when available */
function getCourierTrackingUrl(courier = '', awb = '') {
  if (!awb) return null
  const c = courier.toLowerCase()
  if (c.includes('blue dart') || c.includes('bluedart')) {
    return `https://www.bluedart.com/tracking`
  }
  if (c.includes('delhivery')) {
    return `https://www.delhivery.com/track/package/${encodeURIComponent(awb)}`
  }
  if (c.includes('dtdc')) {
    return `https://www.dtdc.in/tracking/shipment-tracking.asp`
  }
  if (c.includes('dhl')) {
    return `https://www.dhl.com/in-en/home/tracking/tracking-express.html?submit=1&tracking-id=${encodeURIComponent(awb)}`
  }
  return null
}

export function OrderTrackingPage() {
  useDocumentTitle('Order Details & Tracking')

  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const orders = useAuthStore((state) => state.orders)
  const addItem = useCartStore((state) => state.addItem)
  const openCartDrawer = useUiStore((state) => state.openCartDrawer)

  const initial = searchParams.get('order') ?? ''
  const [query, setQuery] = useState(initial)
  const [searched, setSearched] = useState(Boolean(initial))
  const [error, setError] = useState('')
  const [status, setStatus] = useState(initial ? 'loading' : 'idle')
  const [tracking, setTracking] = useState(null)
  const [showScanHistory, setShowScanHistory] = useState(false)
  const [showInvoiceModal, setShowInvoiceModal] = useState(false)
  const [verifyPhone, setVerifyPhone] = useState('')
  const [unlocking, setUnlocking] = useState(false)
  const [unlockError, setUnlockError] = useState('')

  const handleUnlock = async (e) => {
    e?.preventDefault()
    if (!verifyPhone.trim()) return
    setUnlocking(true)
    setUnlockError('')
    try {
      const found = await orderService.track(initial || tracking?.orderId, verifyPhone.trim())
      if (found?.verified) {
        setTracking(found)
        setUnlockError('')
      } else {
        setUnlockError('Mobile number does not match this order. Please verify and try again.')
      }
    } catch {
      setUnlockError('Verification is temporarily unavailable. Please try again.')
    } finally {
      setUnlocking(false)
    }
  }

  // If no order is specified in the URL, but the user has past orders, auto-load their latest order
  useEffect(() => {
    if (!initial && orders && orders.length > 0) {
      const latest = orders[0]
      if (latest?.id) {
        navigate(`/track-order?order=${encodeURIComponent(latest.id)}`, { replace: true })
      }
    }
  }, [initial, orders, navigate])

  useEffect(() => {
    if (!initial) return undefined
    let cancelled = false
    setTracking(null)
    setStatus('loading')
    setError('')

    orderService
      .track(initial)
      .then((found) => {
        if (cancelled) return
        if (found) {
          setTracking(found)
          setStatus('ready')
          return
        }
        setStatus('missing')
        setError(`No order matches “${initial}”.`)
      })
      .catch(() => {
        if (cancelled) return
        setStatus('unreachable')
        setError('Tracking is unavailable right now.')
      })

    return () => {
      cancelled = true
    }
  }, [initial])

  const submit = (event) => {
    event.preventDefault()
    const trimmed = query.trim().toUpperCase()
    if (!trimmed) return
    setSearched(true)
    navigate(`/track-order?order=${encodeURIComponent(trimmed)}`, { replace: true })
  }

  // Calculate 4-step progress based on order status:
  // 0: Cancelled, 1: Order Placed, 2: Packed & Sealed, 3: In Transit, 4: Delivered
  const getProgressStage = (orderStatus) => {
    const s = String(orderStatus || '').toLowerCase()
    if (s.includes('cancel')) return 0
    if (s.includes('deliver')) return 4
    if (s.includes('ship') || s.includes('transit') || s.includes('out for delivery')) return 3
    if (s.includes('pack')) return 2
    return 1
  }

  const currentStage = tracking ? getProgressStage(tracking.status) : 1
  const totalItemCount = tracking?.items?.reduce((sum, it) => sum + (Number(it.qty) || 1), 0) || 0

  const packedEvent = tracking?.checkpoints?.find((cp) => cp.title?.toLowerCase().includes('pack'))
  const shippedEvent = tracking?.checkpoints?.find((cp) => cp.title?.toLowerCase().includes('transit') || cp.title?.toLowerCase().includes('dispatch'))
  const deliveredEvent = tracking?.checkpoints?.find((cp) => cp.title?.toLowerCase().includes('deliver'))

  const handleBuyAgain = (item) => {
    addItem({
      id: item.slug || item.id,
      productId: item.slug || item.id,
      slug: item.slug,
      name: item.name,
      price: item.price || 800,
      volume: item.volume || '50ml',
      images: item.image ? [item.image] : [],
      quantity: 1,
    })
    openCartDrawer()
    toast({ title: 'Added to bag', description: `${item.name} (${item.volume || '50ml'})` })
  }

  return (
    <>
      <div className="shell py-8 lg:py-12 print:hidden">
        {/* ──────────────── BREADCRUMBS & TOP BAR ──────────────── */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-brand-border/70 pb-4 text-xs">
          <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-brand-muted">
            <Link to="/" className="transition hover:text-brand-charcoal">
              Home
            </Link>
            <span>/</span>
            <Link to="/account" className="transition hover:text-brand-charcoal">
              My Account
            </Link>
            <span>/</span>
            <Link to="/account?tab=orders" className="transition hover:text-brand-charcoal">
              My Orders
            </Link>
            <span>/</span>
            <span className="font-semibold text-brand-charcoal">Order Details</span>
          </nav>

          {tracking && tracking.verified && (
            <button
              type="button"
              onClick={() => setShowInvoiceModal(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-brand-border bg-white px-3 py-1.5 text-xs font-semibold text-brand-charcoal shadow-xs transition hover:border-brand-gold hover:text-brand-goldDark active:scale-95"
            >
              <Icon name="file-text" className="h-4 w-4 text-brand-goldDark" />
              <span>View PDF Invoice</span>
            </button>
          )}
        </div>

        {/* ──────────────── SEARCH BAR (If looking up another order) ──────────────── */}
        {!tracking && (
          <div className="mx-auto mt-6 max-w-xl">
            <h1 className="font-serif text-3xl font-bold text-brand-charcoal">Track Your Order</h1>
            <p className="mt-1 text-sm text-brand-muted">
              Enter your order reference number (e.g. RP-102938) from your order confirmation email or SMS.
            </p>
            <form onSubmit={submit} className="mt-5 flex gap-2">
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value.toUpperCase())}
                placeholder="Order number e.g. RP-102938"
                aria-label="Order number"
                icon="package"
                error={error}
                containerClassName="flex-1"
              />
              <Button type="submit" variant="primary" className="shrink-0">
                Track
                <Icon name="arrow-right" className="h-4 w-4" />
              </Button>
            </form>

            {searched && status === 'loading' && (
              <p className="mt-8 text-center text-sm text-brand-muted">Retrieving order details…</p>
            )}

            {searched && status !== 'loading' && !tracking && (
              <div className="mt-8">
                <EmptyState
                  icon="package"
                  title={`No order found for “${initial || query}”`}
                  description="Please check the order number in your confirmation email or order history."
                  actionLabel="View All Orders"
                  actionTo="/account?tab=orders"
                />
              </div>
            )}
          </div>
        )}

        {/* ──────────────── B&H STYLE ORDER DETAILS & TRACKING VIEW ──────────────── */}
        {tracking && (
          <div className="mt-6">
            {!tracking.verified && (
              <div className="mb-6 rounded-xl border border-amber-200/90 bg-amber-50/80 p-4 text-xs text-amber-950 shadow-xs">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <Icon name="lock" className="h-4 w-4 shrink-0 text-amber-700" />
                    <div>
                      <p className="font-bold text-amber-900">Delivery Address Masked for Customer Privacy</p>
                      <p className="text-amber-800/90">
                        Enter the mobile number linked with this order to view full delivery address &amp; access the tax invoice.
                      </p>
                    </div>
                  </div>
                  <form onSubmit={handleUnlock} className="flex items-center gap-2 shrink-0">
                    <input
                      type="tel"
                      value={verifyPhone}
                      onChange={(e) => setVerifyPhone(e.target.value)}
                      placeholder="Mobile number"
                      aria-label="Mobile number for verification"
                      className="h-8 w-36 rounded-md border border-amber-300 bg-white px-2.5 text-xs font-mono text-brand-charcoal focus:outline-none focus:ring-1 focus:ring-amber-500"
                    />
                    <button
                      type="submit"
                      disabled={unlocking}
                      className="h-8 rounded-md bg-amber-800 px-3 text-xs font-bold text-white transition hover:bg-amber-900 disabled:opacity-50"
                    >
                      {unlocking ? 'Verifying…' : 'Unlock'}
                    </button>
                  </form>
                </div>
                {unlockError && <p className="mt-2 text-[11px] font-semibold text-rose-700">{unlockError}</p>}
              </div>
            )}

            {/* Top Title & Order Support Button */}
            <div className="flex flex-wrap items-start justify-between gap-4">
              <h1 className="font-serif text-3xl font-bold tracking-tight text-brand-charcoal">
                Order Details
              </h1>

              <Button
                variant="outline"
                size="sm"
                href={`https://wa.me/917504468885?text=${encodeURIComponent(
                  `Hi, I need assistance with Order ${tracking.orderId}`,
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="border-brand-border bg-white px-5 py-2 text-xs font-semibold text-brand-charcoal shadow-sm hover:bg-[#F9F9F9]"
              >
                Order Support
              </Button>
            </div>

            {/* 3-Column Summary Header */}
            <div className="mt-6 grid gap-8 border-b border-brand-border/70 pb-8 text-xs sm:grid-cols-2 lg:grid-cols-3">
              {/* Column 1: Order Metadata */}
              <div className="space-y-1.5 leading-relaxed text-brand-charcoal">
                <p className="font-medium text-brand-muted">{tracking.placedLabel}</p>
                <p className="text-base font-bold text-brand-charcoal">Order #{tracking.orderId}</p>

                <div className="pt-2">
                  <span className="text-brand-muted">Order Status: </span>
                  <span
                    className={cn(
                      'font-bold',
                      tracking.status === 'Cancelled'
                        ? 'text-rose-700'
                        : tracking.status === 'Delivered'
                          ? 'text-emerald-700'
                          : 'text-[#2D6A4F]',
                    )}
                  >
                    {tracking.status}
                  </span>
                </div>
                <p className="text-brand-muted">
                  Packages in this order:{' '}
                  <span className="font-medium text-brand-charcoal">1</span>
                </p>
                <p className="text-brand-muted">
                  Total Items:{' '}
                  <span className="font-medium text-brand-charcoal">{totalItemCount || tracking.itemCount || 1}</span>
                </p>
              </div>

              {/* Column 2: Ship To & Payment Information */}
              {tracking.verified ? (
                <>
                  <div className="space-y-4 text-brand-charcoal">
                    <div>
                      <p className="font-bold text-brand-charcoal">Ship To</p>
                      <p className="mt-1 font-semibold text-brand-charcoal">
                        {tracking.destination?.name || tracking.consignee || 'Valued Customer'}
                      </p>
                      <p className="mt-0.5 leading-relaxed text-brand-muted">
                        {tracking.destination?.line1}
                        {tracking.destination?.line2 ? `, ${tracking.destination?.line2}` : ''}
                        <br />
                        {tracking.destination?.city}
                        {tracking.destination?.state ? `, ${tracking.destination.state}` : ''}{' '}
                        {tracking.destination?.pincode}
                      </p>
                      {tracking.destination?.phone && (
                        <p className="mt-1 font-mono text-brand-muted">{tracking.destination.phone}</p>
                      )}
                    </div>

                    <div>
                      <p className="font-bold text-brand-charcoal">Payment Information</p>
                      <div className="mt-1 flex items-center gap-2 text-brand-charcoal">
                        <Icon name="credit-card" className="h-4 w-4 text-brand-goldDark" />
                        <span className="font-medium">
                          {tracking.payment?.method || 'Online Payment'}
                        </span>
                        {tracking.amounts?.total != null && (
                          <>
                            <span className="text-brand-muted">·</span>
                            <span className="font-semibold font-mono">
                              {formatPrice(tracking.amounts?.total)}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Column 3: Order Summary */}
                  <div className="text-brand-charcoal">
                    <p className="font-bold text-brand-charcoal">Order Summary</p>
                    <div className="mt-2 space-y-1.5 border-t border-brand-border/40 pt-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-brand-muted">Subtotal</span>
                        <span className="tabular-nums font-medium">
                          {formatPrice(tracking.amounts?.subtotal)}
                        </span>
                      </div>

                      {tracking.amounts?.discount !== 0 && (
                        <div className="flex items-center justify-between text-emerald-700">
                          <span>Discount</span>
                          <span className="tabular-nums font-medium">
                            -{formatPrice(Math.abs(tracking.amounts?.discount))}
                          </span>
                        </div>
                      )}

                      <div className="flex items-center justify-between">
                        <span className="text-brand-muted">Shipping</span>
                        <span className="tabular-nums font-medium">
                          {tracking.amounts?.shipping === 0 ? 'FREE' : formatPrice(tracking.amounts?.shipping)}
                        </span>
                      </div>

                      <div className="flex items-center justify-between border-t border-brand-border/70 pt-2 text-sm font-bold text-brand-charcoal">
                        <span>Total</span>
                        <span className="tabular-nums text-base">
                          {formatPrice(tracking.amounts?.total)}
                        </span>
                      </div>
                    </div>
                  </div>
                </>
              ) : (
                <div className="sm:col-span-2 rounded-lg border border-neutral-200/80 bg-neutral-50/70 p-4 text-xs text-brand-muted flex flex-col justify-center">
                  <div className="flex items-center gap-2 text-brand-charcoal font-semibold mb-1">
                    <Icon name="shield" className="h-4 w-4 text-brand-goldDark" />
                    <span>Customer Privacy Protected</span>
                  </div>
                  <p>
                    Delivery destination, payment method, order total, and item breakdown are masked for guest searches. Enter your verified mobile number above to unlock full details and invoice.
                  </p>
                </div>
              )}
            </div>

            {/* ──────────────── THE SHIPMENT / TRACKING CARD ──────────────── */}
            <div className="mt-8 rounded-xl border border-brand-border/80 bg-white shadow-sm overflow-hidden">
              {/* Card Header */}
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-brand-border/60 bg-[#FAFAFA] p-6">
                <div>
                  <h2 className="text-2xl font-bold tracking-tight text-brand-charcoal">
                    {tracking.status}
                  </h2>
                  <p className="mt-0.5 text-xs text-brand-muted">
                    {totalItemCount} {totalItemCount === 1 ? 'product' : 'products'} in this order
                  </p>

                  <div className="mt-2.5 flex flex-wrap items-center gap-2">
                    {currentStage === 4 || tracking.status === 'Delivered' ? (
                      <span className="inline-flex items-center gap-1.5 rounded border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-900">
                        <Icon name="check-circle" className="h-3.5 w-3.5 text-emerald-700" />
                        Delivered Successfully
                      </span>
                    ) : tracking.courier ? (
                      <span className="inline-flex items-center gap-1.5 rounded bg-brand-charcoal px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-white">
                        <Icon name="truck" className="h-3.5 w-3.5 text-brand-gold" />
                        {tracking.courier}
                        {tracking.transitNote ? ` · ${tracking.transitNote}` : ''}
                      </span>
                    ) : currentStage === 3 ? (
                      <span className="inline-flex items-center gap-1.5 rounded bg-brand-charcoal px-2.5 py-1 text-xs font-bold uppercase tracking-wider text-white">
                        <Icon name="truck" className="h-3.5 w-3.5 text-brand-gold" />
                        In Transit · En Route
                      </span>
                    ) : currentStage === 2 ? (
                      <span className="inline-flex items-center gap-1.5 rounded border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900">
                        <Icon name="package" className="h-3.5 w-3.5 text-amber-700" />
                        Packed · Ready for Courier Pickup
                      </span>
                    ) : currentStage === 0 ? (
                      <span className="inline-flex items-center gap-1.5 rounded border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-800">
                        Cancelled
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded border border-brand-gold/30 bg-brand-cream px-2.5 py-1 text-xs font-semibold text-brand-goldDark">
                        <Icon name="check-circle" className="h-3.5 w-3.5" />
                        Confirmed · Atelier Compounding &amp; Prep
                      </span>
                    )}

                    {tracking.awb && (
                      <span className="inline-flex items-center gap-1.5 rounded border border-brand-border bg-white px-2.5 py-1 text-xs text-brand-muted">
                        AWB: <strong className="font-mono text-brand-charcoal select-all">{tracking.awb}</strong>
                        <button
                          type="button"
                          onClick={() => {
                            if (navigator?.clipboard?.writeText) {
                              navigator.clipboard.writeText(tracking.awb)
                              toast({ title: 'Copied tracking number', description: tracking.awb })
                            }
                          }}
                          className="text-brand-muted hover:text-brand-charcoal"
                          title="Copy AWB Number"
                        >
                          <Icon name="copy" className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    )}
                  </div>
                </div>

                <div className="text-right">
                  <p className="text-sm font-bold text-[#2D6A4F]">
                    {tracking.status === 'Delivered'
                      ? 'Delivered'
                      : tracking.status === 'Cancelled'
                        ? 'Order Cancelled'
                        : currentStage >= 3
                          ? "It's on the Way!"
                          : currentStage === 2
                            ? 'Packed & Ready for Courier'
                            : 'Order Confirmed'}
                  </p>
                  <p className="mt-1 text-sm font-bold text-brand-charcoal">
                    Delivery Estimate:{' '}
                    <span className="font-semibold text-brand-muted">
                      {tracking.expectedDelivery || 'Standard (3-5 business days)'}
                    </span>
                  </p>
                </div>
              </div>

              {/* Visual Stepper & Track Button Section */}
              <div className="p-6 border-b border-brand-border/60">
                <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                  {/* Horizontal Stepper Rail */}
                  <div className="flex-1 max-w-3xl">
                    {/* Progress Line and Dots */}
                    <div className="relative flex items-center justify-between">
                      {/* Background Gray Line */}
                      <div className="absolute left-3 right-3 top-2 -translate-y-1/2 h-1 bg-neutral-200" />

                      {/* Active Green Line */}
                      <div
                        className="absolute left-3 top-2 -translate-y-1/2 h-1 bg-[#2D6A4F] transition-all duration-500"
                        style={{
                          width:
                            currentStage >= 4
                              ? 'calc(100% - 1.5rem)'
                              : currentStage === 3
                                ? '66%'
                                : currentStage === 2
                                  ? '33%'
                                  : '0%',
                        }}
                      />

                      {/* Step 1: Order Placed */}
                      <div className="relative z-10 flex flex-col items-center text-center">
                        <span
                          className={cn(
                            'flex h-4 w-4 items-center justify-center rounded-full ring-4 transition',
                            currentStage >= 1
                              ? 'bg-[#2D6A4F] ring-emerald-100'
                              : 'bg-white border-2 border-neutral-300 ring-transparent',
                          )}
                        />
                        <span className="mt-2 text-xs font-bold text-brand-charcoal">Order Placed</span>
                        <span className="text-[11px] font-medium text-brand-muted">
                          {shortDate(tracking.placedAt)}
                        </span>
                      </div>

                      {/* Step 2: Packed & Sealed */}
                      <div className="relative z-10 flex flex-col items-center text-center">
                        <span
                          className={cn(
                            'flex h-4 w-4 items-center justify-center rounded-full ring-4 transition',
                            currentStage >= 2
                              ? 'bg-[#2D6A4F] ring-emerald-100'
                              : 'bg-white border-2 border-neutral-300 ring-transparent',
                          )}
                        />
                        <span
                          className={cn(
                            'mt-2 text-xs font-bold',
                            currentStage >= 2 ? 'text-brand-charcoal' : 'text-neutral-400',
                          )}
                        >
                          Packed & Sealed
                        </span>
                        <span className="text-[11px] font-medium text-brand-muted">
                          {currentStage >= 2
                            ? packedEvent?.timestamp
                              ? shortDate(packedEvent.timestamp)
                              : 'Completed'
                            : currentStage === 1
                              ? 'In Atelier'
                              : 'Pending'}
                        </span>
                      </div>

                      {/* Step 3: In Transit */}
                      <div className="relative z-10 flex flex-col items-center text-center">
                        <span
                          className={cn(
                            'flex h-4 w-4 items-center justify-center rounded-full ring-4 transition',
                            currentStage >= 3
                              ? 'bg-[#2D6A4F] ring-emerald-100'
                              : 'bg-white border-2 border-neutral-300 ring-transparent',
                          )}
                        />
                        <span
                          className={cn(
                            'mt-2 text-xs font-bold',
                            currentStage >= 3 ? 'text-brand-charcoal' : 'text-neutral-400',
                          )}
                        >
                          In Transit
                        </span>
                        <span className="text-[11px] font-medium text-brand-muted">
                          {currentStage >= 3
                            ? tracking.courier || (shippedEvent?.timestamp ? shortDate(shippedEvent.timestamp) : 'On Route')
                            : 'Pending'}
                        </span>
                      </div>

                      {/* Step 4: Est. Delivery */}
                      <div className="relative z-10 flex flex-col items-center text-center">
                        <span
                          className={cn(
                            'flex h-4 w-4 items-center justify-center rounded-full ring-4 transition',
                            currentStage >= 4
                              ? 'bg-[#2D6A4F] ring-emerald-100'
                              : 'bg-white border-2 border-neutral-300 ring-transparent',
                          )}
                        />
                        <span
                          className={cn(
                            'mt-2 text-xs font-bold',
                            currentStage >= 4 ? 'text-brand-charcoal' : 'text-neutral-400',
                          )}
                        >
                          {currentStage >= 4 ? 'Delivered' : 'Est. Delivery'}
                        </span>
                        <span className="text-[11px] font-medium text-brand-muted">
                          {currentStage >= 4
                            ? deliveredEvent?.timestamp
                              ? shortDate(deliveredEvent.timestamp)
                              : 'Delivered'
                            : tracking.expectedDelivery
                              ? shortDate(tracking.expectedDelivery)
                              : 'Standard (3-5 days)'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Right Side: Track Package Button */}
                  <div className="shrink-0 flex items-center justify-end">
                    {getCourierTrackingUrl(tracking.courier, tracking.awb) ? (
                      <a
                        href={getCourierTrackingUrl(tracking.courier, tracking.awb)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 rounded bg-[#18538A] px-6 py-2.5 text-xs font-bold uppercase tracking-wider text-white shadow-sm transition hover:bg-[#12416E]"
                      >
                        <Icon name="truck" className="h-4 w-4" />
                        Track with {tracking.courier || 'Courier'}
                      </a>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setShowScanHistory(!showScanHistory)}
                        className="inline-flex items-center gap-2 rounded bg-[#18538A] px-6 py-2.5 text-xs font-bold uppercase tracking-wider text-white shadow-sm transition hover:bg-[#12416E]"
                      >
                        <Icon name="scan" className="h-4 w-4" />
                        {showScanHistory ? 'Hide Checkpoints' : 'View Checkpoints'}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Package Products Table (B&H Style) */}
              <div className="p-6">
                {tracking.verified && tracking.items?.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-brand-border/60 text-[11px] font-bold uppercase tracking-wider text-brand-muted">
                        <th className="pb-3 font-semibold">Product</th>
                        <th className="pb-3 text-center font-semibold">Status</th>
                        <th className="pb-3 text-center font-semibold">Qty</th>
                        <th className="pb-3 text-right font-semibold">Unit Price</th>
                        <th className="pb-3 text-right font-semibold">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-brand-border/50">
                      {tracking.items.map((item) => (
                        <tr key={item.id} className="group">
                          {/* Thumbnail & Title */}
                          <td className="py-4 pr-4">
                            <div className="flex items-center gap-3.5">
                              <Link
                                to={`/product/${item.slug}`}
                                className="h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-brand-border/60 bg-[#F9F9F9] p-1"
                              >
                                <FlaconStage
                                  tier="Inspired"
                                  seed={item.slug}
                                  label={item.name}
                                  image={productImage(item)}
                                  compact
                                />
                              </Link>
                              <div className="min-w-0">
                                <Link
                                  to={`/product/${item.slug}`}
                                  className="block font-semibold text-brand-charcoal hover:text-brand-goldDark text-sm"
                                >
                                  {item.name}
                                </Link>
                                <p className="mt-0.5 text-brand-muted">
                                  {item.volume} · Artisanal Extrait
                                </p>
                                {item.meta && (
                                  <p className="text-[11px] text-brand-muted">{item.meta}</p>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* Status */}
                          <td className="py-4 px-2 text-center">
                            <span
                              className={cn(
                                'font-bold',
                                tracking.status === 'Cancelled'
                                  ? 'text-rose-700'
                                  : tracking.status === 'Delivered'
                                    ? 'text-emerald-700'
                                    : 'text-[#2D6A4F]',
                              )}
                            >
                              {formatOrderStatus(tracking.status)}
                            </span>
                          </td>

                          {/* Qty */}
                          <td className="py-4 px-2 text-center font-semibold font-mono text-brand-charcoal">
                            {item.qty}
                          </td>

                          {/* Unit Price */}
                          <td className="py-4 pl-2 text-right font-semibold font-mono text-brand-charcoal">
                            {formatPrice(item.price)}
                          </td>

                          {/* Actions: Buy Again & Write a Review */}
                          <td className="py-4 pl-4 text-right">
                            <div className="inline-flex flex-col gap-1.5 sm:flex-row sm:items-center">
                              <button
                                type="button"
                                onClick={() => handleBuyAgain(item)}
                                className="inline-flex items-center justify-center rounded bg-[#18538A] px-3 py-1.5 text-[11px] font-bold text-white transition hover:bg-[#12416E]"
                              >
                                Buy Again
                              </button>
                              <Link
                                to={`/product/${item.slug}`}
                                className="inline-flex items-center justify-center rounded border border-brand-border bg-white px-3 py-1.5 text-[11px] font-semibold text-brand-charcoal transition hover:bg-neutral-50"
                              >
                                Write a Review
                              </Link>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-brand-border bg-neutral-50/50 p-6 text-center">
                    <Icon name="lock" className="mx-auto h-5 w-5 text-brand-goldDark" />
                    <p className="mt-2 text-xs font-semibold text-brand-charcoal">Fragrance Items Protected</p>
                    <p className="mt-1 text-[11px] text-brand-muted">
                      Verify the mobile number linked with this order above to view products and access invoice.
                    </p>
                  </div>
                )}

                {/* Free Inclusions Banner if any */}
                {tracking.inclusions?.length > 0 && (
                  <div className="mt-5 rounded border border-brand-gold/40 bg-[#FFFDF9] p-4 text-xs">
                    <p className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-brand-goldDark">
                      <Icon name="gift" className="h-4 w-4" />
                      Complimentary Inclusions In This Order
                    </p>
                    <ul className="mt-2 space-y-1 text-brand-charcoal">
                      {tracking.inclusions.map((line) => (
                        <li key={line} className="flex items-center gap-2">
                          <Icon name="check" className="h-3.5 w-3.5 text-brand-goldDark" strokeWidth={2.5} />
                          {line}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>

              {/* Checkpoint / Scan History Section (Collapsible or visible) */}
              <div className="border-t border-brand-border/60 bg-[#FAFAFA] p-6">
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setShowScanHistory(!showScanHistory)}
                    className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-brand-charcoal hover:text-brand-goldDark"
                  >
                    <Icon name="scan" className="h-4 w-4 text-brand-goldDark" />
                    <span>Scan History & Live Checkpoints</span>
                    <Icon
                      name={showScanHistory ? 'chevron-up' : 'chevron-down'}
                      className="h-3.5 w-3.5 text-brand-muted"
                    />
                  </button>

                  <div className="flex items-center gap-2 text-xs text-brand-muted">
                    <Icon name="shield" className="h-3.5 w-3.5 text-emerald-700" />
                    <span>{tracking.sealNote || 'Authentic Sealed Raheman Perfumes Fragrance'}</span>
                  </div>
                </div>

                {showScanHistory && (
                  <div className="mt-4 pt-4 border-t border-brand-border/40">
                    {tracking.checkpoints?.length > 0 ? (
                      <ol className="relative space-y-4 border-l border-brand-border pl-5">
                        {tracking.checkpoints.map((cp, idx) => (
                          <li key={cp.id || idx} className="relative">
                            <span
                              className={cn(
                                'absolute -left-[1.62rem] top-1.5 h-2.5 w-2.5 rounded-full border-2',
                                idx === 0
                                  ? 'border-[#2D6A4F] bg-[#2D6A4F]'
                                  : 'border-neutral-300 bg-white',
                              )}
                            />
                            <p className="text-xs font-bold text-brand-charcoal">{cp.title}</p>
                            <p className="text-xs text-brand-muted">{cp.description}</p>
                            <p className="text-[11px] text-brand-muted/80">{cp.timestamp}</p>
                          </li>
                        ))}
                      </ol>
                    ) : (
                      <p className="text-xs text-brand-muted">
                        {tracking.status === 'Delivered'
                          ? 'Package has been delivered to your destination.'
                          : currentStage >= 3
                            ? `Your parcel is in transit${tracking.courier ? ` with ${tracking.courier}` : ''}. Live hub scans will update as it progresses through transit hubs.`
                            : currentStage === 2
                              ? 'Your order has been hand-packed and sealed with tamper-evident packaging at the atelier. Awaiting courier pickup.'
                              : currentStage === 0
                                ? 'This order has been cancelled.'
                                : 'Your order has been confirmed and payment verified. Our team is compounding and preparing your fragrance for packing.'}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Quick Support Notice */}
            <div className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-brand-border/70 bg-[#F6F6F6] p-4 text-xs text-brand-muted">
              <p>
                Need assistance with your package or delivery address?{' '}
                <a
                  href="https://wa.me/917504468885"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-brand-charcoal underline"
                >
                  Chat with Concierge on WhatsApp
                </a>
              </p>
              <Link
                to="/account?tab=orders"
                className="font-semibold text-brand-charcoal hover:underline"
              >
                ← Back to All Orders
              </Link>
            </div>
          </div>
        )}

        {/* ──────────────── RECENT ORDERS SHORTCUTS (When not tracking a specific order) ──────────────── */}
        {!searched && orders.length > 0 && (
          <div className="mt-12 max-w-2xl mx-auto">
            <p className="text-xs font-bold uppercase tracking-wider text-brand-muted">
              Your Recent Orders
            </p>
            <ul className="mt-3 divide-y divide-brand-border rounded-xl border border-brand-border bg-white shadow-sm">
              {orders.slice(0, 4).map((order) => (
                <li key={order.id} className="flex flex-wrap items-center justify-between gap-3 p-4 text-xs">
                  <div>
                    <p className="font-bold text-brand-charcoal">{order.id}</p>
                    <p className="text-brand-muted">
                      {formatDate(order.date)} · {order.items?.length || 1} item(s) · {formatPrice(order.total)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        'rounded-full border px-2.5 py-0.5 text-[11px] font-bold uppercase',
                        ORDER_STATUS[order.status] ?? 'border-brand-border text-brand-muted',
                      )}
                    >
                      {order.status}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="border border-brand-border"
                      onClick={() => {
                        setQuery(order.id)
                        setSearched(true)
                        navigate(`/track-order?order=${order.id}`)
                      }}
                    >
                      Track
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* ──────────────── EXCLUSIVE PRINT-ONLY TAX INVOICE (ONLY WHEN MODAL CLOSED) ──────────────── */}
      {tracking && !showInvoiceModal && (
        <div className="hidden print:block">
          <TaxInvoice tracking={tracking} />
        </div>
      )}

      {/* ──────────────── INTERACTIVE TAX INVOICE PREVIEW MODAL ──────────────── */}
      {tracking && showInvoiceModal && (
        <TaxInvoiceModal
          tracking={tracking}
          open={showInvoiceModal}
          onClose={() => setShowInvoiceModal(false)}
        />
      )}
    </>
  )
}

export default OrderTrackingPage
