import { Link } from '@/components/ui/AppLink'
import { Icon } from '@/components/ui/Icon'
import { Button } from '@/components/ui/Button'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'

const SUGGESTIONS = [
  { label: 'Shop All Fragrances', to: '/shop', icon: 'bag' },
  { label: 'Original Branded', to: '/shop/originals', icon: 'verified' },
  { label: 'Inspired Blends', to: '/shop/inspired', icon: 'mix' },
  { label: 'Offers & Deals', to: '/offers', icon: 'tag' },
  { label: 'Track Order', to: '/track-order', icon: 'truck' },
]

export function NotFoundPage() {
  useDocumentTitle('Page Not Found')

  return (
    <div className="shell flex min-h-[70vh] flex-col items-center justify-center py-20 text-center">
      <p className="font-serif text-[92px] font-medium leading-none text-brand-gold/35 sm:text-[128px]">404</p>

      <h1 className="-mt-4 font-serif text-3xl font-medium text-brand-charcoal lg:text-headline-xl">
        Page not found
      </h1>
      <p className="mt-3 max-w-lg text-body-md leading-relaxed text-brand-muted">
        The page you were looking for could not be found. It may have been removed or the link may have a typing
        mistake. Let us take you back to our perfumes.
      </p>

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button variant="primary" size="lg" to="/">
          <Icon name="arrow-left" className="h-4 w-4" />
          Back To Home
        </Button>
        <Button variant="outline" size="lg" to="/shop">
          Browse The Collection
        </Button>
      </div>

      <div className="mt-16 w-full max-w-3xl border-t border-brand-border pt-10">
        <p className="text-label-sm font-bold uppercase tracking-[0.18em] text-brand-muted">Popular Destinations</p>
        <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {SUGGESTIONS.map((item) => (
            <li key={item.to}>
              <Link
                to={item.to}
                className="card-surface flex items-center gap-3 px-4 py-3.5 text-left transition hover:border-brand-gold"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-cream text-brand-goldDark">
                  <Icon name={item.icon} className="h-3.5 w-3.5" />
                </span>
                <span className="text-body-sm font-semibold text-brand-charcoal">{item.label}</span>
                <Icon name="arrow-right" className="ml-auto h-3.5 w-3.5 shrink-0 text-brand-muted" />
              </Link>
            </li>
          ))}
        </ul>
      </div>

      <p className="mt-12 text-body-sm text-brand-muted">
        Still stuck?{' '}
        <Link to="/pages/contact" className="link-underline text-brand-goldDark">
          Contact support
        </Link>
        .
      </p>
    </div>
  )
}

export default NotFoundPage
