import { Link } from '@/components/ui/AppLink'
import cn from '@/lib/cn'
import { Icon } from '@/components/ui/Icon'
import { Button } from '@/components/ui/Button'
import { SectionHeading } from '@/components/ui/SectionHeading'
import { FlaconStage } from '@/components/product/FlaconArt'
import { SCENT_FAMILIES } from '@/data/categories'
import { useCategories, useBrands } from '@/store/catalogueStore'

/** Shop-by-category tiles — the admin's live taxonomy, nothing bundled. */
export function CategoryGrid() {
  const categories = useCategories()
  if (categories.length === 0) return null
  return (
    <section className="relative bg-gradient-to-b from-white via-[#FFFBF5] to-[#FDF5F6]/55 py-16 lg:py-20">
      <div className="shell">
      <SectionHeading
        title="Shop by Category"
        action={
          <Button variant="outline" size="sm" to="/shop">
            View All
            <Icon name="arrow-right" className="h-3.5 w-3.5" />
          </Button>
        }
      />

      <ul className="mt-9 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {categories.map((category) => (
          <li key={category.id}>
            <Link
              to={`/shop/${category.slug}`}
              className="group flex h-full flex-col justify-between overflow-hidden rounded-xl border border-[#ECE0CC] bg-gradient-to-b from-white via-[#FFFDF9] to-[#FDF6EB]/85 p-5 shadow-card transition-all duration-300 hover:-translate-y-1.5 hover:border-brand-gold/70 hover:shadow-[0_16px_36px_-12px_rgba(200,155,60,0.24)]"
            >
              <div>
                <div className="h-14 w-14 overflow-hidden rounded-lg border border-brand-border/70 bg-white/70 shadow-sm">
                  <img
                    src={category.image || CATEGORY_IMAGES[category.slug] || CATEGORY_IMAGES[category.id] || '/cat-unisex.jpg?v=3'}
                    alt={category.label}
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  />
                </div>
                <h3 className="mt-3 font-manrope text-base font-semibold text-brand-charcoal sm:mt-4 sm:text-xl">{category.label}</h3>
                {category.blurb && (
                  <p className="mt-1 hidden text-body-sm text-brand-muted sm:block">{category.blurb}</p>
                )}
              </div>

              <span className="mt-5 flex items-center justify-between text-label-sm font-bold uppercase text-brand-muted">
                {category.count} scents
                <Icon
                  name="arrow-right"
                  className="h-3.5 w-3.5 transition-transform duration-300 group-hover:translate-x-1 group-hover:text-brand-goldDark"
                />
              </span>
            </Link>
          </li>
        ))}
      </ul>
      </div>
    </section>
  )
}

const CATEGORY_IMAGES = {
  men: '/rehman-bottle-transparent.png',
  women: '/hero-white.jpg?v=5',
  unisex: '/cat-unisex.jpg?v=3',
  originals: '/pillar-originals.jpg?v=4',
  inspired: '/pillar-inspired.jpg?v=4',
  custom: '/compose.png',
  attars: '/pillar-attars.jpg?v=4',
  combos: '/pillar-combos.jpg?v=4',
  bakhoor: '/pillar-bakhoor.jpg?v=3',
  mixed: '/family-oriental.jpg',
}

/** The brands we stock, straight from the live taxonomy, running continuously right-to-left. */
export function BrandStrip() {
  const brands = useBrands()
  const visibleBrands = brands.filter((b) => b.name)
  if (visibleBrands.length === 0) return null

  // Repeat enough items in each half-track so wide viewports never show empty gaps before looping.
  const repeatCount = Math.max(1, Math.ceil(10 / visibleBrands.length))
  const singleTrack = Array.from({ length: repeatCount }, () => visibleBrands).flat()
  const durationSeconds = Math.max(22, singleTrack.length * 3)

  const wordmarkClass =
    'whitespace-nowrap font-sans text-2xl sm:text-3xl lg:text-4xl font-semibold tracking-tight text-brand-charcoal transition-colors group-hover:text-brand-goldDark'

  const renderBrandGroup = (groupKey, hidden = false) => (
    <ul
      key={groupKey}
      aria-hidden={hidden || undefined}
      className="flex shrink-0 items-center"
    >
      {singleTrack.map((brand, idx) => (
        <li key={`${groupKey}-${brand.id}-${idx}`} className="shrink-0 px-8 sm:px-12 lg:px-14">
          <Link
            to={`/shop?brand=${encodeURIComponent(brand.name)}`}
            tabIndex={hidden ? -1 : undefined}
            className="group flex flex-col items-center justify-center gap-2 py-2 text-center transition-transform duration-300 hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-gold rounded-md"
          >
            <div className="flex h-16 sm:h-20 lg:h-24 items-center justify-center">
              {brand.logo ? (
                <>
                  <img
                    src={brand.logo}
                    alt={brand.name}
                    className="h-full w-auto max-w-[200px] sm:max-w-[260px] object-contain mix-blend-multiply transition-transform duration-300"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none'
                      if (e.currentTarget.nextSibling?.style) {
                        e.currentTarget.nextSibling.style.display = 'block'
                      }
                    }}
                  />
                  <span className={cn('hidden', wordmarkClass)}>
                    {brand.short || brand.name}
                  </span>
                </>
              ) : (
                <span className={wordmarkClass}>
                  {brand.short || brand.name}
                </span>
              )}
            </div>
            {brand.origin && (
              <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-brand-muted">
                {brand.origin}
              </span>
            )}
          </Link>
        </li>
      ))}
    </ul>
  )

  return (
    <section className="border-y border-[#E9DAC1] bg-gradient-to-r from-[#FFFDF9] via-[#FBF3E2]/75 to-[#FFFDF9] py-14">
      <div className="shell">
        <SectionHeading
          align="center"
          title="Brands We Carry"
        />
      </div>

      <div className="brand-marquee mt-10 w-full overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]">
        <div
          className="brand-marquee-track items-center"
          style={{ '--marquee-duration': `${durationSeconds}s` }}
        >
          {renderBrandGroup('track-a')}
          {renderBrandGroup('track-b', true)}
        </div>
      </div>
    </section>
  )
}

/** Scent-family quick filter row. */
export function FamilyStrip({ activeFamily, className }) {
  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {SCENT_FAMILIES.map((family) => {
        const active = activeFamily === family.id
        return (
          <Link
            key={family.id}
            to={`/shop?family=${family.id}`}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-label-sm font-bold uppercase transition',
              active
                ? 'border-brand-charcoal bg-brand-charcoal text-brand-ivory'
                : 'border-brand-border bg-brand-ivory text-ink-variant hover:border-brand-gold hover:text-brand-goldDark',
            )}
          >
            <Icon name={FAMILY_ICONS[family.id] ?? 'sparkle'} className="h-3.5 w-3.5" />
            {family.label}
          </Link>
        )
      })}
    </div>
  )
}

const FAMILY_ICONS = {
  fresh: 'waves',
  woody: 'tree',
  floral: 'flower',
  gourmand: 'sweet',
  citrus: 'spark',
  oud: 'flame',
  musk: 'sparkle',
  oriental: 'crown',
}

/** A single editorial tile used by the "signature" bands on the home page. */
export function SignatureTile({ eyebrow, title, body, to, cta, tier = 'Original', seed, className }) {
  return (
    <Link
      to={to}
      aria-label={`${title} — ${cta}`}
      className={cn(
        'group relative grid overflow-hidden rounded-xl border border-[#ECE0CC] bg-white cursor-pointer transition-all duration-300 hover:border-brand-gold hover:shadow-lift lg:grid-cols-2',
        className,
      )}
    >
      <div className="flex flex-col justify-center p-8 lg:p-12">
        <p className="text-label-md font-bold uppercase tracking-[0.18em] text-brand-goldDark">{eyebrow}</p>
        <h3 className="mt-3 font-cormorant text-3xl font-semibold leading-tight text-brand-charcoal lg:text-headline-xl">
          {title}
        </h3>
        <p className="mt-4 max-w-md text-body-md leading-relaxed text-brand-muted">{body}</p>
        <div className="mt-7">
          <span className="btn btn-primary pointer-events-none transition-transform duration-300 group-hover:scale-[1.02]">
            {cta}
            <Icon name="arrow-right" className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
          </span>
        </div>
      </div>

      <div className="relative min-h-[18rem]">
        <div className="absolute inset-0 p-8 lg:p-10">
          <FlaconStage tier={tier} seed={seed ?? title} label={title} className="h-full" />
        </div>
      </div>
    </Link>
  )
}

export default CategoryGrid
