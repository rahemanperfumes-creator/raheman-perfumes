import { Link, useLocation } from '@/components/ui/AppLink'
import cn from '@/lib/cn'
import useUiStore from '@/store/uiStore'
import { Icon } from '@/components/ui/Icon'
import { Drawer } from '@/components/ui/Modal'
import { TIER_LIST } from '@/data/tiers'
import { useCategories } from '@/store/catalogueStore'
import { MOBILE_NAV, SOCIAL_LINKS } from '@/data/content'
import { Logo } from './Brand'

/** Slide-in navigation for small screens. */
export function MobileNav() {
  const location = useLocation()
  const { mobileMenuOpen, closeMobileMenu } = useUiStore()
  // Collections come from the server-hydrated taxonomy; until it answers there
  // is nothing to list, so the section stays hidden rather than inventing rows.
  const categories = useCategories()

  return (
    <Drawer open={mobileMenuOpen} onClose={closeMobileMenu} side="left" title="Menu" width="max-w-[21rem]">
      <div className="flex items-center justify-between border-b border-brand-border px-5 py-4">
        <Logo onClick={closeMobileMenu} />
        <button
          type="button"
          onClick={closeMobileMenu}
          aria-label="Close menu"
          className="flex h-9 w-9 items-center justify-center rounded-full text-brand-muted transition hover:bg-neutral-100 hover:text-brand-charcoal"
        >
          <Icon name="close" className="h-4 w-4" strokeWidth={2} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-5">
        <nav aria-label="Mobile">
          <ul className="space-y-0.5">
            {MOBILE_NAV.map((item) => {
              const active = location.pathname === item.to
              return (
                <li key={item.id}>
                  <Link
                    to={item.to}
                    onClick={closeMobileMenu}
                    className={cn(
                      'flex items-center justify-between gap-3 rounded px-3 py-3 font-manrope text-body-md font-semibold transition',
                      active ? 'bg-neutral-100 text-brand-goldDark' : 'text-brand-charcoal hover:bg-neutral-50',
                    )}
                  >
                    <span className="flex items-center gap-2">
                      {item.label}
                      {item.badge && (
                        <span className="rounded-full border border-brand-gold/50 bg-white px-1.5 py-0.5 text-[9px] font-bold uppercase text-brand-goldDark">
                          {item.badge}
                        </span>
                      )}
                    </span>
                    <Icon name="chevron-right" className="h-3.5 w-3.5 text-brand-muted" />
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>

        <div className="mt-7">
          <p className="eyebrow mb-3">Shop by Type</p>
          <div className="flex flex-wrap gap-2">
            {TIER_LIST.map((tier) => (
              <Link
                key={tier.id}
                to={`/shop/${tier.id.toLowerCase()}`}
                onClick={closeMobileMenu}
                className={cn('tier-chip', tier.border, tier.surface, tier.text)}
              >
                {tier.label}
              </Link>
            ))}
          </div>
        </div>

        {categories.length > 0 && (
        <div className="mt-7">
          <p className="eyebrow mb-3">Collections</p>
          <ul className="grid grid-cols-2 gap-2">
            {categories.slice(0, 8).map((category) => (
              <li key={category.id}>
                <Link
                  to={`/shop/${category.slug}`}
                  onClick={closeMobileMenu}
                  className="flex flex-col rounded border border-brand-border bg-white px-3 py-2.5 transition hover:border-brand-gold hover:bg-neutral-50"
                >
                  <span className="text-body-sm font-semibold text-brand-charcoal">{category.label}</span>
                  <span className="text-body-sm text-brand-muted">{category.blurb}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
        )}
      </div>

      <div className="border-t border-brand-border bg-white px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <Link
            to="/track-order"
            onClick={closeMobileMenu}
            className="flex items-center gap-2 text-label-sm font-bold uppercase text-brand-charcoal"
          >
            <Icon name="route" className="h-4 w-4 text-brand-goldDark" />
            Track Order
          </Link>
          <div className="flex items-center gap-1.5">
            {SOCIAL_LINKS.map((social) => (
              <a
                key={social.id}
                href={social.href}
                aria-label={social.label}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-brand-border text-ink-variant transition hover:border-brand-gold hover:text-brand-goldDark"
              >
                <Icon name={social.icon} className="h-3.5 w-3.5" />
              </a>
            ))}
          </div>
        </div>
      </div>
    </Drawer>
  )
}

export default MobileNav
