import { useEffect, useState } from 'react'
import { Link } from '@/components/ui/AppLink'
import cn from '@/lib/cn'
import { formatPrice, discountPercent } from '@/lib/format'
import { Modal } from '@/components/ui/Modal'
import { Icon } from '@/components/ui/Icon'
import { Button } from '@/components/ui/Button'
import { TierBadge } from '@/components/ui/Badge'
import { Rating } from '@/components/ui/Rating'
import { FlaconStage, OutOfStockBadge } from './FlaconArt'
import { productGallery, productImage } from '@/data/productImages'
import useCartStore from '@/store/cartStore'
import useUiStore, { toast } from '@/store/uiStore'

/**
 * Quick preview dialog opened from the hover eye button on a product card.
 */
export function QuickViewModal({
  open,
  onClose,
  product,
  soldOut = false,
  onAdd,
  isWishlisted = false,
  onToggleWishlist,
}) {
  const addItem = useCartStore((state) => state.addItem)
  const openCartDrawer = useUiStore((state) => state.openCartDrawer)
  const volumes = product?.volumes ?? []
  const [selectedVolume, setSelectedVolume] = useState(volumes[0]?.size ?? null)
  const [activeImage, setActiveImage] = useState(0)

  useEffect(() => {
    setSelectedVolume(product?.volumes?.[0]?.size ?? null)
    setActiveImage(0)
  }, [product?.id, product?.volumes])

  if (!product) return null

  const gallery = productGallery(product)
  const selectedImageIndex = activeImage < gallery.length ? activeImage : 0
  const currentImage = gallery[selectedImageIndex] ?? productImage(product)
  const hasMultipleImages = gallery.length > 1
  const showPrevImage = () => setActiveImage((selectedImageIndex - 1 + gallery.length) % gallery.length)
  const showNextImage = () => setActiveImage((selectedImageIndex + 1) % gallery.length)

  const activeVariant = volumes.find((v) => v.size === selectedVolume) ?? volumes[0]
  const unitPrice = activeVariant?.price ?? product.price
  const unitMrp = activeVariant?.mrp ?? product.mrp ?? unitPrice
  const percent = discountPercent(unitMrp, unitPrice)
  const allNotes = [...(product.notes?.top ?? []), ...(product.notes?.heart ?? []), ...(product.notes?.base ?? [])]

  const handleBagAdd = () => {
    if (soldOut) return
    if (!activeVariant || (activeVariant.size === volumes[0]?.size && onAdd)) {
      if (onAdd) {
        onAdd(product)
      } else {
        addItem(product)
        toast({ title: 'Added to bag', description: product.name })
        openCartDrawer()
      }
    } else {
      addItem(product, {
        volume: activeVariant.size,
        price: activeVariant.price,
        mrp: activeVariant.mrp,
      })
      toast({ title: 'Added to bag', description: `${product.name} · ${activeVariant.size}` })
      openCartDrawer()
    }
    onClose?.()
  }

  return (
    <Modal open={open} onClose={onClose} size="lg" title={product.name}>
      <div className="grid gap-6 sm:grid-cols-[0.9fr_1.1fr]">
        <div className="group relative overflow-hidden rounded-lg">
          <FlaconStage
            tier={product.tier}
            seed={product.slug}
            label={product.name}
            sublabel={product.concentration}
            volume={activeVariant?.size}
            image={currentImage}
            aspect="square"
            frameless
          />
          {hasMultipleImages && (
            <>
              <button
                type="button"
                onClick={showPrevImage}
                aria-label="Previous product image"
                className="absolute left-1 top-1/2 z-20 flex h-14 w-10 -translate-y-1/2 items-center justify-center bg-transparent text-white/90 [filter:drop-shadow(0_1px_2px_rgba(0,0,0,0.8))_drop-shadow(0_0_1px_rgba(0,0,0,0.65))] transition-all duration-200 hover:scale-110 hover:text-brand-gold active:scale-95 lg:opacity-0 lg:group-hover:opacity-100 lg:focus-visible:opacity-100"
              >
                <Icon name="chevron-left" className="h-6 w-6" strokeWidth={2.2} />
              </button>
              <button
                type="button"
                onClick={showNextImage}
                aria-label="Next product image"
                className="absolute right-1 top-1/2 z-20 flex h-14 w-10 -translate-y-1/2 items-center justify-center bg-transparent text-white/90 [filter:drop-shadow(0_1px_2px_rgba(0,0,0,0.8))_drop-shadow(0_0_1px_rgba(0,0,0,0.65))] transition-all duration-200 hover:scale-110 hover:text-brand-gold active:scale-95 lg:opacity-0 lg:group-hover:opacity-100 lg:focus-visible:opacity-100"
              >
                <Icon name="chevron-right" className="h-6 w-6" strokeWidth={2.2} />
              </button>
              <span className="pointer-events-none absolute bottom-2.5 right-2.5 z-20 rounded-full bg-brand-charcoal/75 px-2 py-0.5 text-[10px] font-medium tabular-nums text-white backdrop-blur-sm transition-opacity duration-200 lg:opacity-0 lg:group-hover:opacity-100">
                {selectedImageIndex + 1} / {gallery.length}
              </span>
            </>
          )}
          {soldOut && <OutOfStockBadge />}
        </div>

        <div className="flex flex-col">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-brand-muted">{product.brand}</p>
            <TierBadge tier={product.tier} size="sm" />
          </div>

          <h3 className="mt-1 font-manrope text-2xl font-semibold text-brand-charcoal">{product.name}</h3>
          {product.concentration && (
            <p className="mt-0.5 font-inter text-body-sm font-normal text-brand-muted">{product.concentration}</p>
          )}

          <div className="mt-2 flex items-center gap-2">
            <Rating value={product.rating} showValue={false} size="sm" />
            <span className="text-body-sm text-ink-variant">
              {product.reviewCount ?? 0} {product.reviewCount === 1 ? 'review' : 'reviews'}
            </span>
          </div>

          <div className="mt-4 flex items-baseline gap-2.5">
            {percent > 0 && (
              <span className="font-inter text-base font-normal text-[#C81E1E] line-through">{formatPrice(unitMrp)}</span>
            )}
            <span className="font-inter text-headline-md font-semibold text-brand-charcoal">{formatPrice(unitPrice)}</span>
            {percent > 0 && (
              <span className="text-label-sm font-bold uppercase text-emerald-700">{percent}% OFF</span>
            )}
          </div>

          {product.description && (
            <p className="mt-3 line-clamp-3 font-inter text-body-sm font-normal leading-relaxed text-ink-variant">{product.description}</p>
          )}

          {allNotes.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {allNotes.slice(0, 6).map((note) => (
                <span
                  key={note}
                  className="rounded-full border border-brand-border bg-white px-3 py-1 font-inter text-[14px] font-normal text-brand-charcoal shadow-xs"
                >
                  {note}
                </span>
              ))}
            </div>
          )}

          {volumes.length > 0 && (
            <div className="mt-5">
              <p className="text-body-sm font-medium text-brand-muted">
                Variant: <span className="font-semibold text-brand-charcoal">{activeVariant?.size ?? volumes[0]?.size}</span>
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {volumes.map((v) => {
                  const active = (activeVariant?.size ?? volumes[0]?.size) === v.size
                  return (
                    <button
                      key={v.size}
                      type="button"
                      onClick={() => setSelectedVolume(v.size)}
                      className={cn(
                        'rounded-full border px-4 py-1.5 text-body-sm font-semibold uppercase tracking-wide transition',
                        active
                          ? 'border-brand-charcoal bg-brand-charcoal text-white'
                          : 'border-neutral-300 bg-white text-brand-charcoal hover:border-brand-charcoal',
                      )}
                    >
                      {v.size}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-brand-border/70 pt-5">
            {product.comingSoon || product.status === 'Draft' ? (
              <Button variant="outline" disabled className="flex-1 cursor-not-allowed">
                <Icon name="sparkle" className="h-4 w-4 text-brand-goldDark" />
                Coming Soon
              </Button>
            ) : (
              <Button
                variant={soldOut ? 'outline' : 'primary'}
                disabled={soldOut}
                onClick={handleBagAdd}
                className="flex-1"
              >
                <Icon name="bag" className="h-4 w-4" />
                {soldOut ? 'Out of Stock' : 'Add To Bag'}
              </Button>
            )}
            {onToggleWishlist && (
              <button
                type="button"
                onClick={onToggleWishlist}
                aria-label={isWishlisted ? `Remove ${product.name} from wishlist` : `Save ${product.name} to wishlist`}
                aria-pressed={isWishlisted}
                className={cn(
                  'flex h-10 w-10 items-center justify-center rounded border transition',
                  isWishlisted
                    ? 'border-red-200 bg-red-50 text-red-500'
                    : 'border-brand-border bg-white text-brand-muted hover:border-brand-gold hover:text-brand-goldDark',
                )}
              >
                <Icon name="heart" filled={isWishlisted} className="h-4 w-4" />
              </button>
            )}
          </div>

          <Link
            to={`/product/${product.slug}`}
            onClick={onClose}
            className="mt-4 inline-flex items-center gap-1.5 self-start text-body-sm font-medium text-brand-goldDark underline underline-offset-4 hover:text-brand-charcoal"
          >
            View full fragrance details
            <Icon name="arrow-right" className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </Modal>
  )
}

export default QuickViewModal
