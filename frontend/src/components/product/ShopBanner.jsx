import { useSearchParams } from 'react-router-dom'
import { Link } from '@/components/ui/AppLink'
import cn from '@/lib/cn'
import { Icon } from '@/components/ui/Icon'

const BANNER_IMAGES = {
  originals: '/pillar-originals.jpg?v=4',
  inspired: '/pillar-inspired.jpg?v=4',
  celebrities: '/pillar-originals.jpg?v=4',
  celebrity: '/pillar-originals.jpg?v=4',
  'celebrity-perfumes': '/pillar-originals.jpg?v=4',
  'car-perfumes': '/pillar-originals.jpg?v=4',
  'car-perfume': '/pillar-originals.jpg?v=4',
  car: '/pillar-originals.jpg?v=4',
  attars: '/pillar-attars.jpg?v=4',
  attar: '/pillar-attars.jpg?v=4',
  combos: '/pillar-combos.jpg?v=4',
  combo: '/pillar-combos.jpg?v=4',
  bakhoor: '/pillar-bakhoor.jpg?v=3',
  'best-sellers': '/offer-white.jpg?v=3',
  bestsellers: '/offer-white.jpg?v=3',
  bestseller: '/offer-white.jpg?v=3',
  'new-arrivals': '/pillar-inspired.jpg?v=4',
  new: '/pillar-inspired.jpg?v=4',
  unisex: '/cat-unisex.jpg?v=3',
  men: '/pillar-originals.jpg?v=4',
  women: '/hero-white.jpg?v=5',
  everyday: '/occasion-everyday.jpg',
  office: '/occasion-office.jpg',
  party: '/occasion-party.jpg',
  sports: '/occasion-sports.jpg',
  'date-night': '/occasion-date-night.jpg',
  college: '/occasion-college.jpg',
  default: '/hero-white.jpg?v=5',
}

/**
 * Shared hero banner used across the Shop, Original, and Best Sellers pages.
 */
export function ShopBanner({ collection, title, eyebrow, imageOverride }) {
  const [searchParams] = useSearchParams()
  const sort = searchParams.get('sort')
  const visualSrc = imageOverride || BANNER_IMAGES[collection] || BANNER_IMAGES.default

  const pills = [
    { label: 'All', to: '/shop', active: !collection && !sort },
    {
      label: 'Bestseller',
      to: '/shop/best-sellers',
      icon: 'crown',
      active: collection === 'best-sellers' || collection === 'bestsellers' || collection === 'bestseller',
    },
    {
      label: 'Originals',
      to: '/shop/originals',
      icon: 'award',
      active: collection === 'originals' || collection === 'original',
    },
    {
      label: 'Inspired',
      to: '/shop/inspired',
      icon: 'sparkle',
      active: collection === 'inspired',
    },
    {
      label: 'Pure Attars',
      to: '/shop/attars',
      icon: 'sparkle',
      active: collection === 'attars' || collection === 'attar',
    },
    {
      label: 'Celebrities',
      to: '/shop/celebrities',
      icon: 'star',
      active: collection === 'celebrities' || collection === 'celebrity' || collection === 'celebrity-perfumes',
    },
    {
      label: 'Car Perfumes',
      to: '/shop/car-perfumes',
      icon: 'sparkle',
      active: collection === 'car-perfumes' || collection === 'car-perfume' || collection === 'car',
    },
    {
      label: 'Combos',
      to: '/combos',
      icon: 'gift',
      active: collection === 'combos' || collection === 'combo',
    },
    {
      label: 'Bakhoor',
      to: '/shop/bakhoor',
      icon: 'flame',
      active: collection === 'bakhoor',
    },
    {
      label: 'New Arrivals',
      to: '/shop/new-arrivals',
      icon: 'sparkle',
      active: collection === 'new-arrivals' || collection === 'new' || sort === 'newest',
    },
  ]

  return (
    <section className="bridal-banner relative overflow-hidden text-brand-charcoal">
      {/* Ambient rose-pearl & champagne-gold soft glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-20 top-10 h-64 w-64 rounded-full bg-[#FAD9E2]/35 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-[38%] -bottom-16 h-60 w-72 rounded-full bg-[#F2DFB6]/35 blur-3xl"
      />

      {/* Right-hand editorial perfume composition blended smoothly into bridal ivory silk */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 right-0 hidden w-[46%] overflow-hidden md:block lg:w-[44%]"
        style={{
          WebkitMaskImage:
            'linear-gradient(to right, transparent 0%, rgba(0,0,0,0.3) 18%, black 55%)',
          maskImage:
            'linear-gradient(to right, transparent 0%, rgba(0,0,0,0.3) 18%, black 55%)',
        }}
      >
        <img
          src={visualSrc}
          alt=""
          decoding="async"
          className="h-full w-full object-cover object-center opacity-90"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-transparent via-transparent to-[#FFFBF6]/30" />
      </div>

      <div className="shell relative z-20 pb-3.5 pt-[84px] sm:pb-4 sm:pt-[94px] lg:pb-4.5 lg:pt-[108px]">
        {eyebrow && (
          <p className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.16em] text-brand-goldDark sm:text-label-sm">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-brand-goldDark animate-pulse" aria-hidden="true" />
            {eyebrow}
          </p>
        )}

        <h1 className="mt-1 font-cormorant text-2xl font-medium tracking-tight text-brand-charcoal sm:text-3xl lg:text-4xl">
          {title}
        </h1>

        <div className="no-scrollbar -mx-4 mt-2.5 flex flex-nowrap items-center gap-1.5 overflow-x-auto px-4 pb-0.5 sm:mx-0 sm:mt-3 sm:flex-wrap sm:gap-2 sm:overflow-visible sm:px-0 sm:pb-0">
          {pills.map((pill) => {
            const isActive = pill.active
            return (
              <Link
                key={pill.label}
                to={pill.to}
                className={cn(
                  'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full font-manrope px-3 py-1 text-xs font-semibold transition-all duration-300 sm:px-3.5 sm:py-1.5 sm:text-[13px]',
                  isActive
                    ? 'bg-gradient-to-r from-[#1A1613] via-[#2C231B] to-[#1A1613] text-[#FDF6E8] shadow-[0_4px_14px_-3px_rgba(20,16,12,0.45)] ring-1 ring-brand-gold/60'
                    : 'border border-[#CDBAA0] bg-white text-brand-charcoal shadow-xs hover:-translate-y-0.5 hover:border-brand-charcoal hover:bg-[#FFFDF7] hover:shadow-sm',
                )}
              >
                {pill.icon && (
                  <Icon
                    name={pill.icon}
                    className={cn('h-3.5 w-3.5', isActive ? 'text-brand-gold' : 'text-brand-goldDark')}
                  />
                )}
                {pill.label}
              </Link>
            )
          })}
        </div>
      </div>

      {/* Soft faded separation: softly dissolves at both edges so it mixes seamlessly into the catalogue */}
      <div
        aria-hidden="true"
        className="relative z-10 mx-auto h-[1px] w-full max-w-[1500px] bg-gradient-to-r from-transparent via-[#D4B982]/60 to-transparent"
      />
    </section>
  )
}

export default ShopBanner

