import { useMemo, useRef } from 'react'
import { Link } from '@/components/ui/AppLink'
import { formatPrice, discountPercent } from '@/lib/format'
import useCartStore from '@/store/cartStore'
import useWishlistStore from '@/store/wishlistStore'
import useUiStore, { toast } from '@/store/uiStore'
import { Icon } from '@/components/ui/Icon'
import { Button } from '@/components/ui/Button'
import { Breadcrumbs } from '@/components/ui/SectionHeading'
import { Rating } from '@/components/ui/Rating'
import { EmptyState } from '@/components/ui/Feedback'
import { TierBadge } from '@/components/ui/Badge'
import { FlaconStage } from '@/components/product/FlaconArt'
import { productImage } from '@/data/productImages'
import { ProductRail } from '@/components/product/ProductCard'
import { useShopActions } from '@/components/home/Showcase'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { useBestsellers, useCatalogueProducts, useCatalogueStore } from '@/store/catalogueStore'

export function WishlistPage() {
  useDocumentTitle('My Wishlist')

  const items = useWishlistStore((state) => state.items)
  const remove = useWishlistStore((state) => state.remove)
  const clear = useWishlistStore((state) => state.clear)
  const addItem = useCartStore((state) => state.addItem)
  const openCartDrawer = useUiStore((state) => state.openCartDrawer)
  const { onAdd } = useShopActions()
  // From the live catalogue: a rail that recommends a fragrance the shop no
  // longer stocks is a broken link with a friendly face.
  const bestsellers = useBestsellers()
  const catalogue = useCatalogueProducts()
  const byId = useCatalogueStore((state) => state.byId)
  const lastAddRef = useRef(0)

  // Exclude fragrances already saved in the wishlist (by id or slug) so
  // "Complete The Collection" never recommends something already saved above.
  const suggestions = useMemo(() => {
    const savedIds = new Set(items.map((item) => String(item.productId ?? item.id ?? '')).filter(Boolean))
    const savedSlugs = new Set(items.map((item) => item.slug).filter(Boolean))
    const eligible = (p) =>
      p.inStock !== false &&
      !savedIds.has(String(p.id ?? p._id ?? '')) &&
      !savedSlugs.has(p.slug)

    const picked = bestsellers.filter(eligible)
    if (picked.length < 6) {
      const seen = new Set(picked.map((p) => p.id))
      for (const p of catalogue) {
        if (!seen.has(p.id) && eligible(p)) {
          picked.push(p)
          seen.add(p.id)
          if (picked.length >= 6) break
        }
      }
    }
    return picked.slice(0, 6)
  }, [items, bestsellers, catalogue])

  if (items.length === 0) {
    return (
      <div className="shell py-16">
        <EmptyState
          icon="heart"
          title="Your wishlist is empty"
          actionLabel="Browse Fragrances"
          actionTo="/shop"
        />

        {bestsellers.length > 0 && (
          <div className="mt-16">
            <h2 className="text-label-md font-bold uppercase tracking-widest text-brand-charcoal">
              Customers Also Love
            </h2>
            <ProductRail className="mt-5" products={bestsellers.slice(0, 6)} onAdd={onAdd} />
          </div>
        )}
      </div>
    )
  }

  const totalValue = items.reduce((sum, item) => sum + item.price, 0)
  const totalSavings = items.reduce((sum, item) => sum + Math.max(0, (item.mrp ?? item.price) - item.price), 0)
  const inStockItems = items.filter((item) => (byId[item.productId]?.inStock ?? item.inStock) !== false)

  const handleAddSingle = (item) => {
    const live = byId[item.productId]
    if ((live?.inStock ?? item.inStock) === false) return
    const now = Date.now()
    if (now - lastAddRef.current < 450) return
    lastAddRef.current = now
    addItem(live ?? item)
    toast({ title: 'Added to bag', description: item.name })
    openCartDrawer()
  }

  const handleAddAll = () => {
    if (!inStockItems.length) return
    const now = Date.now()
    if (now - lastAddRef.current < 450) return
    lastAddRef.current = now
    inStockItems.forEach((item) => addItem(byId[item.productId] ?? item))
    toast({ title: `${inStockItems.length} added to bag`, description: 'Available fragrances from your wishlist are in the bag.' })
    openCartDrawer()
  }

  return (
    <div className="shell py-8 lg:py-12">
      <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'Wishlist' }]} className="mb-6" />

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-medium text-brand-charcoal lg:text-headline-xl">My Wishlist</h1>
          <p className="mt-2 text-body-md text-brand-muted">
            {items.length} {items.length === 1 ? 'fragrance' : 'fragrances'} saved ·{' '}
            {formatPrice(totalValue)} total
            {totalSavings > 0 && (
              <>
                {' '}
                · <span className="font-semibold text-emerald-700">{formatPrice(totalSavings)} in savings</span>
              </>
            )}
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button
            variant="primary"
            disabled={inStockItems.length === 0}
            onClick={handleAddAll}
          >
            <Icon name="bag" className="h-4 w-4" />
            Add All To Bag
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              clear()
              toast({ title: 'Wishlist cleared', tone: 'info' })
            }}
          >
            Clear
          </Button>
        </div>
      </div>

      <ul className="mt-8 space-y-4">
        {items.map((item) => {
          const percent = discountPercent(item.mrp, item.price)
          return (
            <li key={item.productId} className="card-surface flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:gap-6 sm:p-5">
              <Link to={`/product/${item.slug}`} className="w-full shrink-0 sm:w-28">
                <FlaconStage tier={item.tier} seed={item.slug} label={item.name} image={productImage(item)} compact />
              </Link>

              <div className="min-w-0 flex-1">
                <TierBadge tier={item.tier} size="sm" />
                <h2 className="mt-2 text-body-lg font-semibold text-brand-charcoal">
                  <Link to={`/product/${item.slug}`} className="transition-colors hover:text-brand-goldDark">
                    {item.name}
                  </Link>
                </h2>
                <p className="mt-0.5 text-body-sm text-brand-muted">
                  {item.brand} · {item.volume}
                </p>
                <div className="mt-2">
                  <Rating value={item.rating ?? 0} count={item.reviewCount} size="sm" />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-4 sm:flex-col sm:items-end">
                <div className="text-right">
                  <p className="text-body-lg font-bold text-brand-charcoal">{formatPrice(item.price)}</p>
                  {percent > 0 && (
                    <p className="text-body-sm">
                      <span className="font-medium text-[#C81E1E] line-through">{formatPrice(item.mrp)}</span>{' '}
                      <span className="font-semibold text-emerald-700">{percent}% off</span>
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={(byId[item.productId]?.inStock ?? item.inStock) === false}
                    onClick={() => handleAddSingle(item)}
                  >
                    <Icon name="bag" className="h-3.5 w-3.5" />
                    {(byId[item.productId]?.inStock ?? item.inStock) === false ? 'Sold Out' : 'Add To Bag'}
                  </Button>
                  <button
                    type="button"
                    onClick={() => {
                      remove(item.productId)
                      toast({ title: 'Removed from wishlist', description: item.name, tone: 'info' })
                    }}
                    aria-label={`Remove ${item.name} from wishlist`}
                    className="flex h-9 w-9 items-center justify-center rounded border border-brand-border text-brand-muted transition hover:border-tier-original hover:text-tier-original"
                  >
                    <Icon name="trash" className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </li>
          )
        })}
      </ul>

      {suggestions.length > 0 && (
        <div className="mt-14">
          <h2 className="text-label-md font-bold uppercase tracking-widest text-brand-charcoal">
            Complete The Collection
          </h2>
          <ProductRail className="mt-5" products={suggestions} onAdd={onAdd} />
        </div>
      )}
    </div>
  )
}

export default WishlistPage
