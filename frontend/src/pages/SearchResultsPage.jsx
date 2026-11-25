import { useMemo } from 'react'
import { Link, useSearchParams } from '@/components/ui/AppLink'
import { CatalogueView, CatalogueSkeleton } from '@/components/product/CatalogueView'
import { EmptyState } from '@/components/ui/Feedback'
import { useCatalogue } from '@/hooks/useCatalogue'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'
import { searchCatalogue } from '@/services/productService'
import { useCatalogueProducts } from '@/store/catalogueStore'

const SUGGESTIONS = ['Oud', 'Bergamot', 'Vanilla', 'Musk', 'Rose', 'Sandalwood', 'Attar', 'Gift Set']

/**
 * Search results.
 *
 * Runs the same scoring function the header's instant-search uses, then hands
 * the matched set to the shared catalogue view so filtering and sorting work
 * exactly as they do in the shop.
 */
export function SearchResultsPage() {
  const [searchParams] = useSearchParams()
  const query = (searchParams.get('q') ?? '').trim()
  const products = useCatalogueProducts()

  useDocumentTitle(query ? `Search: ${query}` : 'Search')

  const matches = useMemo(() => (query ? searchCatalogue(query, { products }) : []), [query, products])

  if (!query) {
    return (
      <div className="shell py-16">
        <EmptyState
          icon="search"
          title="What are you looking for?"
          actionLabel="Browse The Collection"
          actionTo="/shop"
        />
        <SuggestionRow className="mt-8" />
      </div>
    )
  }

  if (matches.length === 0) {
    return (
      <div className="shell py-16">
        <EmptyState
          icon="search"
          title={`No fragrance matches “${query}”`}
          actionLabel="Browse The Collection"
          actionTo="/shop"
        />
        <SuggestionRow title="Popular searches" className="mt-8" />
      </div>
    )
  }

  return <SearchCatalogue key={query} query={query} matches={matches} />
}

function SuggestionRow({ title = 'Popular searches', className }) {
  return (
    <div className={className}>
      <p className="text-center text-label-sm font-bold uppercase tracking-widest text-brand-muted">{title}</p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {SUGGESTIONS.map((term) => (
          <Link
            key={term}
            to={`/search?q=${encodeURIComponent(term)}`}
            className="rounded-full border border-brand-border bg-brand-ivory px-4 py-2 text-label-sm font-bold uppercase text-ink-variant transition hover:border-brand-gold hover:text-brand-goldDark"
          >
            {term}
          </Link>
        ))}
      </div>
    </div>
  )
}

/** The results themselves, rendered through the shared catalogue surface. */
function SearchCatalogue({ query, matches }) {
  const catalogue = useCatalogue({ baseProducts: matches, pageSize: 24 })

  return (
    <CatalogueView
      catalogue={catalogue}
      layout="full"
      breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Search' }, { label: query }]}
      title={`“${query}”`}
      emptyTitle="No matching fragrances"
    />
  )
}

/** Handles the catalogue view's optional loading state on slow backends. */
export function SearchLoading() {
  return (
    <div className="shell py-12">
      <CatalogueSkeleton />
    </div>
  )
}

export default SearchResultsPage
