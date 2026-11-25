import { useEffect, useMemo, useRef, useState } from 'react'
import { NAV_TRANSITION, Link, useNavigate, useParams } from '@/components/ui/AppLink'
import cn from '@/lib/cn'
import { formatPrice, discountPercent, formatDate, initials } from '@/lib/format'
import useCartStore from '@/store/cartStore'
import useWishlistStore from '@/store/wishlistStore'
import useUiStore, { toast } from '@/store/uiStore'
import { Icon } from '@/components/ui/Icon'
import { Button } from '@/components/ui/Button'
import { TierBadge, Chip } from '@/components/ui/Badge'
import { Rating, RatingBreakdown } from '@/components/ui/Rating'
import { SectionHeading } from '@/components/ui/SectionHeading'
import { Tabs } from '@/components/ui/Tabs'
import { QuantityStepper, EmptyState, Skeleton } from '@/components/ui/Feedback'
import { CollapsiblePanel } from '@/components/ui/Accordion'
import { FlaconStage } from '@/components/product/FlaconArt'
import { productGallery, productImage } from '@/data/productImages'
import { ProductRail } from '@/components/product/ProductCard'
import { useShopActions } from '@/components/home/Showcase'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { productService, relatedProducts } from '@/services/productService'
import { useCatalogueStore, useCatalogueProducts, useShowcase } from '@/store/catalogueStore'
import { OCCASIONS } from '@/data/content'
import { ratingBreakdown } from '@/lib/reviews'

/** Note pyramid rendered as three columns. */
function NotePyramid({ notes }) {
  const rows = [
    { id: 'top', label: 'Top Notes', blurb: 'First 15 minutes', values: notes?.top ?? [] },
    { id: 'heart', label: 'Heart Notes', blurb: '1–4 hours', values: notes?.heart ?? [] },
    { id: 'base', label: 'Base Notes', blurb: '4 hours onward', values: notes?.base ?? [] },
  ].filter((row) => row.values.length)

  if (!rows.length) return null

  return (
    <div className="grid gap-6 sm:grid-cols-3">
      {rows.map((row) => (
        <div key={row.id}>
          <p className="text-label-sm font-bold uppercase tracking-widest text-brand-goldDark">{row.label}</p>
          <p className="mt-1 text-body-sm text-brand-muted">{row.blurb}</p>
          <ul className="mt-3 space-y-2">
            {row.values.map((note) => (
              <li key={note} className="flex items-start gap-2.5 font-inter text-[17px] font-normal text-ink-variant sm:text-[18px]">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-gold" />
                {note}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

/** One review card. */
function ReviewCard({ review }) {
  return (
    <article className="border-b border-brand-border py-6 last:border-b-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-cream font-serif text-sm font-semibold text-brand-goldDark">
            {initials(review.name)}
          </span>
          <div>
            <p className="flex items-center gap-1.5 text-body-sm font-semibold text-brand-charcoal">
              {review.name}
              <Icon name="verified" className="h-3.5 w-3.5 text-brand-goldDark" />
            </p>
            <p className="text-body-sm text-brand-muted">
              {review.city} · {formatDate(review.date)}
            </p>
          </div>
        </div>
        <Rating value={review.rating} size="sm" showValue={false} />
      </div>
      {review.title && <h4 className="mt-4 text-body-md font-semibold text-brand-charcoal">{review.title}</h4>}
      <p className="mt-1.5 text-body-md leading-relaxed text-brand-muted">{review.body}</p>
    </article>
  )
}

export function ProductDetailPage() {
  const { slug } = useParams()
  const navigate = useNavigate()
  const [bundle, setBundle] = useState(null)
  const [loading, setLoading] = useState(true)
  const [volume, setVolume] = useState(null)
  const [quantity, setQuantity] = useState(1)
  const [tab, setTab] = useState('description')
  const [activeImage, setActiveImage] = useState(0)
  const lastAddRef = useRef(0)
  const buyingRef = useRef(false)

  const addItem = useCartStore((state) => state.addItem)
  const toggleWishlist = useWishlistStore((state) => state.toggle)
  const trackView = useUiStore((state) => state.trackView)
  const openCartDrawer = useUiStore((state) => state.openCartDrawer)
  const recentlyViewed = useUiStore((state) => state.recentlyViewed)
  const { onAdd } = useShopActions()

  const product = bundle?.product
  const reviews = bundle?.reviews ?? []

  const saved = useWishlistStore((state) => {
    if (!product) return false
    const id = String(product.id ?? product._id ?? '')
    return state.items.some((item) => String(item.productId ?? item.id ?? '') === id)
  })

  useDocumentTitle(product ? product.name : 'Fragrance')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    productService.detailBundle(slug).then((data) => {
      if (cancelled) return
      setBundle(data)
      setVolume(data?.product?.volumes?.[0]?.size ?? null)
      setQuantity(1)
      setTab('description')
      setActiveImage(0)
      setLoading(false)
      if (data?.product) trackView(data.product.id)
    })
    return () => {
      cancelled = true
    }
  }, [slug, trackView])

  const variant = useMemo(
    () => product?.volumes?.find((entry) => entry.size === volume) ?? product?.volumes?.[0],
    [product, volume],
  )

  const liveCatalogue = useCatalogueProducts()
  const liveById = useCatalogueStore((state) => state.byId)
  const showcase = useShowcase()
  const freeShippingOver = useCartStore((state) => state.freeShippingOver)
  const shippingFee = useCartStore((state) => state.shippingFee)
  const syncPricing = useCartStore((state) => state.syncPricing)

  useEffect(() => {
    syncPricing()
  }, [syncPricing])

  const currentPrice = variant?.price ?? product?.price ?? 0
  const isFreeDeliveryAll = shippingFee === 0
  const hasFreeShipping = typeof freeShippingOver === 'number' && freeShippingOver > shippingFee && freeShippingOver > 1
  const qualifiesForFreeDelivery = isFreeDeliveryAll || (hasFreeShipping && currentPrice >= freeShippingOver)
  const shippingGap = hasFreeShipping ? Math.max(0, freeShippingOver - currentPrice) : 0

  const deliveryPromise = useMemo(
    () => [
      {
        icon: 'truck',
        title: isFreeDeliveryAll
          ? 'Complimentary Delivery'
          : hasFreeShipping
            ? `Free Delivery over ${formatPrice(freeShippingOver)}`
            : `Standard Delivery ${formatPrice(shippingFee)}`,
        note: '4–6 working days across India',
      },
      { icon: 'shield', title: '100% Genuine & Authentic', note: 'Sourced directly from official suppliers' },
      { icon: 'sparkle', title: 'Up to 40% oil concentration', note: 'Pure French oils & long lasting' },
      { icon: 'shield', title: 'Tamper-proof seal', note: 'Safe 3-layer protective packaging' },
    ],
    [isFreeDeliveryAll, hasFreeShipping, freeShippingOver, shippingFee],
  )

  // Relatives are drawn from the live catalogue: the rail sits under the
  // fragrance the shopper is looking at, and a bundled sibling that has been
  // unpublished would be an invitation to a dead page.
  const related = useMemo(
    () => (slug ? relatedProducts(slug, { limit: 8, products: liveCatalogue }) : []),
    [slug, liveCatalogue],
  )
  const alsoViewed = useMemo(
    () =>
      recentlyViewed
        .filter((id) => id !== product?.id)
        .map((id) => liveById[id])
        .filter(Boolean)
        .slice(0, 6),
    [recentlyViewed, product, liveById],
  )

  const gallery = useMemo(() => productGallery(product), [product])

  if (loading) {
    return (
      <div className="shell py-10">
        <div className="grid gap-12 lg:grid-cols-2">
          <Skeleton className="aspect-[4/5]" />
          <div className="space-y-4">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-10 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        </div>
      </div>
    )
  }

  if (!product) {
    return (
      <div className="shell py-16">
        <EmptyState
          icon="search"
          title="We couldn't find that perfume"
          description="It may have been removed, or the link has a typing mistake."
          actionLabel="Browse Perfumes"
          actionTo="/shop"
        />
      </div>
    )
  }

  const selectedImageIndex = activeImage < gallery.length ? activeImage : 0
  const mainImage = gallery[selectedImageIndex] ?? productImage(product)
  const hasMultipleImages = gallery.length > 1

  const showPrevImage = () => {
    if (!hasMultipleImages) return
    setActiveImage((selectedImageIndex - 1 + gallery.length) % gallery.length)
  }

  const showNextImage = () => {
    if (!hasMultipleImages) return
    setActiveImage((selectedImageIndex + 1) % gallery.length)
  }

  const percent = discountPercent(variant?.mrp, variant?.price)
  const breakdown = ratingBreakdown(reviews)

  // What the website may sell — the server already holds back the shop
  // counter's reserve, so this is the number to promise a shopper. The bundled
  // fixtures carry no count, which reads as "available, number unknown".
  const stockLeft = typeof product.stockLeft === 'number' ? product.stockLeft : null
  const comingSoon = Boolean(product.comingSoon || product.status === 'Draft')
  const soldOut = !comingSoon && (product.inStock === false || stockLeft === 0)
  const maxQuantity = stockLeft ?? 99
  // The stepper is capped, but a count that drops after the page loaded must
  // not leave a larger quantity sitting in state to be added anyway.
  const qty = Math.min(quantity, Math.max(1, maxQuantity))

  const handleAdd = () => {
    if (soldOut || comingSoon) return
    const now = Date.now()
    if (now - lastAddRef.current < 450) return
    lastAddRef.current = now
    addItem(product, { quantity: qty, volume, price: variant?.price, mrp: variant?.mrp })
    toast({ title: 'Added to bag', description: `${product.name} · ${volume} × ${qty}` })
    openCartDrawer()
  }

  const handleBuyNow = () => {
    if (soldOut || comingSoon || buyingRef.current) return
    buyingRef.current = true
    addItem(product, { quantity: qty, volume, price: variant?.price, mrp: variant?.mrp })
    navigate('/checkout', NAV_TRANSITION)
  }

  return (
    <div className="pb-16">
      {/* Main */}
      <section className="shell grid gap-6 py-5 sm:gap-8 sm:py-8 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:items-start lg:gap-x-16 lg:gap-y-6 lg:pt-10">
        {/* Gallery */}
        <div className="lg:col-start-1 lg:row-start-1">
          <div
            className="group relative"
            tabIndex={hasMultipleImages ? 0 : undefined}
            onKeyDown={(event) => {
              if (!hasMultipleImages) return
              if (event.key === 'ArrowLeft') {
                event.preventDefault()
                showPrevImage()
              } else if (event.key === 'ArrowRight') {
                event.preventDefault()
                showNextImage()
              }
            }}
          >
            <FlaconStage
              tier={product.tier}
              seed={product.slug}
              label={product.name}
              sublabel={product.concentration}
              volume={volume}
              image={mainImage}
            />

            {hasMultipleImages && (
              <>
                <button
                  type="button"
                  onClick={showPrevImage}
                  aria-label="Previous product image"
                  title="Previous image"
                  className="absolute left-1 top-1/2 z-20 flex h-16 w-12 -translate-y-1/2 items-center justify-center bg-transparent text-white/90 [filter:drop-shadow(0_1px_2px_rgba(0,0,0,0.8))_drop-shadow(0_0_1px_rgba(0,0,0,0.65))] transition-all duration-200 hover:scale-110 hover:text-brand-gold active:scale-95 sm:left-2 sm:h-20 sm:w-14 lg:opacity-0 lg:group-hover:opacity-100 lg:focus-visible:opacity-100"
                >
                  <Icon name="chevron-left" className="h-7 w-7 sm:h-8 sm:w-8" strokeWidth={2.2} />
                </button>

                <button
                  type="button"
                  onClick={showNextImage}
                  aria-label="Next product image"
                  title="Next image"
                  className="absolute right-1 top-1/2 z-20 flex h-16 w-12 -translate-y-1/2 items-center justify-center bg-transparent text-white/90 [filter:drop-shadow(0_1px_2px_rgba(0,0,0,0.8))_drop-shadow(0_0_1px_rgba(0,0,0,0.65))] transition-all duration-200 hover:scale-110 hover:text-brand-gold active:scale-95 sm:right-2 sm:h-20 sm:w-14 lg:opacity-0 lg:group-hover:opacity-100 lg:focus-visible:opacity-100"
                >
                  <Icon name="chevron-right" className="h-7 w-7 sm:h-8 sm:w-8" strokeWidth={2.2} />
                </button>

                <span className="pointer-events-none absolute bottom-3 right-3 z-20 rounded-full bg-brand-charcoal/75 px-2.5 py-1 text-[11px] font-medium tabular-nums text-white backdrop-blur-sm transition-opacity duration-200 lg:opacity-0 lg:group-hover:opacity-100">
                  {selectedImageIndex + 1} / {gallery.length}
                </span>
              </>
            )}
          </div>

          {gallery.length > 1 && (
            <div className="mt-3.5 grid grid-cols-4 gap-2.5 sm:mt-5 sm:gap-3">
              {gallery.map((shot, index) => {
                const active = selectedImageIndex === index
                return (
                  <button
                    key={`${shot.src}-${index}`}
                    type="button"
                    onClick={() => setActiveImage(index)}
                    aria-label={`Show image ${index + 1} of ${product.name}`}
                    aria-pressed={active}
                    className={cn(
                      'overflow-hidden rounded border text-left transition',
                      active
                        ? 'border-brand-gold ring-2 ring-brand-gold/30'
                        : 'border-brand-border hover:border-brand-gold/60',
                    )}
                  >
                    <FlaconStage
                      tier={product.tier}
                      seed={`${product.slug}-${index}`}
                      label={`${product.name} ${index + 1}`}
                      image={shot}
                      compact
                      className="border-0"
                    />
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Buy box — renders directly under product image on phones; right column on desktop */}
        <div className="lg:col-start-2 lg:row-start-1 lg:row-span-2">
          <div className="flex flex-wrap items-center gap-2">
            <TierBadge tier={product.tier} showIcon />
            {comingSoon && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-gold/55 bg-[#14110E] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[#F5DFB0]">
                <Icon name="sparkle" className="h-3 w-3 text-brand-gold" />
                Coming Soon
              </span>
            )}
            {(product.badges ?? []).map((badge) => (
              <Chip key={badge} tone="dark">
                {badge}
              </Chip>
            ))}
          </div>

          <p className="mt-4 text-label-sm font-semibold uppercase tracking-[0.16em] text-brand-muted">{product.brand}</p>
          <h1 className="mt-1.5 font-manrope text-[28px] font-semibold leading-tight tracking-tight text-brand-charcoal sm:text-[34px]">
            {product.name}
          </h1>
          {product.tagline && <p className="mt-1.5 font-inter text-body-md font-normal text-brand-muted">{product.tagline}</p>}

          {/* Price block matching sleek modern monochrome luxury PDP */}
          <div className="mt-4">
            <div className="flex flex-wrap items-baseline gap-3">
              {percent > 0 && (
                <span className="font-inter text-[18px] font-normal text-[#C81E1E] line-through sm:text-[20px]">
                  {formatPrice(variant.mrp)}
                </span>
              )}
              <span className="font-inter text-[24px] font-semibold text-brand-charcoal sm:text-[28px]">
                {formatPrice(variant?.price ?? product.price)}
              </span>
              {percent > 0 && (
                <span className="rounded-full bg-[#11100F] px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">
                  {percent}% off
                </span>
              )}
            </div>
            <p className="mt-1 text-body-sm text-brand-muted">
              Inclusive of all taxes
              {percent > 0 && (
                <span className="ml-2 font-semibold text-emerald-700">
                  · Save {formatPrice(variant.mrp - variant.price)}
                </span>
              )}
            </p>
          </div>

          {/* Admin-assigned Occasion badges */}
          {(() => {
            const occasionsList = Array.isArray(product.occasions) && product.occasions.length > 0
              ? product.occasions
              : (Array.isArray(product.collections) ? product.collections.filter((c) => OCCASIONS.some((o) => o.id === c)) : [])
            if (!occasionsList.length) return null
            return (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="text-[12px] font-bold uppercase tracking-wider text-brand-goldDark">
                  Ideal For:
                </span>
                {occasionsList.map((occId) => {
                  const match = OCCASIONS.find((o) => o.id === occId || o.id === String(occId).toLowerCase())
                  const label = match?.label ?? occId
                  return (
                    <Link
                      key={occId}
                      to={`/shop/${occId}`}
                      className="inline-flex items-center rounded-full border border-[#E5D7BF] bg-[#FDF9F2] px-3 py-1 text-[12px] font-semibold text-brand-charcoal transition hover:border-brand-gold hover:text-brand-goldDark"
                    >
                      {label}
                    </Link>
                  )
                })}
              </div>
            )
          })()}

          {/* Minimal 2x2 luxury highlights */}
          <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-2.5 text-body-sm text-ink-variant">
            <span className="flex items-center gap-2">
              <Icon name="clock" className="h-4 w-4 shrink-0 text-brand-charcoal" />
              {product.longevity || 'Long-Lasting Perfumes'}
            </span>
            <span className="flex items-center gap-2">
              <Icon name="spark" className="h-4 w-4 shrink-0 text-brand-charcoal" />
              Fast Shipping
            </span>
            <span className="flex items-center gap-2">
              <Icon name="lock" className="h-4 w-4 shrink-0 text-brand-charcoal" />
              Secure Checkout
            </span>
            <span className="flex items-center gap-2">
              <Icon name="star" className="h-4 w-4 shrink-0 text-brand-charcoal" />
              {product.reviewCount > 0 ? `${product.rating}/5 Star Reviews` : '100% Authentic'}
            </span>
          </div>

          {/* Quality & formulation badges */}
          <div className="mt-5 grid grid-cols-2 gap-2.5 sm:gap-3">
            <div className="flex items-center gap-2.5 rounded-xl bg-[#F5F5F5] px-3 py-2.5 sm:gap-3 sm:px-4 sm:py-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-neutral-300 bg-white text-brand-charcoal sm:h-9 sm:w-9">
                <Icon name="shield" className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </span>
              <span className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.06em] text-brand-charcoal sm:text-[11px] sm:tracking-[0.08em]">
                100% Authentic
              </span>
            </div>
            <div className="flex items-center gap-2.5 rounded-xl bg-[#F5F5F5] px-3 py-2.5 sm:gap-3 sm:px-4 sm:py-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-neutral-300 bg-white text-brand-charcoal sm:h-9 sm:w-9">
                <Icon name="flask" className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </span>
              <span className="whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.06em] text-brand-charcoal sm:text-[11px] sm:tracking-[0.08em]">
                Pure Oils
              </span>
            </div>
          </div>

          {/* Live stock progress bar */}
          {!comingSoon && (soldOut || typeof stockLeft === 'number') && (
            <div className="mt-5">
              <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-brand-charcoal">
                <span
                  className={cn(
                    'inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border',
                    soldOut ? 'border-[#C81E1E]/40' : 'border-neutral-400',
                  )}
                >
                  <span
                    className={cn('h-1.5 w-1.5 rounded-full', soldOut ? 'bg-[#C81E1E]' : 'bg-[#11100F]')}
                  />
                </span>
                {soldOut
                  ? 'OUT OF STOCK ONLINE'
                  : stockLeft <= 25
                    ? `ONLY ${stockLeft} LEFT IN STOCK`
                    : `${stockLeft} IN STOCK — READY TO SHIP`}
              </p>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-neutral-200">
                <div
                  className={cn('h-full rounded-full transition-all duration-500', soldOut ? 'bg-[#C81E1E]' : 'bg-[#11100F]')}
                  style={{
                    width: soldOut ? '100%' : `${Math.min(100, Math.max(15, Math.round((stockLeft / 25) * 100)))}%`,
                  }}
                />
              </div>
            </div>
          )}

          {/* Pill Variant Selector */}
          <div className="mt-6">
            <div className="flex items-center justify-between">
              <p className="text-body-sm font-medium text-brand-muted">
                Variant: <span className="font-semibold text-brand-charcoal">{volume}</span>
              </p>
              <Link to="/pages/size-guide" className="text-[11px] font-semibold uppercase tracking-wider text-brand-charcoal underline-offset-4 hover:underline">
                Size Guide
              </Link>
            </div>
            <div className="mt-3 flex flex-wrap gap-2.5">
              {product.volumes?.map((entry) => {
                const active = entry.size === volume
                return (
                  <button
                    key={entry.size}
                    type="button"
                    onClick={() => setVolume(entry.size)}
                    className={cn(
                      'rounded-full border px-5 py-2 text-body-sm font-semibold uppercase tracking-wide transition',
                      active
                        ? 'border-[#11100F] bg-[#11100F] text-white shadow-sm'
                        : 'border-neutral-300 bg-white text-brand-charcoal hover:border-[#11100F]',
                    )}
                  >
                    {entry.size}
                    {product.volumes.length > 1 && (
                      <span className={cn('ml-2 text-xs font-normal', active ? 'text-white/80' : 'text-brand-muted')}>
                        · {formatPrice(entry.price)}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
            {isFreeDeliveryAll ? (
              <p className="mt-3 flex items-center gap-2 text-body-sm font-medium text-emerald-700">
                <Icon name="truck" className="h-4 w-4" />
                Complimentary Free Delivery Included
              </p>
            ) : qualifiesForFreeDelivery ? (
              <p className="mt-3 flex items-center gap-2 text-body-sm font-medium text-emerald-700">
                <Icon name="truck" className="h-4 w-4" />
                Qualifies for Free Delivery (Orders above {formatPrice(freeShippingOver)})
              </p>
            ) : hasFreeShipping && shippingGap > 0 ? (
              <p className="mt-3 flex items-center gap-2 text-body-sm text-ink-variant">
                <Icon name="truck" className="h-4 w-4 text-brand-charcoal" />
                Standard Delivery: {formatPrice(shippingFee)} (Add {formatPrice(shippingGap)} more for Free Delivery)
              </p>
            ) : shippingFee > 0 ? (
              <p className="mt-3 flex items-center gap-2 text-body-sm font-medium text-brand-charcoal">
                <Icon name="truck" className="h-4 w-4 text-brand-charcoal" />
                Standard Delivery: {formatPrice(shippingFee)}
              </p>
            ) : null}
          </div>

          {/* Quantity + actions */}
          <div className="mt-5 flex items-center gap-2 sm:mt-6 sm:gap-3">
            {!comingSoon && (
              <QuantityStepper
                value={qty}
                onChange={setQuantity}
                max={Math.max(1, maxQuantity)}
                className="shrink-0"
              />
            )}
            <Button
              variant={comingSoon ? 'outline' : 'primary'}
              size="lg"
              className="min-w-0 flex-1 whitespace-nowrap px-4 py-3 text-xs sm:px-7 sm:py-3.5 sm:text-label-md"
              onClick={handleAdd}
              disabled={soldOut || comingSoon}
            >
              <Icon name={comingSoon ? 'sparkle' : 'bag'} className="h-4 w-4 shrink-0" />
              {comingSoon ? 'Coming Soon' : soldOut ? 'Sold Out' : 'Add To Bag'}
            </Button>
            <button
              type="button"
              onClick={() => {
                const added = toggleWishlist(product)
                toast({
                  title: added ? 'Saved to wishlist' : 'Removed from wishlist',
                  description: product.name,
                  tone: 'info',
                })
              }}
              aria-label={saved ? 'Remove from wishlist' : 'Save to wishlist'}
              aria-pressed={saved}
              className={cn(
                'flex h-11 w-11 shrink-0 items-center justify-center rounded border transition shadow-sm sm:h-12 sm:w-12',
                saved
                  ? 'border-red-200 bg-red-50 text-red-500 hover:bg-red-100'
                  : 'border-brand-border text-brand-muted hover:border-brand-gold hover:text-brand-goldDark',
              )}
            >
              <Icon
                name="heart"
                filled={saved}
                className={cn('h-5 w-5 transition-transform active:scale-125', saved ? 'text-red-500 fill-red-500' : 'text-brand-muted')}
              />
            </button>
          </div>

          {!comingSoon && (
            <Button variant="outline" size="lg" className="mt-3 w-full" onClick={handleBuyNow} disabled={soldOut}>
              Buy It Now
              <Icon name="arrow-right" className="h-4 w-4" />
            </Button>
          )}

          <p className="mt-4 flex items-center justify-center gap-2 text-body-sm text-brand-muted">
            <Icon name="lock" className="h-3.5 w-3.5" />
            Secure encrypted checkout · {showcase.codEnabled ? 'UPI, cards, net banking & COD' : 'UPI, cards & net banking'}
          </p>

          {/* Collapsible detail panels */}
          <div className="mt-8 border-t border-brand-border">
            <CollapsiblePanel title="The Composition" icon="notes" defaultOpen>
              <NotePyramid notes={product.notes} />
            </CollapsiblePanel>
            <CollapsiblePanel title="Product & Origin Info" icon="verified">
              <dl className="grid gap-3 sm:grid-cols-2">
                {[
                  ['Tier', product.tier],
                  ['Concentration', product.concentration],
                  ['SKU', product.sku],
                  ['Origin', product.origin],
                  ['Wears best on', product.gender],
                ].map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-3 border-b border-brand-border/60 pb-2">
                    <dt className="text-brand-muted">{label}</dt>
                    <dd className="font-medium text-brand-charcoal">{value}</dd>
                  </div>
                ))}
              </dl>
            </CollapsiblePanel>
            <CollapsiblePanel title="Delivery & Return Policy" icon="truck">
              <p>
                {isFreeDeliveryAll
                  ? 'Complimentary free delivery on all orders, typically 4–6 working days.'
                  : hasFreeShipping
                    ? `Standard delivery is ${formatPrice(shippingFee)}. Free delivery on orders above ${formatPrice(freeShippingOver)}, typically 4–6 working days.`
                    : `Standard delivery is ${formatPrice(shippingFee)}, typically 4–6 working days.`}{' '}
                Express delivery available at checkout. Perfumes travel safely in sealed bubble packaging with a tamper-proof seal.
              </p>
              <div className="mt-3 rounded-md border border-brand-gold/30 bg-brand-gold/5 p-3 text-xs leading-relaxed text-brand-charcoal">
                <span className="font-semibold uppercase tracking-wider text-brand-goldDark">Strict No Return Policy:</span>
                <p className="mt-1">
                  All sales are strictly final. We follow a firm <strong>No Return, No Exchange &amp; No Replacement Policy</strong> once an order is packed or delivered.
                </p>
              </div>
            </CollapsiblePanel>
          </div>
        </div>

        {/* Trust / delivery promise cards — rendered BELOW price & details on phones, under gallery on desktop */}
        <ul className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:col-start-1 lg:row-start-2 lg:self-start">
          {deliveryPromise.map((item) => (
            <li
              key={item.title}
              className="flex items-start gap-2 rounded-xl border border-brand-border bg-white p-3 sm:gap-2.5 sm:p-3.5"
            >
              <Icon name={item.icon} className="mt-0.5 h-4 w-4 shrink-0 text-brand-charcoal" />
              <span className="min-w-0">
                <span className="block text-[12px] font-semibold leading-snug text-brand-charcoal sm:text-body-sm">
                  {item.title}
                </span>
                <span className="mt-0.5 block text-[11px] leading-snug text-brand-muted sm:text-xs">
                  {item.note}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* Tabs: description, reviews, shipping */}
      <section className="shell py-10">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { id: 'description', label: 'Description', icon: 'notes' },
            { id: 'notes', label: 'Note Pyramid', icon: 'flower' },
            { id: 'reviews', label: 'Reviews', icon: 'star', count: reviews.length },
          ]}
        />

        <div className="pt-8">
          {tab === 'description' && (
            <div className="max-w-3xl">
              <p className="font-inter text-body-lg font-normal leading-relaxed text-ink-variant">{product.description}</p>
              <p className="mt-5 font-inter text-body-md font-normal leading-relaxed text-brand-muted">
                {product.tier === 'Original'
                  ? 'This is an authentic branded bottle, sourced directly through official distributors. We do not refill or reseal original bottles.'
                  : 'Our perfumers recreate this scent from pure French oils at up to 40% oil concentration — a unique blend that smells close to the one you already know.'}
              </p>
            </div>
          )}

          {tab === 'notes' && (
            <div className="max-w-4xl">
              <NotePyramid notes={product.notes} />
            </div>
          )}

          {tab === 'reviews' && (
            <div className="grid gap-10 lg:grid-cols-[18rem_1fr]">
              <div>
                <div className="card-surface p-6 text-center">
                  <p className="font-serif text-4xl font-semibold text-brand-charcoal">{product.rating.toFixed(1)}</p>
                  <div className="mt-2 flex justify-center">
                    <Rating value={product.rating} size="md" showValue={false} />
                  </div>
                  <p className="mt-2 text-body-sm text-brand-muted">{product.reviewCount} verified reviews</p>
                </div>
                <div className="mt-5">
                  <RatingBreakdown rows={breakdown} />
                </div>
              </div>

              <div>
                {reviews.length === 0 ? (
                  <EmptyState
                    icon="star"
                    title="No reviews yet"
                    description="Be the first to review this fragrance once your order arrives."
                    className="py-10"
                  />
                ) : (
                  reviews.map((review) => <ReviewCard key={review.id} review={review} />)
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Related */}
      {related.length > 0 && (
        <section className="shell py-10">
          <SectionHeading title="You May Also Like" />
          <ProductRail className="mt-7" products={related} onAdd={onAdd} />
        </section>
      )}

      {alsoViewed.length > 0 && (
        <section className="shell py-10">
          <SectionHeading title="Recently Viewed" />
          <ProductRail className="mt-7" products={alsoViewed} onAdd={onAdd} />
        </section>
      )}
    </div>
  )
}

export default ProductDetailPage
