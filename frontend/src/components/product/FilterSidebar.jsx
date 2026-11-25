import { useRef, useState } from 'react'
import cn from '@/lib/cn'
import { formatPrice } from '@/lib/format'
import { Icon } from '@/components/ui/Icon'
import { Checkbox } from '@/components/ui/Form'
import { TIER_LIST } from '@/data/tiers'
import { SORT_OPTIONS, GENDERS, CONCENTRATIONS } from '@/data/categories'

/** Collapsible filter group. Local to the sidebar — the checkbox bodies are too
 *  rich for the shared copy-only Accordion. */
function FilterSection({ title, meta, open, onToggle, children }) {
  return (
    <div className="border-b border-brand-border last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 py-4 text-left"
      >
        <span className="flex min-w-0 flex-col">
          <span
            className={cn(
              'text-label-sm font-bold uppercase tracking-widest transition-colors',
              open ? 'text-brand-goldDark' : 'text-brand-charcoal',
            )}
          >
            {title}
          </span>
          {meta && !open && <span className="mt-0.5 truncate text-body-sm text-brand-muted">{meta}</span>}
        </span>
        <Icon
          name="chevron-down"
          className={cn('h-4 w-4 shrink-0 text-brand-muted transition-transform duration-300', open && 'rotate-180')}
          strokeWidth={2}
        />
      </button>
      <div className={cn('grid transition-all duration-300 ease-out', open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0')}>
        <div className="overflow-hidden">
          <div className="pb-5 pr-1">{children}</div>
        </div>
      </div>
    </div>
  )
}

/**
 * Catalogue filter rail.
 *
 * Controlled: the owning page holds `filters` and receives patches through
 * `onChange`. Facet counts come from `counts` so shoppers can see how many
 * results a toggle would leave before they commit to it.
 */
export function FilterSidebar({
  filters = {},
  onChange,
  counts = {},
  families = [],
  brands = [],
  priceBounds = [0, 5000],
  className,
  onClear,
  onClose,
  lockTier = false,
}) {
  const [openSections, setOpenSections] = useState(['tier', 'family', 'price'])

  const availableSections = [
    !lockTier && 'tier',
    families.length > 0 && 'family',
    'price',
    brands.length > 0 && 'brand',
    'gender',
    'concentration',
    'availability',
  ].filter(Boolean)

  const anyExpanded = availableSections.some((id) => openSections.includes(id))

  const isOpen = (id) => openSections.includes(id)
  const toggleSection = (id) =>
    setOpenSections((current) => (current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]))

  const patch = (key, value) => onChange?.({ ...filters, [key]: value })

  const toggleIn = (key, value) => {
    const raw = filters[key]
    const current = Array.isArray(raw) ? raw : []
    const next = current.includes(value) ? current.filter((entry) => entry !== value) : [...current, value]
    patch(key, next.length ? next : undefined)
  }

  const activeCount =
    (Array.isArray(filters.tier) ? filters.tier.length : 0) +
    (Array.isArray(filters.family) ? filters.family.length : 0) +
    (Array.isArray(filters.brand) ? filters.brand.length : 0) +
    (Array.isArray(filters.gender) ? filters.gender.length : 0) +
    (Array.isArray(filters.concentration) ? filters.concentration.length : 0) +
    (filters.inStock ? 1 : 0) +
    (filters.price ? 1 : 0) +
    (filters.bestseller ? 1 : 0) +
    (filters.isNew ? 1 : 0)

  const minPrice = filters.price?.[0] ?? priceBounds[0]
  const maxPrice = filters.price?.[1] ?? priceBounds[1]

  // The range is only a filter once it stops covering the whole catalogue, so
  // dragging back out to the ends drops the facet instead of leaving an active
  // chip that excludes nothing.
  const commitPrice = (low, high) => {
    const settled = [
      Math.max(priceBounds[0], Math.min(low, high)),
      Math.min(priceBounds[1], Math.max(low, high)),
    ]
    const isEverything = settled[0] === priceBounds[0] && settled[1] === priceBounds[1]
    patch('price', isEverything ? undefined : settled)
  }

  const span = Math.max(1, priceBounds[1] - priceBounds[0])
  /** Where a price sits along the track, 0–1, as a raw fraction. */
  const ratio = (value) => (value - priceBounds[0]) / span

  // Whichever thumb is further right sits on top. Without this the two can jam
  // together at an end of the track with the grabbable one being the one that
  // has nowhere left to go.
  const minOnTop = ratio(minPrice) >= 0.5

  const railRef = useRef(null)

  /** Send the nearer thumb to a pointer position — a press on the bare track. */
  const jumpTo = (clientX) => {
    const rail = railRef.current
    if (!rail) return
    const rect = rail.getBoundingClientRect()
    const fraction = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    const value = Math.round((priceBounds[0] + fraction * span) / 100) * 100
    if (Math.abs(value - minPrice) <= Math.abs(value - maxPrice)) commitPrice(value, maxPrice)
    else commitPrice(minPrice, value)
  }

  const facetLabel = (key) => {
    const list = Array.isArray(filters[key]) ? filters[key] : []
    if (!list.length) return undefined
    return `${list.length} selected`
  }

  const countFor = (group, id) => counts[group]?.[id]

  return (
    <aside className={cn('w-full', className)} aria-label="Product filters">
      <div className="flex items-center justify-between gap-2 border-b border-brand-border pb-4">
        <h2 className="flex items-center gap-2 text-label-sm font-bold uppercase tracking-widest text-brand-charcoal">
          <Icon name="sliders" className="h-4 w-4 text-brand-goldDark" />
          Refine
          {activeCount > 0 && (
            <span className="rounded-full bg-brand-charcoal px-1.5 py-0.5 text-[10px] text-white">{activeCount}</span>
          )}
        </h2>
        <div className="flex items-center gap-1.5">
          {activeCount > 0 && (
            <button
              type="button"
              onClick={onClear}
              className="mr-1 text-label-sm font-bold uppercase text-brand-goldDark underline-offset-4 transition hover:underline"
            >
              Clear
            </button>
          )}
          <button
            type="button"
            onClick={() => setOpenSections(anyExpanded ? [] : availableSections)}
            title={anyExpanded ? 'Minimize all filter sections' : 'Maximize all filter sections'}
            aria-label={anyExpanded ? 'Minimize all filter sections' : 'Maximize all filter sections'}
            className="inline-flex h-7 items-center gap-1 rounded-full border border-brand-border bg-white px-2.5 text-[10px] font-semibold uppercase tracking-wider text-brand-charcoal transition hover:border-brand-charcoal"
          >
            <Icon name={anyExpanded ? 'minus' : 'plus'} className="h-3 w-3" strokeWidth={2.2} />
            <span>{anyExpanded ? 'Minimize' : 'Maximize'}</span>
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              title="Close filter panel"
              aria-label="Close filter panel"
              className="flex h-7 w-7 items-center justify-center rounded-full border border-brand-border bg-white text-brand-muted transition hover:border-brand-charcoal hover:text-brand-charcoal"
            >
              <Icon name="close" className="h-3.5 w-3.5" strokeWidth={2} />
            </button>
          )}
        </div>
      </div>

      {!lockTier && (
      <FilterSection title="Type" meta={facetLabel('tier')} open={isOpen('tier')} onToggle={() => toggleSection('tier')}>
        <div className="space-y-3">
          {TIER_LIST.map((tier) => (
            <Checkbox
              key={tier.id}
              checked={(Array.isArray(filters.tier) ? filters.tier : []).includes(tier.id)}
              onChange={() => toggleIn('tier', tier.id)}
              label={
                <span className="flex w-full items-start justify-between gap-3">
                  <span className="flex flex-col">
                    <span className="text-body-sm font-semibold text-brand-charcoal">{tier.label}</span>
                    <span className="text-body-sm text-brand-muted">{tier.tagline}</span>
                  </span>
                  {countFor('tier', tier.id) != null && (
                    <span className="shrink-0 text-body-sm text-brand-muted">({countFor('tier', tier.id)})</span>
                  )}
                </span>
              }
            />
          ))}
        </div>
      </FilterSection>
      )}

      {families.length > 0 && (
        <FilterSection title="Scent Family" meta={facetLabel('family')} open={isOpen('family')} onToggle={() => toggleSection('family')}>
          <div className="space-y-2.5">
            {families.map((family) => {
              const id = family.id ?? family
              return (
                <Checkbox
                  key={id}
                  checked={(Array.isArray(filters.family) ? filters.family : []).includes(id)}
                  onChange={() => toggleIn('family', id)}
                  label={
                    <span className="flex w-full items-center justify-between gap-3">
                      <span className="text-body-sm text-brand-charcoal">{family.label ?? family}</span>
                      {countFor('family', id) != null && (
                        <span className="text-body-sm text-brand-muted">({countFor('family', id)})</span>
                      )}
                    </span>
                  }
                />
              )
            })}
          </div>
        </FilterSection>
      )}

      <FilterSection
        title="Price"
        meta={filters.price ? `${formatPrice(minPrice)} – ${formatPrice(maxPrice)}` : undefined}
        open={isOpen('price')}
        onToggle={() => toggleSection('price')}
      >
        <div className="space-y-4 pt-1">
          <div className="flex items-center justify-between text-body-sm font-semibold text-brand-charcoal">
            <span>{formatPrice(minPrice)}</span>
            <span>{formatPrice(maxPrice)}</span>
          </div>

          {/* Track, filled span, then the two thumbs on top of both. */}
          <div
            ref={railRef}
            className="relative h-5"
            onPointerDown={(event) => {
              // A press that landed on a thumb is the native drag's business —
              // the thumb is a pseudo-element, so its events target the input.
              // Anything else is a bare-track press: send the nearer thumb to
              // the spot, which is the one thing pointer-events on the thumbs
              // alone cannot do.
              if (event.target instanceof HTMLInputElement) return
              jumpTo(event.clientX)
            }}
          >
            <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-brand-border" />
            {/* Inset by half a thumb at each end so the fill meets the centres
                of the two thumbs rather than the ends of the track. */}
            <div
              className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-brand-goldDark/70"
              style={{
                left: `calc(0.5625rem + (100% - 1.125rem) * ${ratio(minPrice)})`,
                right: `calc(0.5625rem + (100% - 1.125rem) * ${1 - ratio(maxPrice)})`,
              }}
            />
            <input
              type="range"
              min={priceBounds[0]}
              max={priceBounds[1]}
              step={100}
              value={minPrice}
              onChange={(event) => commitPrice(Number(event.target.value), maxPrice)}
              aria-label="Minimum price"
              className={cn('range-dual absolute inset-0 h-full w-full cursor-pointer', minOnTop ? 'z-20' : 'z-10')}
            />
            <input
              type="range"
              min={priceBounds[0]}
              max={priceBounds[1]}
              step={100}
              value={maxPrice}
              onChange={(event) => commitPrice(minPrice, Number(event.target.value))}
              aria-label="Maximum price"
              className={cn('range-dual absolute inset-0 h-full w-full cursor-pointer', minOnTop ? 'z-10' : 'z-20')}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {[
              [priceBounds[0], 1000, 'Under ₹1,000'],
              [1000, 2000, '₹1,000–2,000'],
              [2000, 3500, '₹2,000–3,500'],
              [3500, priceBounds[1], '₹3,500+'],
            ].map(([low, high, label]) => {
              const active = maxPrice === high && minPrice === low
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => patch('price', active ? undefined : [low, high])}
                  className={cn(
                    'rounded-full border px-3 py-1.5 text-label-sm font-bold uppercase transition',
                    active
                      ? 'border-brand-charcoal bg-brand-charcoal text-brand-ivory'
                      : 'border-brand-border text-ink-variant hover:border-brand-gold hover:text-brand-goldDark',
                  )}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </div>
      </FilterSection>

      {brands.length > 0 && (
        <FilterSection title="Brand" meta={facetLabel('brand')} open={isOpen('brand')} onToggle={() => toggleSection('brand')}>
          <div className="max-h-64 space-y-2.5 overflow-y-auto pr-1">
            {brands.map((brand) => {
              const id = brand.id ?? brand
              return (
                <Checkbox
                  key={id}
                  checked={(Array.isArray(filters.brand) ? filters.brand : []).includes(id)}
                  onChange={() => toggleIn('brand', id)}
                  label={
                    <span className="flex w-full items-center justify-between gap-3">
                      <span className="text-body-sm text-brand-charcoal">{brand.label ?? brand}</span>
                      {countFor('brand', id) != null && (
                        <span className="text-body-sm text-brand-muted">({countFor('brand', id)})</span>
                      )}
                    </span>
                  }
                />
              )
            })}
          </div>
        </FilterSection>
      )}

      <FilterSection title="Wears Best On" meta={facetLabel('gender')} open={isOpen('gender')} onToggle={() => toggleSection('gender')}>
        <div className="space-y-2.5">
          {GENDERS.map((gender) => (
            <Checkbox
              key={gender.id}
              checked={(Array.isArray(filters.gender) ? filters.gender : []).includes(gender.id)}
              onChange={() => toggleIn('gender', gender.id)}
              label={
                <span className="flex w-full items-center justify-between gap-3">
                  <span className="text-body-sm text-brand-charcoal">{gender.label}</span>
                  {countFor('gender', gender.id) != null && (
                    <span className="text-body-sm text-brand-muted">({countFor('gender', gender.id)})</span>
                  )}
                </span>
              }
            />
          ))}
        </div>
      </FilterSection>

      <FilterSection
        title="Concentration"
        meta={facetLabel('concentration')}
        open={isOpen('concentration')}
        onToggle={() => toggleSection('concentration')}
      >
        <div className="space-y-3">
          {CONCENTRATIONS.map((entry) => (
            <Checkbox
              key={entry.id}
              checked={(Array.isArray(filters.concentration) ? filters.concentration : []).includes(entry.id) || (Array.isArray(filters.concentration) ? filters.concentration : []).includes(entry.label)}
              onChange={() => toggleIn('concentration', entry.id)}
              label={
                <span className="flex flex-col">
                  <span className="text-body-sm text-brand-charcoal">{entry.label}</span>
                  <span className="text-body-sm text-brand-muted">
                    {entry.oil} perfume oil
                  </span>
                </span>
              }
            />
          ))}
        </div>
      </FilterSection>

      <FilterSection title="Availability" open={isOpen('availability')} onToggle={() => toggleSection('availability')}>
        <Checkbox
          checked={Boolean(filters.inStock)}
          onChange={() => patch('inStock', !filters.inStock)}
          label={<span className="text-body-sm text-brand-charcoal">In stock only</span>}
        />
      </FilterSection>
    </aside>
  )
}

/** Sort control that pairs with the sidebar in the catalogue toolbar. */
export function SortSelect({ value, onChange, className }) {
  return (
    <div className={cn('inline-flex items-center gap-2', className)}>
      <span className="hidden text-[11px] font-bold uppercase tracking-[0.16em] text-brand-muted sm:inline-block">
        Sort
      </span>
      <div className="relative inline-flex items-center">
        <select
          value={value}
          onChange={(event) => onChange?.(event.target.value)}
          aria-label="Sort products"
          className="appearance-none cursor-pointer rounded-lg border border-brand-border/90 bg-white py-1.5 pl-3.5 pr-8 text-xs font-semibold text-brand-charcoal shadow-xs transition-all duration-200 hover:border-brand-gold hover:bg-neutral-50/60 focus:border-brand-charcoal focus:outline-none focus:ring-1 focus:ring-brand-charcoal"
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-brand-muted">
          <Icon name="chevron-down" className="h-3.5 w-3.5" strokeWidth={2.5} />
        </span>
      </div>
    </div>
  )
}

export default FilterSidebar
