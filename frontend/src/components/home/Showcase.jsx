import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import cn from '@/lib/cn'
import useCartStore from '@/store/cartStore'
import useWishlistStore from '@/store/wishlistStore'
import useUiStore, { toast } from '@/store/uiStore'
import { Icon } from '@/components/ui/Icon'
import { Button } from '@/components/ui/Button'
import { SectionHeading } from '@/components/ui/SectionHeading'
import { ProductCard } from '@/components/product/ProductCard'
import {
  useBestsellers,
  useCatalogueProducts,
  useComingSoon,
  useShowcase,
  useShowcaseProducts,
} from '@/store/catalogueStore'
import { Link } from '@/components/ui/AppLink'
import { WHY_SHOP, SHOP_NOTES } from '@/data/content'

/** Tracks horizontal overflow and provides smooth step sliding for single-row shelves. */
function useRowSlider(itemCount) {
  const trackRef = useRef(null)
  const [state, setState] = useState({ canPrev: false, canNext: false })

  const sync = useCallback(() => {
    const el = trackRef.current
    if (!el) return
    const { scrollLeft, scrollWidth, clientWidth } = el
    const maxScroll = Math.max(0, scrollWidth - clientWidth)
    setState({
      canPrev: scrollLeft > 4,
      canNext: maxScroll > 4 && scrollLeft < maxScroll - 4,
    })
  }, [])

  useEffect(() => {
    sync()
    const el = trackRef.current
    if (!el) return undefined
    el.addEventListener('scroll', sync, { passive: true })
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(sync) : null
    ro?.observe(el)
    window.addEventListener('resize', sync, { passive: true })
    return () => {
      el.removeEventListener('scroll', sync)
      ro?.disconnect()
      window.removeEventListener('resize', sync)
    }
  }, [sync, itemCount])

  const slide = useCallback((direction) => {
    const el = trackRef.current
    if (!el) return
    const step = Math.max(260, Math.round(el.clientWidth * 0.78))
    el.scrollBy({ left: direction * step, behavior: 'smooth' })
  }, [])

  return { trackRef, ...state, slide }
}

/** Circular prev/next arrows paired with row sliders. */
function RowSlideControls({ canPrev, canNext, onSlide }) {
  const btnClass =
    'flex h-9 w-9 items-center justify-center rounded-full border border-brand-border bg-white text-brand-charcoal transition hover:border-brand-charcoal hover:bg-brand-charcoal hover:text-white disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:border-brand-border disabled:hover:bg-white disabled:hover:text-brand-charcoal'
  return (
    <div className="flex items-center gap-1.5" role="group" aria-label="Slide row">
      <button type="button" onClick={() => onSlide(-1)} disabled={!canPrev} aria-label="Slide previous" className={btnClass}>
        <Icon name="chevron-left" className="h-4 w-4" strokeWidth={2} />
      </button>
      <button type="button" onClick={() => onSlide(1)} disabled={!canNext} aria-label="Slide next" className={btnClass}>
        <Icon name="chevron-right" className="h-4 w-4" strokeWidth={2} />
      </button>
    </div>
  )
}

/** Shared add/wishlist wiring so every section behaves the same way. */
export function useShopActions() {
  const addItem = useCartStore((state) => state.addItem)
  const openCartDrawer = useUiStore((state) => state.openCartDrawer)
  const toggleWishlist = useWishlistStore((state) => state.toggle)
  const isWishlisted = useWishlistStore((state) => state.has)

  return {
    onAdd: (product) => {
      addItem(product)
      toast({ title: 'Added to bag', description: `${product.name} · ${product.volumes?.[0]?.size ?? ''}`.trim() })
      openCartDrawer()
    },
    onToggleWishlist: (product) => {
      const added = toggleWishlist(product)
      toast({
        title: added ? 'Saved to wishlist' : 'Removed from wishlist',
        description: product.name,
        tone: 'info',
      })
    },
    isWishlisted,
  }
}

const BESTSELLER_TABS = [
  { id: 'all', label: 'All Mix', icon: 'grid', to: '/shop/best-sellers', shopLabel: 'Shop All' },
  { id: 'him', label: 'Him', icon: 'user', to: '/shop/men', shopLabel: "Shop Men's" },
  { id: 'her', label: 'Her', icon: 'sparkle', to: '/shop/women', shopLabel: "Shop Women's" },
  { id: 'attar', label: 'Attar', icon: 'crown', to: '/shop/attars', shopLabel: 'Shop Attars' },
  { id: 'bakhoor', label: 'Bakhoor', icon: 'flame', to: '/shop/bakhoor', shopLabel: 'Shop Bakhoor' },
]

function matchesBestsellerTab(product, tabId) {
  if (!product) return false
  if (tabId === 'all') return true

  const gender = String(product.gender || '').toLowerCase()
  const tier = String(product.tier || '').toLowerCase()
  const category = String(product.category || '').toLowerCase()
  const subCategory = String(product.subCategory || '').toLowerCase()
  const name = String(product.name || '').toLowerCase()
  const collections = Array.isArray(product.collections)
    ? product.collections.map((c) => String(c).toLowerCase())
    : []

  if (tabId === 'him') {
    return gender === 'men' || gender === 'unisex'
  }
  if (tabId === 'her') {
    return gender === 'women' || gender === 'unisex'
  }
  if (tabId === 'attar') {
    return (
      tier === 'attar' ||
      category.includes('attar') ||
      subCategory.includes('attar') ||
      name.includes('attar') ||
      collections.some((c) => c.includes('attar'))
    )
  }
  if (tabId === 'bakhoor') {
    return (
      tier === 'bakhoor' ||
      category.includes('bakhoor') ||
      subCategory.includes('bakhoor') ||
      name.includes('bakhoor') ||
      name.includes('bakhour') ||
      collections.some((c) => c.includes('bakhoor') || c.includes('bakhour'))
    )
  }
  return true
}

/** Best sellers manually chosen by Admin, rendered as a slideable single row with category filter tabs. */
export function BestSellers({ products }) {
  const { onAdd, onToggleWishlist, isWishlisted } = useShopActions()
  const showcase = useShowcase()
  const bestsellers = useBestsellers()
  const catalogue = useCatalogueProducts()
  const [activeTab, setActiveTab] = useState('all')

  const curatedList = products ?? bestsellers

  // Filter items based on active tab — strictly what admin selected or marked as Bestseller
  const displayList = useMemo(() => {
    return curatedList.filter((p) => matchesBestsellerTab(p, activeTab))
  }, [curatedList, activeTab])

  const slider = useRowSlider(displayList.length)

  // Smoothly scroll back to start when switching category tabs
  useEffect(() => {
    if (slider.trackRef.current) {
      slider.trackRef.current.scrollTo({ left: 0, behavior: 'smooth' })
    }
  }, [activeTab])

  if (!products && !showcase.showBestsellers) return null

  const currentTab = BESTSELLER_TABS.find((t) => t.id === activeTab) || BESTSELLER_TABS[0]
  const totalInShop = displayList.length

  return (
    <section className="bridal-canvas relative overflow-hidden py-16 lg:py-20">
      <div className="shell relative z-10">
        <SectionHeading
          title="The Bestsellers"
          action={
            <div className="flex flex-wrap items-center gap-2.5">
              {displayList.length > 0 && (
                <RowSlideControls canPrev={slider.canPrev} canNext={slider.canNext} onSlide={slider.slide} />
              )}
              <Button variant="outline" size="sm" to={currentTab.to}>
                {currentTab.shopLabel} {totalInShop > 0 ? totalInShop : ''}
                <Icon name="arrow-right" className="h-3.5 w-3.5" />
              </Button>
            </div>
          }
        />

        {/* Bestseller Category Filter Tabs (All Mix, Him, Her, Attar, Bakhoor) */}
        <div
          role="tablist"
          aria-label="Filter bestsellers"
          className="no-scrollbar mt-4 mb-2 flex items-center gap-2 overflow-x-auto pb-1 pt-1"
        >
          {BESTSELLER_TABS.map((tab) => {
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-wider transition-all duration-200 shrink-0 select-none cursor-pointer',
                  isActive
                    ? 'bg-brand-charcoal text-white shadow-sm ring-1 ring-brand-charcoal'
                    : 'border border-brand-border bg-white/90 text-brand-charcoal hover:border-brand-gold hover:bg-brand-cream/60 hover:text-brand-charcoal'
                )}
              >
                <Icon
                  name={tab.icon}
                  className={cn('h-3.5 w-3.5 transition-colors', isActive ? 'text-brand-gold' : 'text-brand-muted')}
                />
                <span>{tab.label}</span>
              </button>
            )
          })}
        </div>

        {displayList.length === 0 ? (
          <div className="mt-8 rounded-xl border border-dashed border-brand-border bg-brand-cream/40 px-6 py-12 text-center">
            <p className="text-body-md font-medium text-brand-charcoal">
              No {currentTab.label.toLowerCase()} bestsellers available right now.
            </p>
            <Button variant="outline" size="sm" to={currentTab.to} className="mt-4">
              Explore {currentTab.label}
            </Button>
          </div>
        ) : (
          <div
            ref={slider.trackRef}
            className="no-scrollbar mt-7 flex snap-x snap-mandatory items-stretch gap-5 overflow-x-auto pb-3 pt-1 scroll-smooth"
          >
            {displayList.map((product) => (
              <div
                key={product.id}
                className="flex w-[78%] shrink-0 snap-start sm:w-[calc((100%-1.25rem)/2)] md:w-[calc((100%-2.5rem)/3)] lg:w-[calc((100%-3.75rem)/4)] xl:w-[calc((100%-5rem)/5)]"
              >
                <ProductCard
                  product={product}
                  showTier
                  onAdd={onAdd}
                  onToggleWishlist={onToggleWishlist}
                  isWishlisted={isWishlisted(product.id)}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

/**
 * Coming Soon shelf — automatically displays all products saved as `Draft` by
 * Admin (perfumes, attars, combos, bakhoor) directly beneath The Bestsellers.
 */
export function ComingSoon() {
  const items = useComingSoon()
  const { onToggleWishlist, isWishlisted } = useShopActions()
  const slider = useRowSlider(items.length)

  if (!items || items.length === 0) return null

  return (
    <section className="relative overflow-hidden border-t border-[#EFE3D0] bg-gradient-to-b from-white via-[#FFFDF9] to-[#FDF6EB]/65 py-16 lg:py-20">
      <div className="shell relative z-10">
        <SectionHeading
          title="Coming Soon"
          action={
            items.length > 0 && (
              <RowSlideControls canPrev={slider.canPrev} canNext={slider.canNext} onSlide={slider.slide} />
            )
          }
        />

        <div
          ref={slider.trackRef}
          className="no-scrollbar mt-9 flex snap-x snap-mandatory items-stretch gap-5 overflow-x-auto pb-3 pt-1 scroll-smooth"
        >
          {items.map((product) => (
            <div
              key={product.id}
              className="flex w-[78%] shrink-0 snap-start sm:w-[calc((100%-1.25rem)/2)] md:w-[calc((100%-2.5rem)/3)] lg:w-[calc((100%-3.75rem)/4)] xl:w-[calc((100%-5rem)/5)]"
            >
              <ProductCard
                product={product}
                showTier
                onToggleWishlist={onToggleWishlist}
                isWishlisted={isWishlisted(product.id)}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/**
 * Home page discount showcase area ("Best Discounts Right Now"), manually
 * controlled by Admin -> Website Display (never auto-filled from MRP/price).
 */
export function DealsOfDay() {
  const showcase = useShowcase()
  const featuredDeals = useShowcaseProducts('homeDealProductIds')
  const { onAdd, onToggleWishlist, isWishlisted } = useShopActions()
  const slider = useRowSlider(featuredDeals.length)

  if (!showcase.showHomeDeals) return null

  return (
    <section className="bridal-banner relative overflow-hidden border-y border-[#E9D9BF] py-16 text-brand-charcoal lg:py-20">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-24 top-8 h-72 w-72 rounded-full bg-[#FAD9E2]/35 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-20 bottom-6 h-72 w-72 rounded-full bg-[#F3DFB4]/35 blur-3xl"
      />
      <div className="shell relative z-10">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="font-cormorant text-3xl font-semibold text-brand-charcoal lg:text-headline-xl">
              Best Discounts Right Now
            </h2>
          </div>
          {featuredDeals.length > 0 && (
            <RowSlideControls canPrev={slider.canPrev} canNext={slider.canNext} onSlide={slider.slide} />
          )}
        </div>

        {featuredDeals.length === 0 ? (
          <div className="mt-9 rounded-xl border border-dashed border-brand-border bg-neutral-50/70 px-6 py-10 text-center">
            <p className="text-body-md font-medium text-brand-charcoal">No in-stock discount offers available right now.</p>
            <Button variant="gold" size="sm" to="/offers" className="mt-4">
              View Offers Page
            </Button>
          </div>
        ) : (
          <div
            ref={slider.trackRef}
            className="no-scrollbar mt-9 flex snap-x snap-mandatory items-stretch gap-5 overflow-x-auto pb-3 pt-1 scroll-smooth"
          >
            {featuredDeals.map((product) => (
              <div
                key={product.id}
                className="flex w-[78%] shrink-0 snap-start sm:w-[calc((100%-1.25rem)/2)] md:w-[calc((100%-2.5rem)/3)] lg:w-[calc((100%-3.75rem)/4)] xl:w-[calc((100%-5rem)/5)]"
              >
                <ProductCard
                  product={product}
                  showTier
                  onAdd={onAdd}
                  onToggleWishlist={onToggleWishlist}
                  isWishlisted={isWishlisted(product.id)}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

/**
 * Shop by Notes horizontal slider — 20 perfumery notes with studio botanical
 * photography on warm cream cards and smooth left/right sliding controls.
 */
export function ShopByNotes() {
  const slider = useRowSlider(SHOP_NOTES.length)

  return (
    <section className="relative overflow-hidden border-b border-[#EFE3D0] bg-white py-14 lg:py-16">
      <div className="shell relative z-10">
        <div className="flex items-center justify-between gap-4">
          <h2 className="font-cormorant text-2xl font-semibold uppercase tracking-[0.06em] text-brand-charcoal sm:text-3xl">
            Shop by Notes
          </h2>
          <RowSlideControls canPrev={slider.canPrev} canNext={slider.canNext} onSlide={slider.slide} />
        </div>

        <div className="relative mt-7 sm:mt-8">
          <div
            ref={slider.trackRef}
            className="no-scrollbar flex snap-x snap-mandatory items-stretch gap-4 overflow-x-auto pb-2 scroll-smooth sm:gap-5"
          >
            {SHOP_NOTES.map((note) => (
              <Link
                key={note.id}
                to={`/shop?note=${encodeURIComponent(note.id)}`}
                aria-label={`Shop ${note.label} perfumes`}
                className="group block w-[46%] shrink-0 snap-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-gold sm:w-[calc((100%-1.25rem)/2)] md:w-[calc((100%-2.5rem)/3)] lg:w-[calc((100%-3.75rem)/4)]"
              >
                <div className="aspect-square w-full overflow-hidden rounded-lg border border-[#F0E7D5] bg-[#FAF7EE]">
                  <img
                    src={note.image}
                    alt={note.label}
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover object-center transition-transform duration-500 group-hover:scale-105"
                  />
                </div>
                <p className="mt-3 font-inter text-[15px] font-normal text-brand-charcoal transition-colors group-hover:text-brand-goldDark sm:text-[15.5px]">
                  {note.label}
                </p>
                <p className="mt-0.5 text-[12.5px] text-brand-muted sm:text-[13px]">
                  {note.mood}
                </p>
              </Link>
            ))}
          </div>

          {/* Floating side arrows on desktop mirroring the editorial slider reference */}
          {slider.canPrev && (
            <button
              type="button"
              onClick={() => slider.slide(-1)}
              aria-label="Previous notes"
              className="absolute -left-3 top-[40%] z-20 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-[#E5D7BF] bg-white/95 text-brand-charcoal shadow-md backdrop-blur-xs transition hover:scale-105 hover:border-brand-gold hover:text-brand-goldDark lg:flex"
            >
              <Icon name="chevron-left" className="h-4 w-4" strokeWidth={2.2} />
            </button>
          )}
          {slider.canNext && (
            <button
              type="button"
              onClick={() => slider.slide(1)}
              aria-label="Next notes"
              className="absolute -right-3 top-[40%] z-20 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-[#E5D7BF] bg-white/95 text-brand-charcoal shadow-md backdrop-blur-xs transition hover:scale-105 hover:border-brand-gold hover:text-brand-goldDark lg:flex"
            >
              <Icon name="chevron-right" className="h-4 w-4" strokeWidth={2.2} />
            </button>
          )}
        </div>
      </div>
    </section>
  )
}

/** Six-reason trust grid. */
export function WhyShopWithUs() {
  return (
    <section className="border-y border-[#ECE0CC] bg-gradient-to-b from-white via-[#FDF5F6]/55 to-[#FFFDF9] py-16 lg:py-20">
      <div className="shell">
        <SectionHeading
          align="center"
          title="Why Customers Come Back"
        />

        <ul className="mt-8 grid grid-cols-2 gap-3 sm:mt-10 sm:gap-5 lg:grid-cols-3">
          {WHY_SHOP.map((item) => (
            <li
              key={item.id}
              className="flex flex-col items-center gap-2.5 rounded-xl border border-[#ECE0CC] bg-gradient-to-b from-white via-[#FFFDF9] to-[#FDF6EB]/80 p-3.5 text-center shadow-card transition-all duration-300 hover:-translate-y-1 hover:border-brand-gold/70 hover:shadow-[0_14px_32px_-10px_rgba(200,155,60,0.22)] sm:flex-row sm:items-center sm:gap-4 sm:p-5 sm:text-left"
            >
              <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg border border-brand-border bg-neutral-50 shadow-sm sm:h-16 sm:w-16">
                <img
                  src={item.image}
                  alt={item.title}
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-brand-charcoal sm:text-body-md">{item.title}</h3>
                <p className="mt-1 hidden text-body-sm leading-relaxed text-brand-muted sm:block">{item.description}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

export default BestSellers
