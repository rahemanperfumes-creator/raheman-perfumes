import { useEffect, useMemo, useRef, useState } from 'react'
import { NAV_TRANSITION, Link, Navigate, useLocation, useNavigate } from '@/components/ui/AppLink'
import cn from '@/lib/cn'
import { formatPrice, GIFT_WRAP_FEE } from '@/lib/format'
import useCartStore, { groupCartItems } from '@/store/cartStore'
import { useCatalogueStore, useShowcase } from '@/store/catalogueStore'
import useAuthStore from '@/store/authStore'
import { authService } from '@/services/authService'
import { toast } from '@/store/uiStore'
import { Icon } from '@/components/ui/Icon'
import { Input, Checkbox } from '@/components/ui/Form'
import { AddressFields, districtsMatch } from '@/components/ui/AddressFields'
import { pincodeDetails } from '@/services/postalApi'
import { EmptyState, Skeleton } from '@/components/ui/Feedback'
import { FlaconStage } from '@/components/product/FlaconArt'
import { productImage } from '@/data/productImages'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { SHIPPING_METHODS, PAYMENT_METHODS } from '@/data/content'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_PATTERN = /^[+]?[\d\s-]{10,15}$/
const PINCODE_PATTERN = /^\d{6}$/

const PAYMENT_ICON = {
  razorpay: 'shield',
  cod: 'truck',
}

/** Dynamic loader for the official Razorpay Checkout SDK script */
function loadRazorpayScript() {
  return new Promise((resolve) => {
    if (window.Razorpay) {
      resolve(true)
      return
    }
    const script = document.createElement('script')
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.async = true
    script.onload = () => resolve(true)
    script.onerror = () => resolve(false)
    document.body.appendChild(script)
  })
}

/** Framed icon input field card matching the clean two-column customer info style. */
function CheckoutFieldCard({ icon, label, value, onChange, error, type = 'text', required = false, placeholder = '' }) {
  return (
    <div>
      <div
        className={cn(
          'flex items-center gap-3 rounded-xl border bg-white px-3.5 py-2.5 transition',
          error
            ? 'border-error ring-1 ring-error'
            : 'border-brand-border focus-within:border-brand-charcoal focus-within:ring-1 focus-within:ring-brand-charcoal',
        )}
      >
        {icon && <Icon name={icon} className="h-4 w-4 shrink-0 text-brand-muted" />}
        <div className="min-w-0 flex-1">
          <label className="block text-[11px] font-medium text-brand-muted">
            {label}
            {required && <span className="ml-0.5 text-error">*</span>}
          </label>
          <input
            type={type}
            value={value}
            onChange={onChange}
            placeholder={placeholder}
            className="w-full bg-transparent text-sm font-medium text-brand-charcoal outline-none placeholder:font-normal placeholder:text-brand-muted/60"
          />
        </div>
      </div>
      {error && <p className="mt-1 text-xs text-error">{error}</p>}
    </div>
  )
}

/** Inline mini quantity pill (- 1 +) inside Current Order item cards. */
function MiniQtyStepper({ count, onIncrement, onDecrement, itemLabel }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-lg bg-[#F5F5F5] px-1.5 py-1">
      <button
        type="button"
        onClick={onDecrement}
        disabled={count <= 1}
        aria-label={`Decrease quantity of ${itemLabel}`}
        className="flex h-5 w-5 items-center justify-center rounded text-brand-charcoal transition hover:bg-white disabled:opacity-30 disabled:hover:bg-transparent"
      >
        <Icon name="minus" className="h-3 w-3" strokeWidth={2.2} />
      </button>
      <span className="min-w-[1.1rem] text-center text-xs font-semibold tabular-nums text-brand-charcoal">
        {count}
      </span>
      <button
        type="button"
        onClick={onIncrement}
        aria-label={`Increase quantity of ${itemLabel}`}
        className="flex h-5 w-5 items-center justify-center rounded text-brand-charcoal transition hover:bg-white"
      >
        <Icon name="plus" className="h-3 w-3" strokeWidth={2.2} />
      </button>
    </div>
  )
}

export function CheckoutPage() {
  useDocumentTitle('Secure Checkout')

  const navigate = useNavigate()
  const location = useLocation()
  const items = useCartStore((state) => state.items)
  const summary = useCartStore((state) => state.summary())
  const increment = useCartStore((state) => state.increment)
  const decrement = useCartStore((state) => state.decrement)
  const giftWrap = useCartStore((state) => state.giftWrap)
  const setGiftWrap = useCartStore((state) => state.setGiftWrap)
  const clearCart = useCartStore((state) => state.clearCart)
  const syncPricing = useCartStore((state) => state.syncPricing)
  const couponCode = useCartStore((state) => state.couponCode)
  const showcase = useShowcase()
  const refreshShowcase = useCatalogueStore((state) => state.refreshShowcase)

  // Step state: 2 = Address & Contact, 3 = Payment Method & Confirmation (Step 1 is Cart)
  const [step, setStep] = useState(2)
  const [showMobileOrderSummary, setShowMobileOrderSummary] = useState(false)

  useEffect(() => {
    syncPricing()
    refreshShowcase({ force: true })
    const onVisible = () => {
      if (document.visibilityState === 'visible') refreshShowcase({ force: true })
    }
    window.addEventListener('focus', onVisible)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('focus', onVisible)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [syncPricing, refreshShowcase])

  const addOrder = useAuthStore((state) => state.addOrder)
  const user = useAuthStore((state) => state.user)
  const status = useAuthStore((state) => state.status)
  const addresses = useAuthStore((state) => state.addresses)

  const defaultAddress = addresses.find((address) => address.id === user?.defaultAddressId) ?? addresses[0]

  const [contact, setContact] = useState({
    email: user?.email ?? '',
    phone: user?.phone ?? '',
    firstName: user?.firstName ?? '',
    lastName: user?.name?.split(' ').slice(1).join(' ') ?? '',
  })
  const [shipping, setShipping] = useState({
    line1: defaultAddress?.line1 ?? '',
    line2: defaultAddress?.line2 ?? '',
    area: defaultAddress?.area ?? '',
    city: defaultAddress?.city ?? '',
    district: defaultAddress?.district ?? '',
    state: defaultAddress?.state ?? 'Maharashtra',
    pincode: defaultAddress?.pincode ?? '',
  })
  const [shippingMethod, setShippingMethod] = useState(SHIPPING_METHODS[0]?.id ?? 'standard')
  const [paymentMethod, setPaymentMethod] = useState(PAYMENT_METHODS[0]?.id ?? 'razorpay')
  const [sameAsBilling, setSameAsBilling] = useState(true)
  const [notes, setNotes] = useState('')
  const [errors, setErrors] = useState({})
  const [placing, setPlacing] = useState(false)
  const [addressEditing, setAddressEditing] = useState(
    () =>
      !(
        defaultAddress?.line1 &&
        defaultAddress?.city &&
        defaultAddress?.district &&
        defaultAddress?.state &&
        PINCODE_PATTERN.test(defaultAddress?.pincode ?? '')
      ),
  )

  const placingRef = useRef(false)
  const orderKeyRef = useRef({ signature: '', key: '' })

  const availablePayments = useMemo(
    () => PAYMENT_METHODS.filter((method) => showcase.codEnabled || method.id !== 'cod'),
    [showcase.codEnabled],
  )

  useEffect(() => {
    if (!showcase.codEnabled && paymentMethod === 'cod') {
      setPaymentMethod(availablePayments[0]?.id ?? 'razorpay')
    }
  }, [showcase.codEnabled, paymentMethod, availablePayments])

  const entries = useMemo(
    () => groupCartItems(items),
    [items],
  )

  const expressShipping = SHIPPING_METHODS.find((method) => method.id === shippingMethod)
  const shippingFee = expressShipping?.price ?? 0
  const totalDelivery = summary.shipping + shippingFee
  const codFee = availablePayments.find((method) => method.id === paymentMethod)?.fee ?? 0
  const payable = summary.payable + shippingFee + codFee

  const hasValidAddress =
    Boolean(shipping.line1.trim()) &&
    Boolean(shipping.city.trim()) &&
    Boolean(shipping.district.trim()) &&
    Boolean(shipping.state.trim()) &&
    PINCODE_PATTERN.test(shipping.pincode)

  const formattedAddress = [
    shipping.line1,
    shipping.line2,
    shipping.area,
    shipping.city,
    shipping.district,
    shipping.state ? `${shipping.state}${shipping.pincode ? ` - ${shipping.pincode}` : ''}` : shipping.pincode,
  ]
    .filter(Boolean)
    .join(', ')

  if (items.length === 0) {
    return (
      <div className="shell py-16">
        <EmptyState
          icon="bag"
          title="Nothing to check out"
          description="Your bag is empty. Add a fragrance first, then come back to complete your order."
          actionLabel="Browse Fragrances"
          actionTo="/shop"
        />
      </div>
    )
  }

  if (!user) {
    if (status === 'idle' || status === 'restoring') {
      return (
        <div className="shell py-16">
          <div className="mx-auto max-w-md space-y-4">
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-40 w-full" />
          </div>
        </div>
      )
    }

    const next = `${location.pathname}${location.search}`
    return <Navigate to={`/sign-in?next=${encodeURIComponent(next)}&reason=checkout`} replace />
  }

  const applySavedAddress = (address) => {
    setShipping({
      line1: address.line1 ?? '',
      line2: address.line2 ?? '',
      area: address.area ?? '',
      city: address.city ?? '',
      district: address.district ?? '',
      state: address.state ?? 'Maharashtra',
      pincode: address.pincode ?? '',
    })
    setErrors((prev) => ({ ...prev, line1: undefined, city: undefined, district: undefined, state: undefined, pincode: undefined }))
    setAddressEditing(false)
  }

  const validateAddress = async () => {
    const next = {}
    if (!EMAIL_PATTERN.test(contact.email)) next.email = 'Enter a valid email address.'
    if (!PHONE_PATTERN.test(contact.phone)) next.phone = 'Enter a valid 10-digit mobile number.'
    if (!contact.firstName.trim()) next.firstName = 'Required.'
    if (!shipping.line1.trim()) next.line1 = 'Required.'
    if (!shipping.city.trim()) next.city = 'Required.'
    if (!shipping.district.trim()) next.district = 'Required.'
    if (!shipping.state.trim()) next.state = 'Required.'
    if (!PINCODE_PATTERN.test(shipping.pincode)) next.pincode = 'Enter a 6-digit PIN code.'
    setErrors(next)

    if (next.line1 || next.city || next.district || next.state || next.pincode) {
      setAddressEditing(true)
    }

    if (Object.keys(next).length > 0) {
      toast({ title: 'Check your details', description: 'Some required fields need attention.', tone: 'error' })
      return false
    }

    if (PINCODE_PATTERN.test(shipping.pincode)) {
      try {
        const pinDetails = await pincodeDetails(shipping.pincode)
        if (pinDetails?.district && !districtsMatch(shipping.district, pinDetails.district)) {
          setErrors((prev) => ({
            ...prev,
            pincode: `PIN code ${shipping.pincode} belongs to ${pinDetails.district}, not ${shipping.district}.`,
          }))
          setAddressEditing(true)
          toast({
            title: 'Location mismatch',
            description: `PIN code ${shipping.pincode} belongs to ${pinDetails.district}. Please match the district before proceeding.`,
            tone: 'error',
          })
          return false
        }
      } catch {
        // If postal lookup fails, allow progression
      }
    }

    return true
  }

  const handleProceedToPayment = async () => {
    const valid = await validateAddress()
    if (valid) {
      setStep(3)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  const placeOrder = async (event) => {
    if (event?.preventDefault) event.preventDefault()
    if (placingRef.current) return

    const valid = await validateAddress()
    if (!valid) {
      setStep(2)
      return
    }

    const draft = {
      items: items.map((item) => ({
        slug: item.slug,
        productId: item.productId,
        size: item.volume,
        qty: item.quantity,
        isLoyaltyReward: Boolean(item.isLoyaltyReward),
      })),
      address: {
        name: `${contact.firstName} ${contact.lastName}`.trim(),
        phone: contact.phone,
        line1: shipping.line1,
        line2: shipping.line2,
        area: shipping.area,
        city: shipping.city,
        district: shipping.district,
        state: shipping.state,
        pincode: shipping.pincode,
      },
      couponCode: couponCode ?? undefined,
      notes,
    }

    // ──────────────── CASH ON DELIVERY FLOW ────────────────
    if (paymentMethod === 'cod') {
      placingRef.current = true
      setPlacing(true)

      const token =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

      let result
      try {
        result = await authService.placeOrder(
          { ...draft, payment: { method: 'cod' } },
          { idempotencyKey: `ord-cod-${token}` },
        )
      } catch (error) {
        placingRef.current = false
        setPlacing(false)
        if (error.status === 401) {
          toast({
            title: 'Please sign in',
            description: 'An order needs an account so you can follow it. Your bag is safe.',
            tone: 'error',
          })
          navigate('/sign-in?next=/checkout', NAV_TRANSITION)
          return
        }
        toast({ title: 'Order not placed', description: error.message, tone: 'error' })
        return
      }

      const order = result.data?.order
      if (!order?.id) {
        placingRef.current = false
        setPlacing(false)
        toast({ title: 'Order not placed', description: 'No confirmation received.', tone: 'error' })
        return
      }

      placingRef.current = false
      setPlacing(false)
      addOrder(order)
      clearCart()
      useAuthStore.getState().restore().catch(() => {})
      toast({
        title: `Order ${order.id} placed`,
        description: 'Cash on Delivery order confirmed. Details sent to your email.',
      })
      navigate(`/track-order?order=${order.id}`, NAV_TRANSITION)
      return
    }

    // ──────────────── REAL RAZORPAY PAYMENT FLOW ────────────────
    // Orders will NEVER be placed without verified approval from Razorpay!
    placingRef.current = true
    setPlacing(true)

    let rzpResult
    try {
      rzpResult = await authService.createRazorpayOrder({
        items: draft.items,
        couponCode: draft.couponCode,
        giftWrap,
      })
    } catch (err) {
      placingRef.current = false
      setPlacing(false)
      toast({
        title: 'Payment Gateway Not Ready',
        description: err.message || 'Razorpay payment could not be initiated. Please ensure keys are configured.',
        tone: 'error',
      })
      return
    }

    // api.mutate wraps the response as { live, data }, unwrap it
    const rzpData = rzpResult?.data ?? rzpResult

    const scriptLoaded = await loadRazorpayScript()
    if (!scriptLoaded) {
      placingRef.current = false
      setPlacing(false)
      toast({
        title: 'Network Error',
        description: 'Could not load Razorpay payment window. Please check your internet connection.',
        tone: 'error',
      })
      return
    }

    const options = {
      key: rzpData.keyId,
      amount: rzpData.amount,
      currency: rzpData.currency || 'INR',
      name: 'Raheman Perfumes',
      description: 'Luxury Fragrance Order',
      image: '/logo-gold-transparent.png',
      order_id: rzpData.orderId,
      prefill: {
        name: `${contact.firstName} ${contact.lastName}`.trim(),
        email: contact.email,
        contact: contact.phone,
      },
      notes: {
        address: formattedAddress,
      },
      theme: {
        color: '#1A1613',
      },
      modal: {
        ondismiss: () => {
          placingRef.current = false
          setPlacing(false)
          toast({
            title: 'Payment Incomplete',
            description: 'You closed the payment window. The order was not placed and your bag is saved.',
            tone: 'error',
          })
        },
      },
      handler: async function (response) {
        // Payment approved by Razorpay! Now submit to backend with cryptographic credentials for HMAC verification
        const verifiedDraft = {
          ...draft,
          payment: {
            method: 'razorpay',
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_order_id: response.razorpay_order_id,
            razorpay_signature: response.razorpay_signature,
          },
        }

        let result
        try {
          result = await authService.placeOrder(verifiedDraft, {
            idempotencyKey: `ord-${response.razorpay_payment_id}`,
          })
        } catch (error) {
          placingRef.current = false
          setPlacing(false)
          toast({
            title: 'Order verification failed',
            description: error.message || 'Payment received but order verification failed. Please contact support.',
            tone: 'error',
          })
          return
        }

        const order = result.data?.order
        if (!order?.id) {
          placingRef.current = false
          setPlacing(false)
          toast({
            title: 'Order not placed',
            description: 'The confirmation came back without an order number.',
            tone: 'error',
          })
          return
        }

        placingRef.current = false
        setPlacing(false)
        addOrder(order)
        clearCart()
        useAuthStore.getState().restore().catch(() => {})
        toast({
          title: `Order ${order.id} Confirmed`,
          description: 'Payment approved! Your order confirmation email is on its way.',
        })
        navigate(`/track-order?order=${order.id}`, NAV_TRANSITION)
      },
    }

    const rzpInstance = new window.Razorpay(options)
    rzpInstance.on('payment.failed', function (resp) {
      placingRef.current = false
      setPlacing(false)
      toast({
        title: 'Payment Failed',
        description: resp.error?.description || 'Your payment was declined by the bank or UPI.',
        tone: 'error',
      })
    })
    rzpInstance.open()
  }

  return (
    <div className="shell pb-24 pt-4 sm:pt-6 lg:pb-12 lg:pt-8">
      {/* ─────────── FLIPKART-STYLE 3-STEP PROGRESS STEPPER ─────────── */}
      <div className="mx-auto max-w-xl pb-5">
        <div className="relative flex items-center justify-between">
          {/* Connecting line: Step 1 -> Step 2 */}
          <div className="absolute left-[16%] right-[50%] top-4 -z-0 h-[2.5px] -translate-y-1/2 bg-emerald-500" />
          {/* Connecting line: Step 2 -> Step 3 */}
          <div
            className={cn(
              'absolute left-[50%] right-[16%] top-4 -z-0 h-[2.5px] -translate-y-1/2 transition-colors duration-300',
              step === 3 ? 'bg-emerald-500' : 'bg-neutral-200',
            )}
          />

          {/* Step 1: Cart (Completed) */}
          <Link
            to="/cart"
            title="Return to shopping cart"
            className="group relative z-10 flex flex-col items-center gap-1 focus:outline-none"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-600 text-white shadow-xs transition group-hover:scale-105">
              <Icon name="check" className="h-4 w-4" strokeWidth={2.8} />
            </div>
            <span className="text-xs font-semibold text-emerald-700">Cart</span>
          </Link>

          {/* Step 2: Address */}
          <button
            type="button"
            onClick={() => {
              if (step > 2) setStep(2)
            }}
            className={cn(
              'group relative z-10 flex flex-col items-center gap-1 focus:outline-none',
              step > 2 ? 'cursor-pointer' : 'cursor-default',
            )}
          >
            <div
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-all shadow-xs',
                step > 2
                  ? 'bg-emerald-600 text-white'
                  : 'bg-brand-charcoal text-white ring-4 ring-brand-charcoal/15',
              )}
            >
              {step > 2 ? <Icon name="check" className="h-4 w-4" strokeWidth={2.8} /> : '2'}
            </div>
            <span
              className={cn(
                'text-xs font-semibold transition-colors',
                step > 2 ? 'text-emerald-700' : 'text-brand-charcoal',
              )}
            >
              Address
            </span>
          </button>

          {/* Step 3: Payment */}
          <div className="group relative z-10 flex flex-col items-center gap-1">
            <div
              className={cn(
                'flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-all shadow-xs',
                step === 3
                  ? 'bg-brand-charcoal text-white ring-4 ring-brand-charcoal/15'
                  : 'bg-neutral-200 text-neutral-500',
              )}
            >
              3
            </div>
            <span
              className={cn(
                'text-xs font-semibold transition-colors',
                step === 3 ? 'text-brand-charcoal' : 'text-neutral-400',
              )}
            >
              Payment
            </span>
          </div>
        </div>
      </div>

      {/* ─────────── MOBILE COMPACT ACCORDION FOR ORDER SUMMARY ─────────── */}
      <div className="mb-4 rounded-xl border border-brand-border bg-[#F9F7F3] p-3 lg:hidden">
        <button
          type="button"
          onClick={() => setShowMobileOrderSummary((prev) => !prev)}
          className="flex w-full items-center justify-between text-left text-xs font-medium text-brand-charcoal"
        >
          <div className="flex items-center gap-2">
            <Icon name="bag" className="h-4 w-4 text-brand-goldDark" />
            <span>
              {summary.itemCount} {summary.itemCount === 1 ? 'fragrance' : 'fragrances'} in bag
            </span>
            <span className="font-bold text-brand-charcoal">· {formatPrice(payable)}</span>
          </div>
          <div className="flex items-center gap-1 text-[11px] font-semibold text-brand-goldDark">
            <span>{showMobileOrderSummary ? 'Hide Items' : 'View Items'}</span>
            <Icon
              name="chevron-down"
              className={cn('h-3.5 w-3.5 transition-transform duration-200', showMobileOrderSummary && 'rotate-180')}
            />
          </div>
        </button>

        {showMobileOrderSummary && (
          <div className="mt-3 border-t border-brand-border/70 pt-3">
            <ul className="space-y-2">
              {entries.map(({ item }) => (
                <li key={item.id} className="flex items-center justify-between gap-2.5 text-xs">
                  <div className="flex min-w-0 items-center gap-2">
                    <div className="h-8 w-8 shrink-0 overflow-hidden rounded bg-white p-0.5 border border-brand-border/60">
                      <FlaconStage tier={item.tier} seed={item.slug} label={item.name} image={productImage(item)} compact />
                    </div>
                    <span className="truncate font-medium text-brand-charcoal">{item.name}</span>
                    <span className="text-brand-muted">({item.volume} × {item.quantity})</span>
                  </div>
                  <span className="shrink-0 font-semibold tabular-nums text-brand-charcoal">
                    {formatPrice(item.price * item.quantity)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-2.5 flex items-center justify-between border-t border-brand-border/60 pt-2 text-[11px] text-brand-muted">
              <span>Standard Delivery: {totalDelivery === 0 ? 'Free' : formatPrice(totalDelivery)}</span>
              <Link to="/cart" className="font-semibold text-brand-goldDark underline">
                Edit Bag
              </Link>
            </div>
          </div>
        )}
      </div>

      <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_25rem] xl:grid-cols-[minmax(0,1fr)_27rem] lg:gap-10">
        {/* ─────────── LEFT COLUMN: STEP-BY-STEP FLOW ─────────── */}
        <div className="min-w-0">
          {/* ═══════════════ STEP 2: ADDRESS & CONTACT ═══════════════ */}
          {step === 2 && (
            <section className="space-y-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-brand-border pb-3">
                <div>
                  <h1 className="text-lg font-bold text-brand-charcoal sm:text-xl">Delivery Address & Contact</h1>
                  <p className="mt-0.5 text-xs text-brand-muted">
                    Enter where we should deliver your fragrance parcel safely.
                  </p>
                </div>
                {addresses.length > 0 && addressEditing && (
                  <button
                    type="button"
                    onClick={() => applySavedAddress(addresses[0])}
                    className="text-xs font-semibold text-brand-goldDark hover:underline"
                  >
                    Use Saved Address
                  </button>
                )}
              </div>

              {/* Customer Contact Cards */}
              <div className="grid gap-3 sm:grid-cols-2">
                <CheckoutFieldCard
                  icon="user"
                  label="First Name"
                  required
                  value={contact.firstName}
                  error={errors.firstName}
                  placeholder="Enter first name"
                  onChange={(event) => setContact({ ...contact, firstName: event.target.value })}
                />
                <CheckoutFieldCard
                  icon="user"
                  label="Last Name"
                  value={contact.lastName}
                  placeholder="Enter last name"
                  onChange={(event) => setContact({ ...contact, lastName: event.target.value })}
                />
                <CheckoutFieldCard
                  icon="mail"
                  label="Email"
                  type="email"
                  required
                  value={contact.email}
                  error={errors.email}
                  placeholder="you@example.com"
                  onChange={(event) => setContact({ ...contact, email: event.target.value })}
                />
                <CheckoutFieldCard
                  icon="phone"
                  label="Mobile Number"
                  type="tel"
                  required
                  value={contact.phone}
                  error={errors.phone}
                  placeholder="10-digit mobile number"
                  onChange={(event) => setContact({ ...contact, phone: event.target.value })}
                />
              </div>

              {/* Address Form or Saved Address Card */}
              <div className="rounded-xl border border-brand-border bg-white p-4 transition focus-within:border-brand-charcoal">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 text-brand-muted">
                    <Icon name="map-pin" className="h-4 w-4 shrink-0" />
                    <span className="text-xs font-medium text-brand-muted">Address Details</span>
                  </div>
                  <div className="flex items-center gap-3">
                    {addresses.length > 0 && !addressEditing && (
                      <Link to="/account" className="text-xs font-medium text-brand-goldDark hover:underline">
                        Manage Saved
                      </Link>
                    )}
                    <button
                      type="button"
                      onClick={() => setAddressEditing((open) => !open)}
                      aria-label={addressEditing ? 'Collapse delivery address form' : 'Edit delivery address'}
                      title={addressEditing ? 'Done editing' : 'Edit delivery address'}
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-brand-muted transition hover:bg-neutral-100 hover:text-brand-charcoal"
                    >
                      <Icon name={addressEditing ? 'check' : 'edit'} className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {!addressEditing && hasValidAddress ? (
                  <div className="mt-2 pl-6 text-sm leading-relaxed text-brand-charcoal">
                    <p className="font-medium">{formattedAddress}</p>
                    {notes && <p className="mt-1 text-xs text-brand-muted">Note: {notes}</p>}
                  </div>
                ) : (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <Input
                      containerClassName="sm:col-span-2"
                      label="Address line 1"
                      required
                      value={shipping.line1}
                      error={errors.line1}
                      onChange={(event) => setShipping({ ...shipping, line1: event.target.value })}
                      placeholder="House / Flat no., Building, Street"
                    />
                    <Input
                      containerClassName="sm:col-span-2"
                      label="Address line 2"
                      value={shipping.line2}
                      onChange={(event) => setShipping({ ...shipping, line2: event.target.value })}
                      placeholder="Apartment, Suite, Floor (optional)"
                    />
                    <AddressFields
                      value={shipping}
                      onChange={(patch) => setShipping((current) => ({ ...current, ...patch }))}
                      errors={errors}
                    />
                    <Input
                      label="Delivery notes (optional)"
                      value={notes}
                      onChange={(event) => setNotes(event.target.value.slice(0, 200))}
                      placeholder="Instructions for courier (optional)"
                    />
                    <div className="flex flex-wrap items-center justify-between gap-3 pt-1 sm:col-span-2">
                      <Checkbox
                        checked={sameAsBilling}
                        onChange={(event) => setSameAsBilling(event.target.checked)}
                        label="Billing address same as delivery"
                      />
                      {hasValidAddress && (
                        <button
                          type="button"
                          onClick={() => setAddressEditing(false)}
                          className="rounded-lg bg-brand-charcoal px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-goldDark"
                        >
                          Save Address
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Delivery Speed Options */}
              <div className="grid gap-2.5 sm:grid-cols-2">
                {SHIPPING_METHODS.map((method) => {
                  const selected = shippingMethod === method.id
                  const methodCost = method.id === 'standard' ? summary.shipping : summary.shipping + (method.price ?? 0)
                  return (
                    <label
                      key={method.id}
                      className={cn(
                        'flex cursor-pointer items-center justify-between gap-3 rounded-xl border px-3.5 py-3 transition',
                        selected
                          ? 'border-2 border-brand-charcoal bg-white shadow-xs'
                          : 'border-brand-border bg-white hover:border-brand-charcoal/40',
                      )}
                    >
                      <input
                        type="radio"
                        name="shipping"
                        value={method.id}
                        checked={selected}
                        onChange={() => setShippingMethod(method.id)}
                        className="sr-only"
                      />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-brand-charcoal">{method.name}</p>
                        <p className="mt-0.5 text-[11px] text-brand-muted">
                          {method.eta} · {methodCost === 0 ? 'Complimentary' : formatPrice(methodCost)}
                        </p>
                      </div>
                      <span
                        className={cn(
                          'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
                          selected ? 'border-brand-charcoal' : 'border-brand-muted/50',
                        )}
                      >
                        {selected && <span className="h-2 w-2 rounded-full bg-brand-charcoal" />}
                      </span>
                    </label>
                  )
                })}
              </div>

              {/* Primary "Continue to Payment" Button */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleProceedToPayment}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-charcoal px-6 py-3.5 text-sm font-semibold text-white shadow-md transition hover:bg-brand-goldDark"
                >
                  <span>Deliver Here & Continue To Payment</span>
                  <Icon name="arrow-right" className="h-4 w-4" />
                </button>
              </div>
            </section>
          )}

          {/* ═══════════════ STEP 3: PAYMENT METHOD (WITH COLLAPSED ADDRESS CARD) ═══════════════ */}
          {step === 3 && (
            <section className="space-y-4">
              {/* FLIPKART-STYLE COLLAPSED DELIVERY ADDRESS CARD */}
              <div className="rounded-2xl border border-brand-border bg-white p-4 shadow-xs sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-brand-charcoal">
                      <Icon name="user" className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-brand-charcoal">
                          {contact.firstName} {contact.lastName}
                        </span>
                        <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-brand-muted">
                          Delivery
                        </span>
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-brand-charcoal/90 sm:text-sm">
                        {formattedAddress}
                      </p>
                      <p className="mt-1 text-xs text-brand-muted">
                        Phone: <span className="font-medium text-brand-charcoal">{contact.phone}</span>
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setStep(2)
                      window.scrollTo({ top: 0, behavior: 'smooth' })
                    }}
                    className="shrink-0 rounded-lg border border-brand-border px-3 py-1.5 text-xs font-bold text-brand-goldDark transition hover:border-brand-charcoal hover:text-brand-charcoal"
                  >
                    Change
                  </button>
                </div>
              </div>

              {/* PAYMENT METHOD SELECTOR */}
              <div className="rounded-2xl border border-brand-border bg-white p-4 shadow-xs sm:p-5">
                <h2 className="text-base font-bold text-brand-charcoal sm:text-lg">Select Payment Method</h2>
                <p className="mt-0.5 text-xs text-brand-muted">
                  All transactions are encrypted and secured end-to-end.
                </p>

                <div className="mt-4 space-y-3">
                  {availablePayments.map((method) => {
                    const selected = paymentMethod === method.id
                    return (
                      <label
                        key={method.id}
                        className={cn(
                          'flex cursor-pointer items-center justify-between gap-4 rounded-xl border px-4 py-3.5 transition-all',
                          selected
                            ? 'border-2 border-brand-charcoal bg-white shadow-xs'
                            : 'border-brand-border bg-white hover:border-brand-charcoal/40',
                        )}
                      >
                        <input
                          type="radio"
                          name="payment"
                          value={method.id}
                          checked={selected}
                          onChange={() => setPaymentMethod(method.id)}
                          className="sr-only"
                        />
                        <div className="flex min-w-0 items-center gap-3.5">
                          <span
                            className={cn(
                              'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border text-brand-charcoal',
                              selected ? 'border-brand-charcoal bg-neutral-50' : 'border-brand-border bg-white',
                            )}
                          >
                            <Icon name={PAYMENT_ICON[method.id] ?? 'card'} className="h-4 w-4" />
                          </span>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-semibold text-brand-charcoal">{method.label}</span>
                              {method.badge && (
                                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                                  {method.badge}
                                </span>
                              )}
                            </div>
                            <p className="mt-0.5 truncate text-xs text-brand-muted">{method.note}</p>
                          </div>
                        </div>

                        <span
                          aria-hidden="true"
                          className={cn(
                            'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition',
                            selected ? 'border-brand-charcoal' : 'border-brand-muted/50',
                          )}
                        >
                          {selected && <span className="h-2.5 w-2.5 rounded-full bg-brand-charcoal" />}
                        </span>
                      </label>
                    )
                  })}
                </div>

                {!showcase.codEnabled && (
                  <p className="mt-3 text-xs text-brand-muted">
                    Cash on Delivery is currently turned off. Please pay online with Razorpay.
                  </p>
                )}

                {/* Optional Gift Wrap toggle */}
                <div className="mt-4 border-t border-brand-border/70 pt-3">
                  <Checkbox
                    checked={giftWrap}
                    onChange={(event) => setGiftWrap(event.target.checked)}
                    label={`Add luxury satin gift box wrap (+${formatPrice(GIFT_WRAP_FEE)})`}
                  />
                </div>
              </div>

              {/* Price Details Card (prominent on mobile right under payment) */}
              <div className="rounded-2xl border border-brand-border bg-white p-4 shadow-xs sm:p-5 lg:hidden">
                <h3 className="text-sm font-bold text-brand-charcoal">Price Breakdown</h3>
                <dl className="mt-3 space-y-2 text-xs">
                  <div className="flex justify-between">
                    <dt className="text-brand-muted">Items Subtotal ({summary.itemCount} items)</dt>
                    <dd className="font-semibold tabular-nums text-brand-charcoal">{formatPrice(summary.subtotal)}</dd>
                  </div>
                  {summary.couponDiscount > 0 && (
                    <div className="flex justify-between">
                      <dt className="text-brand-muted">Coupon Discount ({couponCode})</dt>
                      <dd className="font-semibold tabular-nums text-emerald-700">-{formatPrice(summary.couponDiscount)}</dd>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <dt className="text-brand-muted">Delivery</dt>
                    <dd className="font-semibold tabular-nums text-brand-charcoal">
                      {totalDelivery === 0 ? 'Complimentary' : formatPrice(totalDelivery)}
                    </dd>
                  </div>
                  {summary.giftWrapFee > 0 && (
                    <div className="flex justify-between">
                      <dt className="text-brand-muted">Gift Box Wrap</dt>
                      <dd className="font-semibold tabular-nums text-brand-charcoal">{formatPrice(summary.giftWrapFee)}</dd>
                    </div>
                  )}
                  {codFee > 0 && (
                    <div className="flex justify-between">
                      <dt className="text-brand-muted">COD Handling</dt>
                      <dd className="font-semibold tabular-nums text-brand-charcoal">{formatPrice(codFee)}</dd>
                    </div>
                  )}
                  <div className="flex justify-between border-t border-brand-border/80 pt-2 text-sm font-bold">
                    <dt className="text-brand-charcoal">Total Amount</dt>
                    <dd className="tabular-nums text-brand-charcoal">{formatPrice(payable)}</dd>
                  </div>
                </dl>
              </div>

              {/* Action Button (Desktop inline / Fallback) */}
              <div className="hidden lg:block pt-2">
                <button
                  type="button"
                  disabled={placing}
                  onClick={placeOrder}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-charcoal px-6 py-4 text-base font-semibold text-white shadow-md transition hover:bg-brand-goldDark disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <Icon name="lock" className="h-4 w-4" />
                  <span>
                    {placing
                      ? 'Processing Order...'
                      : `${paymentMethod === 'cod' ? 'Place Order' : 'Pay'} ${formatPrice(payable)}`}
                  </span>
                </button>
              </div>
            </section>
          )}
        </div>

        {/* ─────────── RIGHT COLUMN: CURRENT ORDER SUMMARY (DESKTOP) ─────────── */}
        <aside className="hidden rounded-2xl border border-brand-border/80 bg-[#F6F6F6] p-6 lg:block lg:sticky lg:top-24">
          <h2 className="text-xl font-semibold text-brand-charcoal">Current Order</h2>
          <p className="mt-1 text-xs text-brand-muted">The sum of all total items & savings for your bag</p>

          {/* Compact Line-Item White Sub-Cards with live + / - steppers */}
          <ul className="mt-5 space-y-3">
            {entries.map(({ item }) => {
              const isReward = item.isLoyaltyReward || item.id === 'reward:free-5ml-attar'
              return (
                <li
                  key={item.id}
                  className={cn(
                    'flex items-center justify-between gap-3 rounded-xl border p-3',
                    isReward ? 'border-amber-300 bg-amber-50/50' : 'border-brand-border/70 bg-white',
                  )}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-[#F9F9F9] p-1">
                      <FlaconStage
                        tier={item.tier}
                        seed={item.slug}
                        label={item.name}
                        image={productImage(item)}
                        compact
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="block truncate text-sm font-semibold text-brand-charcoal">
                        {item.name}
                      </p>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-brand-muted">
                        <span>{item.volume} · Qty: {item.quantity}</span>
                        {isReward && (
                          <span className="rounded bg-amber-100 px-1.5 py-0.2 text-[10px] font-bold uppercase text-amber-800">
                            10 Pts Gift
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <span className={cn('text-sm font-semibold tabular-nums', isReward ? 'text-emerald-700' : 'text-brand-charcoal')}>
                      {isReward ? 'FREE (₹0)' : formatPrice(item.price * item.quantity)}
                    </span>
                    {!isReward ? (
                      <MiniQtyStepper
                        count={item.quantity}
                        itemLabel={item.name}
                        onIncrement={() => increment(item.id)}
                        onDecrement={() => decrement(item.id)}
                      />
                    ) : (
                      <span className="text-[11px] font-medium text-amber-800">Complimentary</span>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>

          {/* Subtotal row */}
          <div className="mt-4 flex items-baseline justify-between border-t border-brand-border/80 pt-4">
            <span className="text-base font-medium text-brand-charcoal">Subtotal</span>
            <span className="text-lg font-bold tabular-nums text-brand-charcoal">
              {formatPrice(summary.subtotal)}
            </span>
          </div>

          {/* Breakdown lines */}
          <dl className="mt-3.5 space-y-2 border-t border-brand-border/80 pt-3.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-brand-muted">Items</dt>
              <dd className="font-medium tabular-nums text-brand-charcoal">{summary.itemCount}x</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-brand-muted">
                Code Promo{couponCode ? ` (${couponCode})` : ''}
              </dt>
              <dd
                className={cn(
                  'font-medium tabular-nums',
                  summary.couponDiscount > 0 ? 'text-emerald-700' : 'text-brand-charcoal',
                )}
              >
                {summary.couponDiscount > 0 ? `-${formatPrice(summary.couponDiscount)}` : formatPrice(0)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-brand-muted">Delivery Service</dt>
              <dd className="font-medium tabular-nums text-brand-charcoal">
                {totalDelivery === 0 ? 'Complimentary' : formatPrice(totalDelivery)}
              </dd>
            </div>
            {summary.giftWrapFee > 0 && (
              <div className="flex justify-between">
                <dt className="text-brand-muted">Gift Box Wrap</dt>
                <dd className="font-medium tabular-nums text-brand-charcoal">{formatPrice(summary.giftWrapFee)}</dd>
              </div>
            )}
            {codFee > 0 && (
              <div className="flex justify-between">
                <dt className="text-brand-muted">COD Handling</dt>
                <dd className="font-medium tabular-nums text-brand-charcoal">{formatPrice(codFee)}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-brand-muted">GST (Included)</dt>
              <dd className="font-medium tabular-nums text-brand-charcoal">{formatPrice(summary.gst)}</dd>
            </div>
            {summary.hasFreeReward && (
              <div className="flex justify-between text-amber-800 font-medium pt-1 border-t border-brand-border/60">
                <dt className="flex items-center gap-1.5">
                  <Icon name="gift" className="h-4 w-4 text-amber-600" />
                  Free 5ml Attar Redeemed
                </dt>
                <dd className="font-semibold tabular-nums">-10 Points</dd>
              </div>
            )}
            <div className="flex justify-between text-brand-charcoal pt-1 border-t border-brand-border/60">
              <dt className="flex items-center gap-1.5 text-brand-muted">
                <Icon name="award" className="h-4 w-4 text-brand-goldDark" />
                Loyalty Point Earned
              </dt>
              <dd className={cn('tabular-nums font-semibold', summary.loyaltyPoints > 0 ? 'text-emerald-700' : 'text-brand-muted')}>
                {summary.loyaltyPoints > 0 ? '+1 Point' : '0 Points'}
              </dd>
            </div>
          </dl>

          {/* Desktop Right CTA Button */}
          {step === 2 ? (
            <button
              type="button"
              onClick={handleProceedToPayment}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-brand-charcoal px-6 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-goldDark"
            >
              <span>Continue To Payment</span>
              <Icon name="arrow-right" className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              disabled={placing}
              onClick={placeOrder}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-brand-charcoal px-6 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-goldDark disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Icon name="lock" className="h-4 w-4" />
              <span>
                {placing
                  ? 'Processing Order...'
                  : `${paymentMethod === 'cod' ? 'Place Order' : 'Pay'} ${formatPrice(payable)}`}
              </span>
            </button>
          )}

          <p className="mt-3.5 flex items-center justify-center gap-1.5 text-xs text-brand-muted">
            <Icon name="lock" className="h-3.5 w-3.5" />
            <span>Secure encrypted checkout</span>
            <span>·</span>
            <Link to="/cart" className="underline underline-offset-2 hover:text-brand-charcoal">
              Edit Bag
            </Link>
          </p>
        </aside>
      </div>

      {/* ─────────── MOBILE STICKY BOTTOM ACTION BAR (ZERO SCROLLING) ─────────── */}
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-brand-border bg-white/95 px-4 py-3 shadow-[0_-6px_20px_rgba(0,0,0,0.08)] backdrop-blur-md lg:hidden">
        <div className="flex items-center justify-between gap-3">
          <div>
            <span className="block text-[11px] font-medium text-brand-muted">Total Payable</span>
            <span className="text-lg font-bold tabular-nums text-brand-charcoal">{formatPrice(payable)}</span>
          </div>

          {step === 2 ? (
            <button
              type="button"
              onClick={handleProceedToPayment}
              className="flex items-center gap-2 rounded-full bg-brand-charcoal px-6 py-3 text-sm font-semibold text-white shadow-md transition active:scale-95"
            >
              <span>Continue</span>
              <Icon name="arrow-right" className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              disabled={placing}
              onClick={placeOrder}
              className="flex items-center gap-2 rounded-full bg-brand-charcoal px-6 py-3 text-sm font-semibold text-white shadow-md transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <Icon name="lock" className="h-4 w-4" />
              <span>{placing ? 'Processing...' : paymentMethod === 'cod' ? 'Place Order' : 'Pay Now'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default CheckoutPage
