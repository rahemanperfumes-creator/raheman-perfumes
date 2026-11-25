import { useEffect } from 'react'
import { Link } from '@/components/ui/AppLink'
import cn from '@/lib/cn'
import { formatPrice, FREE_SHIPPING_THRESHOLD } from '@/lib/format'
import useUiStore from '@/store/uiStore'
import useCartStore, { groupCartItems } from '@/store/cartStore'
import useAuthStore from '@/store/authStore'
import { useShowcase, useCatalogueStore } from '@/store/catalogueStore'
import { Icon } from '@/components/ui/Icon'
import { Button } from '@/components/ui/Button'
import { Drawer } from '@/components/ui/Modal'
import { TierBadge } from '@/components/ui/Badge'
import { QuantityStepper, EmptyState } from '@/components/ui/Feedback'
import { FlaconStage } from '@/components/product/FlaconArt'
import { productImage } from '@/data/productImages'

/** Progress rail toward the free-shipping threshold. */
function ShippingProgress({ subtotal, threshold = FREE_SHIPPING_THRESHOLD, shippingFee = 0 }) {
  const isFreeAll = shippingFee === 0
  const hasFreeShipping =
    typeof shippingFee === 'number' &&
    shippingFee > 0 &&
    typeof threshold === 'number' &&
    threshold > shippingFee &&
    threshold > 1

  if (isFreeAll) {
    return (
      <div className="border-b border-brand-border bg-emerald-50/50 px-5 py-2.5">
        <p className="flex items-center gap-2 text-body-sm font-medium text-emerald-800">
          <Icon name="check-circle" className="h-4 w-4 shrink-0 text-emerald-600" />
          <span>Complimentary delivery included on all orders.</span>
        </p>
      </div>
    )
  }

  if (!hasFreeShipping) {
    return (
      <div className="border-b border-brand-border bg-brand-cream/60 px-5 py-2.5">
        <p className="flex items-center gap-2 text-body-sm text-brand-charcoal">
          <Icon name="truck" className="h-4 w-4 shrink-0 text-brand-goldDark" />
          <span>Standard delivery: <strong>{formatPrice(shippingFee)}</strong></span>
        </p>
      </div>
    )
  }

  const limit = threshold
  const remaining = Math.max(0, limit - subtotal)
  const percent = Math.min(100, Math.round((subtotal / limit) * 100))
  const unlocked = remaining === 0

  return (
    <div className="border-b border-brand-border bg-brand-cream/60 px-5 py-3.5">
      <p className="flex items-center gap-2 text-body-sm text-ink-variant">
        <Icon name={unlocked ? 'check-circle' : 'truck'} className="h-4 w-4 shrink-0 text-brand-goldDark" />
        {unlocked ? (
          <span className="font-semibold text-emerald-800">Complimentary shipping unlocked.</span>
        ) : (
          <span>
            Add <span className="font-semibold text-brand-charcoal">{formatPrice(remaining)}</span> more for free
            shipping.
          </span>
        )}
      </p>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-brand-border">
        <div
          className={cn('h-full rounded-full transition-all duration-500', unlocked ? 'bg-emerald-600' : 'bg-brand-goldDark')}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  )
}

/** Drawer compact loyalty progress & reward unlock banner. */
function DrawerLoyaltyBanner() {
  const user = useAuthStore((state) => state.user)
  const addFreeAttarReward = useCartStore((state) => state.addFreeAttarReward)
  const removeFreeAttarReward = useCartStore((state) => state.removeFreeAttarReward)
  const hasReward = useCartStore((state) => state.hasFreeAttarReward())
  const points = user?.loyaltyPoints ?? 0

  if (!user) {
    return (
      <div className="border-b border-brand-border/60 bg-brand-cream/30 px-5 py-2 text-body-xs text-brand-muted flex items-center gap-1.5">
        <Icon name="award" className="h-3.5 w-3.5 text-brand-goldDark shrink-0" />
        <span>Members earn loyalty points with every order</span>
      </div>
    )
  }

  if (points >= 10) {
    if (hasReward) {
      return (
        <div className="border-b border-amber-200 bg-amber-50 px-5 py-2.5 flex items-center justify-between text-body-xs text-amber-950">
          <span className="flex items-center gap-1.5 font-semibold">
            <Icon name="gift" className="h-4 w-4 text-amber-700" /> Free 5ml Attar Claimed
          </span>
          <button
            type="button"
            onClick={removeFreeAttarReward}
            className="text-[11px] font-bold uppercase text-amber-900 underline hover:no-underline"
          >
            Remove
          </button>
        </div>
      )
    }

    return (
      <div className="border-b border-brand-gold/40 bg-gradient-to-r from-amber-50 via-brand-cream/80 to-amber-50 px-5 py-2.5 flex items-center justify-between gap-3 shadow-xs">
        <div className="min-w-0">
          <p className="text-body-xs font-bold text-brand-charcoal flex items-center gap-1">
            <Icon name="crown" className="h-3.5 w-3.5 text-brand-goldDark" /> Free 5ml Attar Unlocked!
          </p>
          <p className="text-[11px] text-brand-muted">You have {points} pts (costs 10 pts)</p>
        </div>
        <button
          type="button"
          onClick={() => addFreeAttarReward()}
          className="rounded-lg bg-brand-charcoal px-3 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-brand-goldDark shrink-0 transition"
        >
          + Add Free
        </button>
      </div>
    )
  }

  return (
    <div className="border-b border-brand-border/60 bg-brand-cream/40 px-5 py-2 flex items-center justify-between text-body-xs text-brand-muted">
      <span className="flex items-center gap-1.5">
        <Icon name="award" className="h-3.5 w-3.5 text-brand-goldDark" /> {points}/10 points collected
      </span>
    </div>
  )
}

/** Slide-over bag, opened from the header. */
export function CartDrawer() {
  const { cartDrawerOpen, closeCartDrawer } = useUiStore()
  const showcase = useShowcase()
  const bySlug = useCatalogueStore((state) => state.bySlug)
  const byId = useCatalogueStore((state) => state.byId)
  const items = useCartStore((state) => state.items)
  const increment = useCartStore((state) => state.increment)
  const decrement = useCartStore((state) => state.decrement)
  const removeItem = useCartStore((state) => state.removeItem)
  const syncPricing = useCartStore((state) => state.syncPricing)
  const summary = useCartStore((state) => state.summary())

  useEffect(() => {
    if (cartDrawerOpen) syncPricing()
  }, [cartDrawerOpen, syncPricing])

  const entries = groupCartItems(items)
  const empty = items.length === 0

  return (
    <Drawer
      open={cartDrawerOpen}
      onClose={closeCartDrawer}
      side="right"
      title="Shopping Bag"
      width="max-w-[26rem]"
    >
      <div className="flex items-center justify-between border-b border-brand-border px-5 py-4">
        <h2 className="flex items-center gap-2 text-label-md font-bold uppercase tracking-widest text-brand-charcoal">
          <Icon name="bag" className="h-4 w-4 text-brand-goldDark" />
          Your Bag
          {!empty && <span className="text-brand-muted">({summary.itemCount})</span>}
        </h2>
        <button
          type="button"
          onClick={closeCartDrawer}
          aria-label="Close bag"
          className="flex h-9 w-9 items-center justify-center rounded-full text-brand-muted transition hover:bg-neutral-100 hover:text-brand-charcoal"
        >
          <Icon name="close" className="h-4 w-4" strokeWidth={2} />
        </button>
      </div>

      {empty ? (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState
            icon="bag"
            title="Your bag is empty"
            description="Explore the catalogue and add a fragrance to begin."
            actionLabel="Browse Fragrances"
            actionTo="/shop"
            className="py-10"
          />
        </div>
      ) : (
        <>
          <ShippingProgress subtotal={summary.subtotal} threshold={summary.freeShippingOver} shippingFee={summary.shippingFee} />
          <DrawerLoyaltyBanner />

          <div className="flex-1 overflow-y-auto px-5 py-4">
            <ul className="space-y-4">
              {entries.map(({ item }) => {
                const isReward = item.isLoyaltyReward || item.id === 'reward:free-5ml-attar'
                return (
                  <li key={item.id} className="flex gap-3.5">
                    <div className="w-16 shrink-0">
                      <FlaconStage tier={item.tier} seed={item.slug} label={item.name} image={productImage(item)} compact />
                    </div>

                    <div className="flex min-w-0 flex-1 flex-col">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          {isReward ? (
                            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-800">
                              10 Pts Gift
                            </span>
                          ) : (
                            <TierBadge tier={item.tier} size="sm" />
                          )}
                          <p className="mt-1 truncate font-manrope text-body-sm font-semibold text-brand-charcoal">{item.name}</p>
                          <p className="text-body-sm text-brand-muted">{item.volume}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeItem(item.id)}
                          aria-label={`Remove ${item.name}`}
                          className="shrink-0 rounded p-1 text-brand-muted transition hover:bg-brand-cream hover:text-tier-original"
                        >
                          <Icon name="trash" className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      <div className="mt-2.5 flex items-center justify-between gap-3">
                        {isReward ? (
                          <span className="text-[11px] font-medium text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                            Qty: 1 (Complimentary)
                          </span>
                        ) : (
                          <div className="flex flex-col items-start gap-1">
                            {(() => {
                              const catalogueProduct = bySlug[item.slug] ?? byId[item.productId]
                              const maxStock = Math.max(
                                1,
                                catalogueProduct?.stockLeft ?? catalogueProduct?.stock ?? item.stockLeft ?? 99,
                              )
                              return (
                                <>
                                  <QuantityStepper
                                    value={item.quantity}
                                    max={maxStock}
                                    onChange={(next) => (next < item.quantity ? decrement(item.id) : increment(item.id))}
                                    size="sm"
                                  />
                                  {item.quantity >= maxStock && (
                                    <span className="text-[10px] font-semibold text-amber-700">
                                      Max stock reached ({maxStock})
                                    </span>
                                  )}
                                </>
                              )
                            })()}
                          </div>
                        )}
                        <div className="text-right">
                          <span className={cn('font-inter text-body-sm font-semibold', isReward ? 'text-emerald-700' : 'text-brand-charcoal')}>
                            {isReward ? 'FREE' : formatPrice(item.price * item.quantity)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>

          <div className="border-t border-brand-border bg-brand-cream/50 px-5 py-4">
            <dl className="space-y-1.5 text-body-sm">
              <div className="flex items-center justify-between">
                <dt className="text-brand-muted">Subtotal</dt>
                <dd className="font-semibold text-brand-charcoal">{formatPrice(summary.subtotal)}</dd>
              </div>
              {summary.productSavings > 0 && (
                <div className="flex items-center justify-between">
                  <dt className="text-brand-muted">Savings</dt>
                  <dd className="font-semibold text-emerald-700">−{formatPrice(summary.productSavings)}</dd>
                </div>
              )}
              <div className="flex items-center justify-between">
                <dt className="text-brand-muted">Shipping</dt>
                <dd className="font-semibold text-brand-charcoal">
                  {summary.shipping === 0 ? 'Complimentary' : formatPrice(summary.shipping)}
                </dd>
              </div>
              {summary.hasFreeReward && (
                <div className="flex items-center justify-between text-amber-800 pt-1 border-t border-brand-border/60">
                  <dt className="flex items-center gap-1 font-medium">🎁 Free 5ml Attar</dt>
                  <dd className="font-semibold">-10 Points</dd>
                </div>
              )}
              <div className="flex items-center justify-between border-t border-brand-border/60 pt-1 text-brand-charcoal">
                <dt className="text-brand-muted">Points earned</dt>
                <dd className={cn('font-semibold', summary.loyaltyPoints > 0 ? 'text-emerald-700' : 'text-brand-muted')}>
                  {summary.loyaltyPoints > 0 ? '+1 Point' : '0 Points'}
                </dd>
              </div>
            </dl>

            <div className="mt-3 flex items-baseline justify-between border-t border-brand-border pt-3">
              <span className="text-label-md font-bold uppercase text-brand-charcoal">Total</span>
              <span className="text-headline-sm font-semibold text-brand-charcoal">{formatPrice(summary.payable)}</span>
            </div>

            {summary.savings > 0 && (
              <p className="mt-1.5 text-body-sm font-semibold text-emerald-700">
                You save {formatPrice(summary.savings)} on this order
              </p>
            )}

            <div className="mt-4 space-y-2">
              <Button variant="primary" to="/checkout" onClick={closeCartDrawer} className="w-full">
                Proceed To Checkout
                <Icon name="arrow-right" className="h-4 w-4" />
              </Button>
              <Button variant="outline" to="/cart" onClick={closeCartDrawer} className="w-full">
                View Full Bag
              </Button>
            </div>

            <p className="mt-3 flex items-center justify-center gap-1.5 text-body-sm text-brand-muted">
              <Icon name="lock" className="h-3.5 w-3.5" />
              Secure encrypted checkout · {showcase.codEnabled ? 'UPI, cards & COD' : 'UPI & cards'}
            </p>
          </div>
        </>
      )}
    </Drawer>
  )
}

export default CartDrawer
