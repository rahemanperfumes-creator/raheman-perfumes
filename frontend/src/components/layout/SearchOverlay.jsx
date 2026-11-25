import { useEffect, useMemo, useRef, useState } from 'react'
import { NAV_TRANSITION, Link, useNavigate } from '@/components/ui/AppLink'
import cn from '@/lib/cn'
import { formatPrice } from '@/lib/format'
import useUiStore from '@/store/uiStore'
import { Icon } from '@/components/ui/Icon'
import { TierBadge } from '@/components/ui/Badge'
import { FlaconStage } from '@/components/product/FlaconArt'
import { productImage } from '@/data/productImages'
import { searchCatalogue } from '@/services/productService'
import { useCatalogueProducts, useCategories } from '@/store/catalogueStore'
import { SCENT_FAMILIES } from '@/data/categories'

const TRENDING = ['Oud', 'Vanilla', 'Bergamot', 'Musk', 'Rose']

/**
 * Full-screen search. Opens from the header's mobile search button.
 * Shows trending terms and collections before you type, live results after.
 */
export function SearchOverlay() {
  const navigate = useNavigate()
  const { searchOpen, closeSearch } = useUiStore()
  const [query, setQuery] = useState('')
  const inputRef = useRef(null)
  const products = useCatalogueProducts()
  const categories = useCategories()

  const results = useMemo(
    () => (query.trim().length > 1 ? searchCatalogue(query, { limit: 8, products }) : []),
    [query, products],
  )

  useEffect(() => {
    if (!searchOpen) {
      setQuery('')
      return undefined
    }
    const timer = setTimeout(() => inputRef.current?.focus(), 60)
    const onKeyDown = (event) => {
      if (event.key === 'Escape') closeSearch()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [searchOpen, closeSearch])

  if (!searchOpen) return null

  const submit = (event) => {
    event.preventDefault()
    const trimmed = query.trim()
    if (!trimmed) return
    closeSearch()
    navigate(`/search?q=${encodeURIComponent(trimmed)}`, NAV_TRANSITION)
  }

  const pick = (term) => {
    closeSearch()
    navigate(`/search?q=${encodeURIComponent(term)}`, NAV_TRANSITION)
  }

  return (
    <div className="fixed inset-0 z-[68] flex flex-col bg-white/98 backdrop-blur-md">
      <div className="border-b border-brand-border">
        <form onSubmit={submit} className="shell flex items-center gap-3 py-4">
          <Icon name="search" className="h-5 w-5 shrink-0 text-brand-muted" />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search perfumes, notes, brands…"
            aria-label="Search the catalogue"
            className="flex-1 bg-transparent text-body-lg text-brand-charcoal outline-none placeholder:text-brand-muted/70"
          />
          <button
            type="button"
            onClick={closeSearch}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-brand-muted transition hover:bg-neutral-100 hover:text-brand-charcoal"
            aria-label="Close search"
          >
            <Icon name="close" className="h-4 w-4" strokeWidth={2} />
          </button>
        </form>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="shell py-7">
          {query.trim().length > 1 ? (
            results.length ? (
              <>
                <p className="eyebrow mb-4">
                  {results.length} {results.length === 1 ? 'Match' : 'Matches'} for “{query.trim()}”
                </p>
                <ul className="grid gap-3 sm:grid-cols-2">
                  {results.map((product) => (
                    <li key={product.id}>
                      <Link
                        to={`/product/${product.slug}`}
                        onClick={closeSearch}
                        className="card-surface card-lift flex items-center gap-4 p-3"
                      >
                        <span className="w-16 shrink-0">
                          <FlaconStage tier={product.tier} seed={product.slug} label={product.name} image={productImage(product)} compact />
                        </span>
                        <span className="min-w-0 flex-1">
                          <TierBadge tier={product.tier} size="sm" />
                          <span className="mt-1.5 block truncate text-body-md font-semibold text-brand-charcoal">
                            {product.name}
                          </span>
                          <span className="mt-0.5 block truncate text-body-sm text-brand-muted">
                            {product.brand} · {product.concentration}
                          </span>
                        </span>
                        <span className="shrink-0 text-body-md font-semibold text-brand-charcoal">
                          {formatPrice(product.price)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={() => pick(query.trim())}
                  className="mt-6 flex w-full items-center justify-center gap-2 rounded border border-brand-charcoal px-6 py-3 text-label-md font-bold uppercase text-brand-charcoal transition hover:bg-brand-charcoal hover:text-brand-ivory"
                >
                  See all results for “{query.trim()}”
                  <Icon name="arrow-right" className="h-4 w-4" />
                </button>
              </>
            ) : (
              <div className="py-12 text-center">
                <p className="text-headline-sm font-semibold text-brand-charcoal">
                  No fragrance matches “{query.trim()}”
                </p>
                <p className="mx-auto mt-2 max-w-md text-body-md text-brand-muted">
                  Try a note, a brand, or browse the collections below.
                </p>
                <div className="mt-5 flex flex-wrap justify-center gap-2">
                  {TRENDING.map((term) => (
                    <button key={term} type="button" onClick={() => setQuery(term)} className="btn btn-outline btn-sm">
                      {term}
                    </button>
                  ))}
                </div>
              </div>
            )
          ) : (
            <>
              <p className="eyebrow mb-3">Trending Searches</p>
              <div className="flex flex-wrap gap-2">
                {TRENDING.map((term) => (
                  <button
                    key={term}
                    type="button"
                    onClick={() => pick(term)}
                    className="rounded-full border border-brand-border bg-brand-ivory px-4 py-2 text-label-sm font-bold uppercase text-ink-variant transition hover:border-brand-gold hover:text-brand-goldDark"
                  >
                    {term}
                  </button>
                ))}
              </div>

              <p className="eyebrow mb-3 mt-8">Scent Families</p>
              <div className="flex flex-wrap gap-2">
                {SCENT_FAMILIES.map((family) => (
                  <button
                    key={family.id}
                    type="button"
                    onClick={() => pick(family.label)}
                    className="rounded-full border border-brand-border bg-white px-4 py-2 text-label-sm font-bold uppercase text-ink-variant transition hover:border-brand-gold hover:bg-neutral-50 hover:text-brand-goldDark"
                  >
                    {family.label}
                  </button>
                ))}
              </div>

              {categories.length > 0 && (
              <>
              <p className="eyebrow mb-3 mt-8">Collections</p>
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {categories.map((category) => (
                  <li key={category.id}>
                    <Link
                      to={`/shop/${category.slug}`}
                      onClick={closeSearch}
                      className={cn(
                        'flex flex-col rounded border border-brand-border bg-white px-4 py-3 transition',
                        'hover:border-brand-gold hover:bg-neutral-50',
                      )}
                    >
                      <span className="text-body-sm font-semibold text-brand-charcoal">{category.label}</span>
                      <span className="text-body-sm text-brand-muted">{category.blurb}</span>
                    </Link>
                  </li>
                ))}
              </ul>
              </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export default SearchOverlay
