import { useEffect, useRef, useState } from 'react'
import { Link } from '@/components/ui/AppLink'
import cn from '@/lib/cn'
import { formatPrice, FREE_SHIPPING_THRESHOLD, GIFT_WRAP_FEE, LOYALTY_ORDER_THRESHOLD } from '@/lib/format'
import useCartStore, { groupCartItems } from '@/store/cartStore'
import useAuthStore from '@/store/authStore'
import { toast } from '@/store/uiStore'
import { Icon } from '@/components/ui/Icon'
import { Button } from '@/components/ui/Button'
import { QuantityStepper, EmptyState } from '@/components/ui/Feedback'
import { Input, Checkbox } from '@/components/ui/Form'
import { TierBadge } from '@/components/ui/Badge'
import { FlaconStage } from '@/components/product/FlaconArt'
import { productImage } from '@/data/productImages'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { couponService, productService } from '@/services/productService'
import { formatCouponTitle } from '@/data/offers'
import { useCatalogueProducts, useCatalogueStore } from '@/store/catalogueStore'

/** Coupon entry with validation and a list of codes the cart qualifies for. */
function CouponBox({ subtotal }) {
  const couponCode = useCartStore((state) => state.couponCode)
  const applyCoupon = useCartStore((state) => state.applyCoupon)
  const removeCoupon = useCartStore((state) => state.removeCoupon)

  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(false)
  const checkingRef = useRef(false)
  // The live coupon board from the server — the only list worth suggesting.
  const [coupons, setCoupons] = useState([])

  useEffect(() => {
    let alive = true
    productService
      .coupons()
      .then((rows) => {
        if (alive) setCoupons(Array.isArray(rows) ? rows : [])
      })
      .catch(() => {
        if (alive) setCoupons([])
      })
    return () => {
      alive = false
    }
  }, [])

  /**
   * Check the code against the server, and only the server.
   *
   * The backend is what will actually charge the discount at checkout, so a
   * code means nothing unless it answers there. No server, no coupon — the
   * failure is shown rather than papered over with a local guess.
   */
  const submit = async (event) => {
    event.preventDefault()
    if (checkingRef.current) return
    const trimmed = code.trim()
    if (!trimmed) {
      setError('Enter a coupon code.')
      return
    }
    checkingRef.current = true
    setChecking(true)

    let answer
    try {
      answer = await couponService.validate(trimmed, subtotal)
    } catch (failure) {
      checkingRef.current = false
      setChecking(false)
      setError(failure.message)
      return
    }

    checkingRef.current = false
    setChecking(false)
    if (!answer?.ok) {
      setError(answer?.message ?? 'That code could not be checked.')
      return
    }

    applyCoupon(answer.coupon)
    setError('')
    setCode('')
    toast({ title: `${answer.coupon.code} applied`, description: answer.coupon.description })
  }

  if (couponCode) {
    return (
      <div className="flex items-center justify-between gap-3 rounded border border-emerald-200 bg-emerald-50 px-4 py-3">
        <span className="flex items-center gap-2 text-body-sm font-semibold text-emerald-900">
          <Icon name="check-circle" className="h-4 w-4" />
          {couponCode} applied
        </span>
        <button
          type="button"
          onClick={() => {
            removeCoupon()
            toast({ title: 'Coupon removed', tone: 'info' })
          }}
          className="text-label-sm font-bold uppercase text-emerald-900 underline-offset-4 hover:underline"
        >
          Remove
        </button>
      </div>
    )
  }

  const eligible = coupons.filter((coupon) => subtotal >= (coupon.minOrder ?? 0))

  return (
    <div>
      <form onSubmit={submit} className="flex gap-2">
        <Input
          value={code}
          onChange={(event) => {
            setCode(event.target.value.toUpperCase())
            setError('')
          }}
          placeholder="Enter coupon code"
          aria-label="Coupon code"
          icon="ticket"
          error={error}
          className="uppercase"
        />
        <Button type="submit" variant="outline" className="shrink-0" loading={checking}>
          Apply
        </Button>
      </form>

      {eligible.length > 0 && (
        <div className="mt-3">
          <p className="text-label-sm font-bold uppercase text-brand-muted">Available on this order</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {eligible.map((coupon) => (
              <button
                key={coupon.code}
                type="button"
                onClick={() => setCode(coupon.code)}
                className="rounded-full border border-dashed border-brand-gold bg-white px-3 py-1.5 text-label-sm font-bold uppercase text-brand-goldDark transition hover:bg-neutral-50"
                title={coupon.description}
              >
                {coupon.code} · {formatCouponTitle(coupon)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/** Exclusive 10-points loyalty banner & 1-click Free 5ml Attar reward claim. */
function LoyaltyBanner() {
  const user = useAuthStore((state) => state.user)
  const addFreeAttarReward = useCartStore((state) => state.addFreeAttarReward)
  const removeFreeAttarReward = useCartStore((state) => state.removeFreeAttarReward)
  const hasReward = useCartStore((state) => state.hasFreeAttarReward())
  const points = user?.loyaltyPoints ?? 0

  if (!user) {
    return (
      <div className="mb-6 flex items-center justify-between gap-3 rounded-xl border border-brand-border/80 bg-brand-cream/40 p-4">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-cream text-brand-goldDark">
            <Icon name="award" className="h-5 w-5" />
          </span>
          <p className="text-body-xs text-brand-charcoal">
            <Link to="/auth/signin" className="font-semibold text-brand-goldDark underline underline-offset-2">Sign in</Link> to view and earn loyalty points on your order.
          </p>
        </div>
      </div>
    )
  }

  if (points >= 10) {
    if (hasReward) {
      return (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-gradient-to-r from-amber-50 via-orange-50 to-amber-50 p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-800">
              <Icon name="gift" className="h-5 w-5" />
            </span>
            <div>
              <p className="text-body-sm font-bold text-amber-950">
                🎉 Free 5ml Pure Attar Reward Added!
              </p>
              <p className="text-body-xs text-amber-800">
                10 of your {points} loyalty points will be redeemed on order completion.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              removeFreeAttarReward()
              toast({ title: 'Reward removed', tone: 'info' })
            }}
            className="text-label-sm font-bold uppercase text-amber-900 underline-offset-4 hover:underline"
          >
            Remove Offer
          </button>
        </div>
      )
    }

    return (
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border-2 border-brand-gold/60 bg-gradient-to-r from-amber-50 via-brand-cream/80 to-amber-50 p-4 shadow-sm">
        <div className="flex items-center gap-3.5">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-brand-gold bg-brand-gold/20 text-brand-goldDark">
            <Icon name="crown" className="h-6 w-6" />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-amber-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                10 Points Unlocked
              </span>
              <p className="text-body-sm font-bold text-brand-charcoal">
                Complimentary 5ml Pure Attar Offer!
              </p>
            </div>
            <p className="mt-0.5 text-body-xs text-brand-muted">
              You have <strong>{points} loyalty points</strong>. Add your complimentary 5ml pure artisanal attar bottle to this order at ₹0!
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={() => {
            addFreeAttarReward()
            toast({ title: 'Free 5ml Attar added to your bag!', description: '10 loyalty points will be redeemed at checkout.', tone: 'info' })
          }}
          className="shrink-0 bg-brand-charcoal hover:bg-brand-goldDark"
        >
          <Icon name="plus" className="h-4 w-4" />
          Add Free 5ml Attar (₹0)
        </Button>
      </div>
    )
  }

  // points < 10
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand-border bg-white/70 p-4">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-cream text-brand-goldDark">
          <Icon name="award" className="h-5 w-5" />
        </span>
        <div>
          <p className="text-body-sm font-semibold text-brand-charcoal">
            Loyalty Progress: {points}/10 Points
          </p>
          <p className="text-body-xs text-brand-muted">
            Unlock exclusive complimentary rewards as you collect points.
          </p>
        </div>
      </div>
      <div className="w-full sm:w-40">
        <div className="h-2 overflow-hidden rounded-full bg-neutral-200">
          <div
            className="h-full rounded-full bg-brand-goldDark transition-all duration-300"
            style={{ width: `${Math.min(100, (points / 10) * 100)}%` }}
          />
        </div>
        <p className="mt-1 text-right text-[11px] font-medium text-brand-muted">
          {Math.max(0, 10 - points)} pts left to unlock reward
        </p>
      </div>
    </div>
  )
}

/** The sticky order summary shared by the cart and checkout pages. */
export function OrderSummary({ children, cta, className }) {
  const summary = useCartStore((state) => state.summary())
  const giftWrap = useCartStore((state) => state.giftWrap)
  const setGiftWrap = useCartStore((state) => state.setGiftWrap)
  const giftMessage = useCartStore((state) => state.giftMessage)
  const setGiftMessage = useCartStore((state) => state.setGiftMessage)

  return (
    <aside className={cn('card-surface p-6 lg:sticky lg:top-28 lg:self-start', className)}>
      <h2 className="text-label-md font-bold uppercase tracking-widest text-brand-charcoal">Order Summary</h2>

      <dl className="mt-5 space-y-2.5 text-body-sm">
        <div className="flex justify-between">
          <dt className="text-brand-muted">Subtotal ({summary.itemCount} items)</dt>
          <dd className="font-semibold text-brand-charcoal">{formatPrice(summary.subtotal)}</dd>
        </div>

        {summary.productSavings > 0 && (
          <div className="flex justify-between">
            <dt className="text-brand-muted">MRP savings</dt>
            <dd className="font-semibold text-emerald-700">−{formatPrice(summary.productSavings)}</dd>
          </div>
        )}

        {summary.couponDiscount > 0 && (
          <div className="flex justify-between">
            <dt className="text-brand-muted">Coupon ({summary.couponCode})</dt>
            <dd className="font-semibold text-emerald-700">−{formatPrice(summary.couponDiscount)}</dd>
          </div>
        )}

        <div className="flex justify-between">
          <dt className="text-brand-muted">Shipping</dt>
          <dd className="font-semibold text-brand-charcoal">
            {summary.shipping === 0 ? 'Complimentary' : formatPrice(summary.shipping)}
          </dd>
        </div>

        {summary.giftWrapFee > 0 && (
          <div className="flex justify-between">
            <dt className="text-brand-muted">Velvet gift wrap</dt>
            <dd className="font-semibold text-brand-charcoal">{formatPrice(summary.giftWrapFee)}</dd>
          </div>
        )}

        <div className="flex justify-between border-t border-brand-border pt-2.5 text-brand-muted">
          <dt>GST included (18%)</dt>
          <dd>{formatPrice(summary.gst)}</dd>
        </div>

        {summary.hasFreeReward && (
          <div className="flex justify-between text-amber-800 border-t border-brand-border/60 pt-2 font-medium">
            <dt className="flex items-center gap-1.5">
              <Icon name="gift" className="h-3.5 w-3.5 text-amber-600" />
              Free 5ml Attar redeemed
            </dt>
            <dd className="font-semibold tabular-nums">-10 Points</dd>
          </div>
        )}

        <div className="flex justify-between border-t border-brand-border/60 pt-2 text-brand-charcoal">
          <dt className="flex items-center gap-1.5 text-brand-muted">
            <Icon name="award" className="h-3.5 w-3.5 text-brand-goldDark" />
            Loyalty point earned
          </dt>
          <dd className={cn('font-semibold tabular-nums', summary.loyaltyPoints > 0 ? 'text-emerald-700' : 'text-brand-muted')}>
            {summary.loyaltyPoints > 0 ? '+1 Point' : '0 Points'}
          </dd>
        </div>
      </dl>

      {/* Gift wrap */}
      <div className="mt-5 rounded border border-brand-border bg-brand-cream/50 p-4">
        <Checkbox
          checked={giftWrap}
          onChange={(event) => setGiftWrap(event.target.checked)}
          label={
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-body-sm font-semibold text-brand-charcoal">Add velvet gift wrap</span>
              <span className="text-body-sm text-brand-muted">+{formatPrice(GIFT_WRAP_FEE)}</span>
            </span>
          }
          description="Premium black gift box, gold seal and a handwritten message card."
        />
        {giftWrap && (
          <textarea
            rows={2}
            value={giftMessage}
            onChange={(event) => setGiftMessage(event.target.value.slice(0, 200))}
            placeholder="Message for the card (optional)"
            aria-label="Gift message"
            className="field mt-3 resize-none"
          />
        )}
      </div>

      <div className="mt-5 flex items-baseline justify-between border-t border-brand-border pt-4">
        <span className="text-label-md font-bold uppercase text-brand-charcoal">Total</span>
        <span className="font-serif text-2xl font-semibold text-brand-charcoal">{formatPrice(summary.payable)}</span>
      </div>

      {summary.savings > 0 && (
        <p className="mt-2 flex items-center gap-2 text-body-sm font-semibold text-emerald-700">
          <Icon name="tag" className="h-3.5 w-3.5" />
          You save {formatPrice(summary.savings)} on this order
        </p>
      )}

      {summary.shipping > 0 && summary.freeShippingGap > 0 ? (
        <p className="mt-2 flex items-center gap-2 text-body-sm text-ink-variant">
          <Icon name="truck" className="h-3.5 w-3.5 text-brand-goldDark" />
          Add {formatPrice(summary.freeShippingGap)} more for free delivery
        </p>
      ) : summary.shipping > 0 ? (
        <p className="mt-2 flex items-center gap-2 text-body-sm text-brand-charcoal">
          <Icon name="truck" className="h-3.5 w-3.5 text-brand-goldDark" />
          Standard delivery: {formatPrice(summary.shipping)}
        </p>
      ) : summary.shipping === 0 ? (
        <p className="mt-2 flex items-center gap-2 text-body-sm font-medium text-emerald-700">
          <Icon name="check-circle" className="h-3.5 w-3.5" />
          Complimentary delivery unlocked
        </p>
      ) : null}

      {children}

      {cta && <div className="mt-5">{cta}</div>}

      <p className="mt-4 flex items-center justify-center gap-2 text-body-sm text-brand-muted">
        <Icon name="lock" className="h-3.5 w-3.5" />
        Secure encrypted checkout
      </p>
    </aside>
  )
}

/** Small "you may also like" rail driven by what is already in the bag. */
function CartCrossSell({ excludeIds }) {
  const addItem = useCartStore((state) => state.addItem)
  const catalogue = useCatalogueProducts()
  const lastAddRef = useRef(0)
  const suggestions = catalogue
    .filter((product) => !excludeIds.includes(product.id) && product.bestseller && product.inStock !== false)
    .slice(0, 3)

  if (!suggestions.length) return null

  return (
    <div className="mt-10">
      <h2 className="text-label-md font-bold uppercase tracking-widest text-brand-charcoal">Complete The Set</h2>
      <ul className="mt-4 grid gap-4 sm:grid-cols-3">
        {suggestions.map((product) => (
          <li key={product.id} className="card-surface flex items-center gap-3 p-3">
            <Link to={`/product/${product.slug}`} className="w-14 shrink-0">
              <FlaconStage tier={product.tier} seed={product.slug} label={product.name} image={productImage(product)} compact />
            </Link>
            <div className="min-w-0 flex-1">
              <p className="truncate text-body-sm font-semibold text-brand-charcoal">{product.name}</p>
              <p className="text-body-sm text-brand-muted">{formatPrice(product.price)}</p>
            </div>
            <button
              type="button"
              onClick={() => {
                const now = Date.now()
                if (now - lastAddRef.current < 450) return
                lastAddRef.current = now
                addItem(product)
                toast({ title: 'Added to bag', description: product.name })
              }}
              aria-label={`Add ${product.name} to bag`}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-charcoal text-brand-ivory transition hover:bg-brand-goldDark"
            >
              <Icon name="plus" className="h-3.5 w-3.5" strokeWidth={2.5} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function CartPage() {
  useDocumentTitle('Shopping Bag')

  const items = useCartStore((state) => state.items)
  const increment = useCartStore((state) => state.increment)
  const decrement = useCartStore((state) => state.decrement)
  const removeItem = useCartStore((state) => state.removeItem)
  const syncPricing = useCartStore((state) => state.syncPricing)
  const clearCart = useCartStore((state) => state.clearCart)
  const byId = useCatalogueStore((state) => state.byId)
  const bySlug = useCatalogueStore((state) => state.bySlug)
  const summary = useCartStore((state) => state.summary())

  useEffect(() => {
    syncPricing()
  }, [syncPricing])

  const entries = groupCartItems(items)

  if (items.length === 0) {
    return (
      <div className="shell py-16">
        <EmptyState
          icon="bag"
          title="Your bag is empty"
          description="Nothing here yet. Explore our collection of perfumes and attars."
          actionLabel="Browse Fragrances"
          actionTo="/shop"
        />
      </div>
    )
  }

  return (
    <div className="shell py-8 lg:py-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="font-serif text-3xl font-medium text-brand-charcoal lg:text-headline-xl">Shopping Bag</h1>
        <button
          type="button"
          onClick={() => {
            clearCart()
            toast({ title: 'Bag emptied', tone: 'info' })
          }}
          className="text-label-sm font-bold uppercase text-brand-muted underline-offset-4 transition hover:text-tier-original hover:underline"
        >
          Empty Bag
        </button>
      </div>

      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-12">
        <div>
          <LoyaltyBanner />

          <ul className="divide-y divide-brand-border border-y border-brand-border">
            {entries.map(({ item }) => {
              const isReward = item.isLoyaltyReward || item.id === 'reward:free-5ml-attar'
              return (
                <li key={item.id} className="flex gap-4 py-5 sm:gap-6">
                  <div className="w-24 shrink-0 sm:w-28">
                    <FlaconStage tier={item.tier} seed={item.slug} label={item.name} image={productImage(item)} compact />
                  </div>

                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        {isReward ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-800">
                            <Icon name="gift" className="h-3 w-3" /> Complimentary 10-Pts Gift
                          </span>
                        ) : (
                          <TierBadge tier={item.tier} size="sm" />
                        )}
                        <h2 className="mt-2 text-body-lg font-semibold text-brand-charcoal">
                          {isReward ? (
                            <span>{item.name}</span>
                          ) : (
                            <Link
                              to={`/product/${item.slug}`}
                              className="transition-colors hover:text-brand-goldDark"
                            >
                              {item.name}
                            </Link>
                          )}
                        </h2>
                        <p className="mt-0.5 text-body-sm text-brand-muted">
                          {item.brand} · {item.volume}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => removeItem(item.id)}
                        aria-label={`Remove ${item.name}`}
                        className="shrink-0 rounded p-1.5 text-brand-muted transition hover:bg-brand-cream hover:text-tier-original"
                      >
                        <Icon name="trash" className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-4">
                      {isReward ? (
                        <span className="rounded bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-900 border border-amber-200">
                          Qty: 1 (Complimentary Gift)
                        </span>
                      ) : (
                        (() => {
                          const maxStock = Math.max(
                            1,
                            bySlug[item.slug]?.stockLeft ??
                              bySlug[item.slug]?.stock ??
                              byId[item.productId]?.stockLeft ??
                              byId[item.productId]?.stock ??
                              item.stockLeft ??
                              99,
                          )
                          return (
                            <div className="flex flex-col items-start gap-1">
                              <QuantityStepper
                                value={item.quantity}
                                max={maxStock}
                                onChange={(next) => (next < item.quantity ? decrement(item.id) : increment(item.id))}
                              />
                              {item.quantity >= maxStock && (
                                <span className="text-[11px] font-semibold text-amber-700">
                                  Max limit reached ({maxStock} in stock)
                                </span>
                              )}
                            </div>
                          )
                        })()
                      )}
                      <div className="text-right">
                        <p className="text-body-lg font-semibold text-brand-charcoal">
                          {isReward ? 'FREE (₹0)' : formatPrice(item.price * item.quantity)}
                        </p>
                        {item.mrp > item.price ? (
                          <p className="text-body-sm text-brand-muted">
                            <span className="line-through">{formatPrice(item.mrp * item.quantity)}</span>{' '}
                            <span className="font-semibold text-emerald-700">
                              save {formatPrice((item.mrp - item.price) * item.quantity)}
                            </span>
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>

          {/* Coupon */}
          <div className="mt-8 rounded border border-brand-border bg-brand-cream/40 p-5">
            <h2 className="text-label-md font-bold uppercase tracking-widest text-brand-charcoal">
              Have a coupon?
            </h2>
            <div className="mt-3">
              <CouponBox subtotal={summary.subtotal} />
            </div>
          </div>

          <CartCrossSell excludeIds={items.map((item) => item.productId)} />

          <div className="mt-8 flex flex-wrap gap-3">
            <Button variant="outline" to="/shop">
              <Icon name="arrow-left" className="h-4 w-4" />
              Continue Shopping
            </Button>
          </div>
        </div>

        <OrderSummary
          cta={
            <Button variant="primary" size="lg" to="/checkout" className="w-full">
              Proceed To Checkout
              <Icon name="arrow-right" className="h-4 w-4" />
            </Button>
          }
        />
      </div>
    </div>
  )
}

export default CartPage
