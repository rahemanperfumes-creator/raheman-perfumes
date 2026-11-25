import { useRef, useState } from 'react'
import { Link } from '@/components/ui/AppLink'
import cn from '@/lib/cn'
import { formatPrice, discountPercent } from '@/lib/format'
import { FLAGS } from '@/data/tiers'
import { Icon } from '@/components/ui/Icon'
import { TierBadge } from '@/components/ui/Badge'
import { Rating } from '@/components/ui/Rating'
import { productImage, productHoverImage } from '@/data/productImages'
import { FlaconStage, OutOfStockBadge } from './FlaconArt'
import { QuickViewModal } from './QuickViewModal'
import useWishlistStore from '@/store/wishlistStore'
import { toast } from '@/store/uiStore'

/**
 * Product tile.
 *
 * `variant="grid"` is the minimalist catalogue card; `"list"` is the horizontal
 * row used by the list view toggle; `"compact"` is the narrow rail card used by
 * carousels and cross-sell strips.
 */
export function ProductCard({
  product,
  variant = 'grid',
  showTier = false,
  onAdd,
  onToggleWishlist,
  isWishlisted,
  className,
}) {
  const lastAddRef = useRef(0)
  const [quickOpen, setQuickOpen] = useState(false)
  const wishlistToggle = useWishlistStore((state) => state.toggle)

  // Reactively subscribe to whether this specific product is in the wishlist
  const isWishlistStored = useWishlistStore((state) => {
    const id = String(product?.id ?? product?._id ?? '')
    return Boolean(id) && state.items.some((item) => String(item.productId ?? item.id ?? '') === id)
  })

  if (!product) return null

  const { slug, name, brand, tier, price, mrp, rating, reviewCount, volumes, concentration, badges = [] } = product
  const comingSoon = Boolean(product.comingSoon || product.status === 'Draft')
  const soldOut = !comingSoon && (product.inStock === false || product.stockLeft === 0)
  const percent = comingSoon ? 0 : discountPercent(mrp, price)
  const flag = badges.find((badge) => FLAGS[badge])
  const defaultVolume = volumes?.[0]?.size
  const image = productImage(product)
  const hoverImage = productHoverImage(product)

  // Live store state takes priority, with fallback to explicit prop
  const isItemWishlisted = isWishlistStored || Boolean(isWishlisted && typeof isWishlisted === 'boolean')

  const handleAdd = (event) => {
    event.preventDefault()
    event.stopPropagation()
    if (soldOut || comingSoon) return
    const now = Date.now()
    if (now - lastAddRef.current < 450) return
    lastAddRef.current = now
    onAdd?.(product)
  }

  const handleQuickView = (event) => {
    event.preventDefault()
    event.stopPropagation()
    setQuickOpen(true)
  }

  const handleWishlist = (event) => {
    event.preventDefault()
    event.stopPropagation()
    if (onToggleWishlist) {
      onToggleWishlist(product)
    } else {
      const added = wishlistToggle(product)
      toast({
        title: added ? 'Saved to wishlist' : 'Removed from wishlist',
        description: product.name,
        tone: 'info',
      })
    }
  }

  const WishlistButton = (
    <button
      type="button"
      onClick={handleWishlist}
      onMouseDown={(event) => {
        event.preventDefault()
        event.stopPropagation()
      }}
      onPointerDown={(event) => {
        event.stopPropagation()
      }}
      onTouchStart={(event) => {
        event.stopPropagation()
      }}
      aria-label={isItemWishlisted ? `Remove ${name} from wishlist` : `Save ${name} to wishlist`}
      aria-pressed={isItemWishlisted}
      className={cn(
        'relative z-30 pointer-events-auto flex h-8 w-8 items-center justify-center rounded-full border shadow-sm backdrop-blur transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-red-400',
        isItemWishlisted
          ? 'border-red-200 bg-white text-red-500 shadow-md hover:bg-red-50'
          : 'border-brand-border bg-white/95 text-brand-muted hover:border-brand-gold hover:bg-white hover:text-brand-goldDark',
      )}
    >
      <Icon
        name="heart"
        filled={isItemWishlisted}
        className={cn(
          'h-4 w-4 transition-transform active:scale-125',
          isItemWishlisted ? 'text-red-500 fill-red-500' : 'text-brand-muted',
        )}
      />
    </button>
  )

  // ---------------------------------------------------------------- list row
  if (variant === 'list') {
    return (
      <article className={cn('card-surface card-lift group flex gap-4 p-4 sm:gap-6 sm:p-5', className)}>
        <Link to={`/product/${slug}`} className="relative block w-28 shrink-0 sm:w-36">
          <FlaconStage tier={tier} seed={slug} label={name} image={image} hoverImage={hoverImage} compact />
          {soldOut && <OutOfStockBadge compact />}
        </Link>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <TierBadge tier={tier} size="sm" />
                {flag && (
                  <span className={cn('rounded-full px-2 py-0.5 text-label-sm font-bold uppercase', FLAGS[flag].className)}>
                    {FLAGS[flag].label}
                  </span>
                )}
              </div>
              <p className="truncate text-label-sm font-bold uppercase text-brand-muted">{brand}</p>
              <h3 className="mt-1 truncate font-manrope text-headline-sm font-semibold text-brand-charcoal">
                <Link to={`/product/${slug}`} className="transition-colors hover:text-brand-goldDark">
                  {name}
                </Link>
              </h3>
            </div>
            {WishlistButton}
          </div>

          <p className="mt-2 line-clamp-2 font-inter text-[14px] font-normal leading-relaxed text-brand-muted">
            {[concentration, defaultVolume, ...(product.notes?.top ?? []).slice(0, 2)].filter(Boolean).join(' • ')}
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
            <Rating value={rating} count={reviewCount} size="sm" />
            {product.longevity && (
              <span className="flex items-center gap-1.5 text-body-sm text-brand-muted">
                <Icon name="clock" className="h-3.5 w-3.5" />
                {product.longevity}
              </span>
            )}
          </div>

          <div className="mt-auto flex flex-wrap items-end justify-between gap-3 pt-4">
            <div className="flex flex-wrap items-baseline gap-2">
              {percent > 0 && (
                <span className="font-inter text-body-sm font-normal text-[#C81E1E] line-through">{formatPrice(mrp)}</span>
              )}
              <span className="font-inter text-headline-sm font-semibold text-brand-charcoal">{formatPrice(price)}</span>
              {percent > 0 && (
                <span className="text-label-sm font-bold uppercase text-emerald-700">{percent}% OFF</span>
              )}
            </div>
            {soldOut ? (
              <button
                type="button"
                disabled
                className="btn btn-outline btn-sm cursor-not-allowed opacity-70"
              >
                Out of Stock
              </button>
            ) : (
              <button type="button" onClick={handleAdd} className="btn btn-primary btn-sm">
                <Icon name="bag" className="h-3.5 w-3.5" />
                Add To Bag
              </button>
            )}
          </div>
        </div>
      </article>
    )
  }

  // ------------------------------------------------------------- compact rail
  if (variant === 'compact') {
    return (
      <article className={cn('card-surface card-lift group w-[190px] shrink-0 overflow-hidden p-3', className)}>
        <Link to={`/product/${slug}`} className="relative block">
          <FlaconStage tier={tier} seed={slug} label={name} image={image} hoverImage={hoverImage} compact />
          {soldOut && <OutOfStockBadge compact />}
          <div className="absolute left-2 top-2">
            <TierBadge tier={tier} size="sm" />
          </div>
        </Link>
        <div className="pt-3">
          <h3 className="truncate font-manrope text-body-md font-semibold text-brand-charcoal">
            <Link to={`/product/${slug}`} className="transition-colors hover:text-brand-goldDark">
              {name}
            </Link>
          </h3>
          <p className="mt-0.5 truncate text-body-sm text-brand-muted">{defaultVolume ?? concentration}</p>
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="font-inter text-body-md font-semibold text-brand-charcoal">{formatPrice(price)}</span>
            <button
              type="button"
              onClick={handleAdd}
              disabled={soldOut}
              aria-label={soldOut ? `${name} is out of stock` : `Add ${name} to bag`}
              className={cn(
                'flex h-7 w-7 items-center justify-center rounded-full transition',
                soldOut
                  ? 'cursor-not-allowed border border-brand-border bg-white text-brand-muted opacity-50'
                  : 'bg-brand-charcoal text-brand-ivory hover:bg-brand-goldDark',
              )}
            >
              <Icon name="plus" className="h-3.5 w-3.5" strokeWidth={2.5} />
            </button>
          </div>
        </div>
      </article>
    )
  }

  // -------------------------------------------------------------- grid card
  return (
    <>
      <article
        className={cn(
          'group relative flex h-full w-full flex-col rounded-xl border border-[#EFE3CF] bg-gradient-to-b from-white via-[#FFFDF9] to-[#FDF6EB]/90 p-3 shadow-card transition-all duration-300 hover:-translate-y-1.5 hover:border-brand-gold/70 hover:shadow-[0_18px_38px_-12px_rgba(200,155,60,0.26)]',
          className,
        )}
      >
        <div className="relative overflow-hidden rounded-lg border border-[#F3E9D8] bg-gradient-to-br from-[#FFFDF9] via-[#FDF4F6] to-[#FBF1E1]">
          <Link to={`/product/${slug}`} className="block">
            <FlaconStage
              tier={tier}
              seed={slug}
              label={name}
              sublabel={concentration}
              volume={defaultVolume}
              image={image}
              hoverImage={hoverImage}
              aspect="square"
              frameless
            />
          </Link>

          {showTier && tier && (
            <div className="pointer-events-none absolute left-2.5 top-2.5 z-20">
              <TierBadge tier={tier} size="sm" />
            </div>
          )}

          {comingSoon ? (
            <span className="pointer-events-none absolute bottom-2.5 left-2.5 z-20 rounded-full border border-brand-gold/55 bg-[#14110E]/85 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#F5DFB0] shadow-sm backdrop-blur-sm">
              Coming Soon
            </span>
          ) : (
            percent > 0 && (
              <span className="pointer-events-none absolute bottom-2.5 left-2.5 z-20 rounded-full border border-brand-gold/45 bg-gradient-to-r from-[#FFFDF9] to-[#FBF0DA] px-2.5 py-0.5 text-[11px] font-semibold tracking-tight text-brand-charcoal shadow-sm">
                − {percent}%
              </span>
            )
          )}

          {soldOut && <OutOfStockBadge />}

          {/* Wishlist toggle (top-right; appears smoothly on hover or stays visible when saved) */}
          <div
            className={cn(
              'pointer-events-auto absolute right-2.5 top-2.5 z-30 transition-all duration-200',
              isItemWishlisted
                ? 'scale-100 opacity-100'
                : 'opacity-90 sm:scale-95 sm:opacity-0 sm:group-hover:scale-100 sm:group-hover:opacity-100 sm:group-focus-within:scale-100 sm:group-focus-within:opacity-100',
            )}
          >
            {WishlistButton}
          </div>

          {/* Hover action pills bottom-right: Add to Bag (hidden for Coming Soon drafts) & Quick View Eye */}
          <div className="pointer-events-none absolute bottom-2.5 right-2.5 z-30 flex translate-y-1.5 items-center gap-2 opacity-100 transition-all duration-300 sm:opacity-0 sm:group-hover:translate-y-0 sm:group-hover:opacity-100 sm:group-focus-within:translate-y-0 sm:group-focus-within:opacity-100">
            {!comingSoon && (
              <button
                type="button"
                onClick={handleAdd}
                onMouseDown={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                }}
                disabled={soldOut}
                aria-label={soldOut ? `${name} is out of stock` : `Add ${name} to bag`}
                title={soldOut ? 'Out of stock' : 'Add to bag'}
                className={cn(
                  'pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full border border-neutral-200 bg-white/95 text-brand-charcoal shadow-md backdrop-blur-sm transition duration-200',
                  soldOut
                    ? 'cursor-not-allowed opacity-55'
                    : 'hover:scale-105 hover:border-brand-charcoal hover:bg-brand-charcoal hover:text-white active:scale-95',
                )}
              >
                <Icon name="bag" className="h-[16px] w-[16px]" strokeWidth={1.75} />
              </button>
            )}

            <button
              type="button"
              onClick={handleQuickView}
              onMouseDown={(event) => {
                event.preventDefault()
                event.stopPropagation()
              }}
              aria-label={`Quick view ${name}`}
              title="Quick view"
              className="pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full border border-neutral-200 bg-white/95 text-brand-charcoal shadow-md backdrop-blur-sm transition duration-200 hover:scale-105 hover:border-brand-charcoal hover:bg-brand-charcoal hover:text-white active:scale-95"
            >
              <Icon name="eye" className="h-[16px] w-[16px]" strokeWidth={1.75} />
            </button>
          </div>
        </div>

        <div className="flex flex-1 flex-col pt-3 text-left">
          <h3 className="truncate font-manrope text-[15px] font-semibold leading-snug text-brand-charcoal sm:text-[15.5px]">
            <Link
              to={`/product/${slug}`}
              className="decoration-1 underline-offset-4 transition-colors group-hover:underline"
            >
              {name}
            </Link>
          </h3>

          <div className="mt-1 flex flex-wrap items-baseline gap-2">
            {comingSoon ? (
              price > 0 ? (
                <span className="font-inter text-[14.5px] font-medium text-brand-muted">{formatPrice(price)}</span>
              ) : (
                <span className="font-inter text-[13.5px] font-medium text-brand-goldDark">Launching Soon</span>
              )
            ) : (
              <>
                {percent > 0 && (
                  <span className="font-inter text-[12.5px] font-normal text-[#C81E1E] line-through">{formatPrice(mrp)}</span>
                )}
                <span className="font-inter text-[15px] font-semibold text-brand-charcoal sm:text-[15.5px]">{formatPrice(price)}</span>
              </>
            )}
          </div>

          <div className="mt-1 h-4">
            {comingSoon ? (
              <p className="text-[11px] font-medium leading-4 text-brand-goldDark">Coming Soon</p>
            ) : (
              !soldOut && typeof product.stockLeft === 'number' && product.stockLeft <= 5 && (
                <p className="text-[11px] font-medium leading-4 text-brand-goldDark">Only {product.stockLeft} left</p>
              )
            )}
          </div>
        </div>
      </article>

      <QuickViewModal
        open={quickOpen}
        onClose={() => setQuickOpen(false)}
        product={product}
        soldOut={soldOut}
        onAdd={onAdd}
        isWishlisted={isItemWishlisted}
        onToggleWishlist={handleWishlist}
      />
    </>
  )
}

/** Responsive product grid — supports 2, 3, 4, 5, or 6 items per row. */
export function ProductGrid({ products = [], columns = 5, variant = 'grid', showTier = true, onAdd, onToggleWishlist, isWishlisted, className }) {
  const colClass = {
    2: 'grid-cols-2',
    3: 'grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4',
    5: 'grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5',
    6: 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6',
  }[columns] ?? 'grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'

  const gapClass = columns === 6 ? 'gap-3.5 sm:gap-4' : 'gap-5'

  if (variant === 'list') {
    return (
      <div className={cn('space-y-4', className)}>
        {products.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            variant="list"
            onAdd={onAdd}
            onToggleWishlist={onToggleWishlist}
            isWishlisted={typeof isWishlisted === 'function' ? isWishlisted(product.id) : isWishlisted}
          />
        ))}
      </div>
    )
  }

  return (
    <div className={cn('grid items-stretch', colClass, gapClass, className)}>
      {products.map((product) => (
        <ProductCard
          key={product.id}
          product={product}
          variant={variant}
          showTier={showTier}
          onAdd={onAdd}
          onToggleWishlist={onToggleWishlist}
          isWishlisted={typeof isWishlisted === 'function' ? isWishlisted(product.id) : isWishlisted}
        />
      ))}
    </div>
  )
}

/** Horizontally scrolling rail matching the exact Bestsellers card dimensions. */
export function ProductRail({ products = [], onAdd, onToggleWishlist, isWishlisted, className }) {
  if (!products.length) return null
  return (
    <div className={cn('no-scrollbar flex snap-x snap-mandatory items-stretch gap-5 overflow-x-auto pb-3 pt-1 scroll-smooth', className)}>
      {products.map((product) => (
        <div
          key={product.id}
          className="flex w-[78%] shrink-0 snap-start sm:w-[calc((100%-1.25rem)/2)] md:w-[calc((100%-2.5rem)/3)] lg:w-[calc((100%-3.75rem)/4)] xl:w-[calc((100%-5rem)/5)]"
        >
          <ProductCard
            product={product}
            showTier
            onAdd={onAdd}
            onToggleWishlist={onToggleWishlist}
            isWishlisted={typeof isWishlisted === 'function' ? isWishlisted(product.id) : isWishlisted}
          />
        </div>
      ))}
    </div>
  )
}

export default ProductCard
