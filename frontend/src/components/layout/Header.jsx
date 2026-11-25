import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { NAV_TRANSITION, Link, NavLink, useLocation, useNavigate } from '@/components/ui/AppLink'
import { useLenis } from 'lenis/react'
import cn from '@/lib/cn'
import { formatPrice } from '@/lib/format'
import useUiStore from '@/store/uiStore'
import useCartStore from '@/store/cartStore'
import useWishlistStore from '@/store/wishlistStore'
import { Icon } from '@/components/ui/Icon'
import { MAIN_NAV } from '@/data/content'
import { searchCatalogue } from '@/services/productService'
import { useCatalogueProducts } from '@/store/catalogueStore'
import { FlaconStage } from '@/components/product/FlaconArt'
import { productImage } from '@/data/productImages'
import { Logo, HeaderAction } from './Brand'

const MAX_SUGGESTIONS = 5

/**
 * Sticky site header: wordmark, primary nav, instant search and the
 * account/wishlist/bag actions. Search suggestions come from the same local
 * catalogue search the results page uses, so the two never disagree.
 */
export function Header() {
  const location = useLocation()
  const navigate = useNavigate()
  const [scrolled, setScrolled] = useState(false)
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(false)
  const [openDropdown, setOpenDropdown] = useState(null)
  const searchRef = useRef(null)
  const blurTimer = useRef(null)
  const progressRef = useRef(null)

  const products = useCatalogueProducts()

  const { openMobileMenu, openCartDrawer, toggleSearch } = useUiStore()
  const cartCount = useCartStore((state) => state.items.reduce((total, item) => total + item.quantity, 0))
  const wishlistCount = useWishlistStore((state) => state.items.length)

  const suggestions = useMemo(
    () => (query.trim().length > 1 ? searchCatalogue(query, { limit: MAX_SUGGESTIONS, products }) : []),
    [query, products],
  )
  const showSuggestions = focused && query.trim().length > 1

  // Lenis emits `scroll` from inside its own frame loop, so the header stays in
  // step with the animation instead of trailing it the way a native scroll
  // listener does. The callback must be stable — `useLenis` keeps it in a
  // dependency array, so an inline arrow would resubscribe on every render.
  const onScroll = useCallback((lenis) => {
    const next = lenis.scroll > 8
    setScrolled((previous) => (previous === next ? previous : next))

    // Written straight to the node. Driving a progress bar through state would
    // re-render the entire header on every frame of every scroll.
    const bar = progressRef.current
    if (bar) bar.style.transform = `scaleX(${lenis.progress || 0})`
  }, [])

  useLenis(onScroll)

  // Native scroll fallback (touch devices / instant jumps) + sync on route change
  useEffect(() => {
    const syncScroll = () => {
      const next = window.scrollY > 8
      setScrolled((previous) => (previous === next ? previous : next))
    }
    syncScroll()
    window.addEventListener('scroll', syncScroll, { passive: true })
    return () => window.removeEventListener('scroll', syncScroll)
  }, [location.pathname, location.search])

  // Any navigation closes the suggestion panel and any hover dropdown.
  useEffect(() => {
    setQuery('')
    setFocused(false)
    setOpenDropdown(null)
  }, [location.pathname, location.search])

  useEffect(() => () => clearTimeout(blurTimer.current), [])

  const submitSearch = (event) => {
    if (event?.preventDefault) event.preventDefault()
    clearTimeout(blurTimer.current)
    const trimmed = query.trim()
    if (!trimmed) return
    setFocused(false)
    setQuery('')
    searchRef.current?.blur()
    navigate(`/search?q=${encodeURIComponent(trimmed)}`, NAV_TRANSITION)
  }

  const isActive = (to) => {
    if (to === '/') return location.pathname === '/'
    return location.pathname === to || location.pathname.startsWith(`${to}/`)
  }

  const isHeroPage =
    location.pathname === '/' ||
    location.pathname === '/shop' ||
    location.pathname.startsWith('/shop/') ||
    location.pathname === '/offers' ||
    location.pathname === '/combos' ||
    location.pathname.startsWith('/combos/')
  const isTransparent = isHeroPage && !scrolled
  const isLightTone = false
  const tone = 'dark'

  return (
    <header
      className={cn(
        'sticky top-0 z-40 transition-all duration-300',
        isHeroPage && '-mb-[80px] sm:-mb-[88px] lg:-mb-[104px]',
        isTransparent
          ? 'border-b border-transparent bg-transparent shadow-none'
          : 'border-b border-brand-border/80 bg-white/95 backdrop-blur-md shadow-card',
      )}
    >
      <div className="shell-wide">
        <div className="grid h-[80px] grid-cols-[1fr_auto_1fr] items-center gap-2 sm:h-[88px] lg:h-[104px] lg:gap-4">
          {/* Left — mobile menu & search + desktop primary nav */}
          <div className="flex min-w-0 items-center justify-start gap-0.5 sm:gap-1.5">
            <button
              type="button"
              onClick={openMobileMenu}
              aria-label="Open menu"
              className="flex h-9 w-9 items-center justify-center rounded-full text-brand-charcoal transition hover:bg-neutral-100 sm:h-10 sm:w-10 lg:hidden"
            >
              <Icon name="menu" className="h-5 w-5" />
            </button>

            <button
              type="button"
              onClick={() => toggleSearch(true)}
              aria-label="Search"
              className="flex h-9 w-9 items-center justify-center rounded-full text-brand-charcoal transition hover:bg-neutral-100 hover:text-brand-goldDark sm:h-10 sm:w-10 md:hidden"
            >
              <Icon name="search" className="h-[18px] w-[18px]" strokeWidth={1.7} />
            </button>

            <nav className="hidden items-center gap-4 lg:flex xl:gap-7 2xl:gap-8" aria-label="Primary">
              {MAIN_NAV.map((item) => {
                const hasChildren = Array.isArray(item.children) && item.children.length > 0
                const isClaimedByOtherTopLevel =
                  hasChildren &&
                  MAIN_NAV.some(
                    (other) =>
                      other.id !== item.id &&
                      (location.pathname === other.to ||
                        (other.to !== '/' && location.pathname.startsWith(`${other.to}/`))),
                  )
                const active = hasChildren
                  ? !isClaimedByOtherTopLevel &&
                    (location.pathname === item.to ||
                      item.children.some((child) => child.to !== '/shop' && location.pathname === child.to))
                  : isActive(item.to)

                if (!hasChildren) {
                  return (
                    <NavLink
                      key={item.id}
                      to={item.to}
                      className={cn(
                        'relative whitespace-nowrap py-1 font-manrope text-label-sm font-semibold uppercase tracking-[0.11em] transition-colors xl:tracking-[0.14em]',
                        active ? 'text-brand-goldDark' : 'text-ink-variant hover:text-brand-charcoal',
                        item.accent === 'red' && !active && 'text-tier-original hover:text-tier-original',
                      )}
                    >
                      {item.label}
                      {active && (
                        <span
                          className="absolute -bottom-[6px] left-0 right-0 h-[1.5px] bg-brand-goldDark"
                          aria-hidden="true"
                        />
                      )}
                    </NavLink>
                  )
                }

                const isOpen = openDropdown === item.id

                return (
                  <div
                    key={item.id}
                    className="relative py-2"
                    onMouseEnter={() => setOpenDropdown(item.id)}
                    onMouseLeave={() => setOpenDropdown(null)}
                  >
                    <NavLink
                      to={item.to}
                      onClick={() => setOpenDropdown(null)}
                      className={cn(
                        'relative inline-flex items-center gap-1.5 whitespace-nowrap py-1 font-manrope text-label-sm font-semibold uppercase tracking-[0.11em] transition-colors xl:tracking-[0.14em]',
                        active || isOpen ? 'text-brand-goldDark' : 'text-ink-variant hover:text-brand-charcoal',
                      )}
                    >
                      {item.label}
                      <Icon
                        name="chevron-down"
                        className={cn('h-3 w-3 transition-transform duration-200', isOpen && 'rotate-180')}
                        strokeWidth={2.2}
                      />
                      {(active || isOpen) && (
                        <span
                          className="absolute -bottom-[6px] left-0 right-0 h-[1.5px] bg-brand-goldDark transition-opacity duration-200"
                          aria-hidden="true"
                        />
                      )}
                    </NavLink>

                    {/* Editorial single-column hover dropdown centered under Shop All */}
                    <div
                      className={cn(
                        'absolute left-1/2 top-full z-50 -translate-x-1/2 pt-1.5 transition-all duration-200',
                        isOpen
                          ? 'pointer-events-auto visible translate-y-0 opacity-100'
                          : 'pointer-events-none invisible translate-y-1 opacity-0',
                      )}
                    >
                      <div className="min-w-[15.5rem] border border-[#E5D3B3] border-t-2 border-t-brand-gold bg-gradient-to-b from-[#FFFDF9] via-[#FDF7EC] to-[#F9EFE0] py-2 shadow-[0_18px_40px_-14px_rgba(32,22,12,0.18)]">
                        {item.children.map((child) => {
                          const childActive = location.pathname === child.to
                          const isViewAll = child.id === 'view-all'
                          return (
                            <Link
                              key={child.id}
                              to={child.to}
                              onClick={() => setOpenDropdown(null)}
                              className={cn(
                                'block whitespace-nowrap px-5 py-2.5 font-manrope text-[14px] font-semibold tracking-[0.01em] transition-colors duration-150',
                                isViewAll && 'mt-1 border-t border-[#E8D8BC]/80 pt-3 font-semibold text-brand-goldDark',
                                childActive
                                  ? 'bg-[#F3E5CA]/75 text-brand-goldDark'
                                  : 'text-brand-charcoal hover:bg-[#F3E5CA]/60 hover:text-brand-goldDark',
                              )}
                            >
                              {child.label}
                            </Link>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                )
              })}
            </nav>
          </div>

          {/* Centre — official seal logo */}
          <div className="flex items-center justify-center">
            <Logo />
          </div>

          {/* Right — instant search + actions */}
          <div className="flex items-center justify-end gap-0.5 sm:gap-1">
            <form onSubmit={submitSearch} className="relative hidden md:block">
              <Icon
                name="search"
                className={cn(
                  'pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 transition-colors',
                  isLightTone ? 'text-brand-ivory/70' : 'text-brand-muted',
                )}
              />
              <input
                ref={searchRef}
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onFocus={() => {
                  clearTimeout(blurTimer.current)
                  setFocused(true)
                }}
                onBlur={(e) => {
                  if (e.relatedTarget && searchRef.current?.form?.contains(e.relatedTarget)) {
                    return
                  }
                  blurTimer.current = setTimeout(() => setFocused(false), 250)
                }}
                placeholder="Search perfumes, notes, brands…"
                aria-label="Search the catalogue"
                className={cn(
                  'w-36 rounded-full border py-2 pl-9 pr-3 text-body-sm outline-none transition-all xl:w-52',
                  isLightTone
                    ? 'border-white/20 bg-black/25 text-brand-ivory placeholder:text-white/60 focus:w-52 focus:border-brand-gold focus:bg-brand-charcoal/90 focus:text-white focus:ring-1 focus:ring-brand-gold xl:focus:w-64'
                    : 'border-brand-border bg-white/80 text-brand-charcoal placeholder:text-brand-muted/80 focus:w-52 focus:border-brand-gold focus:bg-white focus:ring-1 focus:ring-brand-gold xl:focus:w-64',
                )}
              />

              {showSuggestions && (
                <div
                  className="absolute right-0 top-[calc(100%+10px)] z-50 w-[22rem] animate-fade-in overflow-hidden rounded border border-brand-border bg-white shadow-overlay"
                >
                  {suggestions.length === 0 ? (
                    <p className="px-4 py-5 text-body-sm text-brand-muted">
                      No fragrance matches “{query.trim()}”. Try a note like <em>oud</em> or <em>bergamot</em>.
                    </p>
                  ) : (
                    <>
                      <ul className="max-h-[22rem] overflow-y-auto">
                        {suggestions.map((product) => (
                          <li key={product.id}>
                            <Link
                              to={`/product/${product.slug}`}
                              onClick={() => {
                                clearTimeout(blurTimer.current)
                                setFocused(false)
                                setQuery('')
                              }}
                              className="flex items-center gap-3 border-b border-brand-border/60 px-4 py-3 transition hover:bg-neutral-50"
                            >
                              <div className="h-11 w-11 shrink-0 overflow-hidden rounded border border-brand-border/50 bg-[#F9F9F9] p-0.5">
                                <FlaconStage
                                  tier={product.tier}
                                  seed={product.slug}
                                  label={product.name}
                                  image={productImage(product)}
                                  compact
                                />
                              </div>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-body-sm font-semibold text-brand-charcoal">
                                  {product.name}
                                </span>
                                <span className="mt-0.5 block truncate text-xs text-brand-muted">
                                  {product.brand} · {product.concentration}
                                </span>
                              </span>
                              <span className="shrink-0 text-body-sm font-semibold tabular-nums text-brand-charcoal">
                                {formatPrice(product.price)}
                              </span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                      <button
                        type="button"
                        onClick={submitSearch}
                        className="flex w-full items-center justify-between gap-2 bg-neutral-50 px-4 py-3 text-label-sm font-bold uppercase text-brand-goldDark transition hover:bg-neutral-100"
                      >
                        See all results for “{query.trim()}”
                        <Icon name="arrow-right" className="h-3.5 w-3.5" />
                      </button>
                    </>
                  )}
                </div>
              )}
            </form>

            <HeaderAction icon="user" label="My account" to="/account" tone={tone} />
            <HeaderAction icon="heart" label="Wishlist" to="/wishlist" badge={wishlistCount} tone={tone} />
            <HeaderAction icon="bag" label="Shopping bag" onClick={openCartDrawer} badge={cartCount} tone={tone} />
          </div>
        </div>
      </div>

      {/* Reading progress — one gold hairline along the bottom edge. Scaled
          rather than resized so it stays on the compositor. */}
      <div
        ref={progressRef}
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-[-1px] h-px origin-left bg-brand-gold"
        style={{ transform: 'scaleX(0)' }}
      />
    </header>
  )
}

export default Header
