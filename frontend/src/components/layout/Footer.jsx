import { useState } from 'react'
import { Link } from '@/components/ui/AppLink'
import cn from '@/lib/cn'
import { Icon } from '@/components/ui/Icon'
import {
  FOOTER_COLUMNS,
  SOCIAL_LINKS,
  PAYMENT_BADGES,
  HOUSE_BLURB,
  COPYRIGHT,
  TAGLINE,
} from '@/data/content'
import { Logo } from './Brand'
import { useShowcase } from '@/store/catalogueStore'

export function Footer({ flush = false }) {
  const showcase = useShowcase()
  const [openSection, setOpenSection] = useState(null)
  const badges = showcase.codEnabled ? PAYMENT_BADGES : PAYMENT_BADGES.filter((b) => b !== 'COD')

  const toggleSection = (id) => {
    setOpenSection((current) => (current === id ? null : id))
  }

  return (
    <footer className={cn(flush ? 'mt-0' : 'mt-14 lg:mt-20', 'bg-brand-charcoal text-brand-cream')}>
      {/* Link columns — full 4-column layout on desktop, auto-minimized accordion on mobile/tablet */}
      <div className="shell grid gap-6 py-9 lg:grid-cols-[1.3fr_repeat(3,1fr)] lg:gap-10 lg:py-14">
        <div>
          <Logo size="lg" />
          <p className="mt-4 hidden max-w-sm text-body-sm leading-relaxed text-brand-cream/65 sm:block">
            {HOUSE_BLURB}
          </p>

          <div className="mt-5 flex items-center gap-2 lg:mt-6">
            {SOCIAL_LINKS.map((social) => (
              <a
                key={social.id}
                href={social.href}
                aria-label={social.label}
                className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 text-brand-cream/70 transition hover:border-brand-gold hover:text-brand-gold"
              >
                <Icon name={social.icon} className="h-4 w-4" />
              </a>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 lg:mt-6 lg:flex-col lg:gap-y-2">
            <a
              href="tel:+917504468885"
              className="flex items-center gap-2 text-body-sm text-brand-cream/65 transition hover:text-brand-gold"
            >
              <Icon name="phone" className="h-3.5 w-3.5" />
              +91 75044 68885
            </a>
            <a
              href="mailto:rahemanperfumes@gmail.com"
              className="flex items-center gap-2 text-body-sm text-brand-cream/65 transition hover:text-brand-gold"
            >
              <Icon name="mail" className="h-3.5 w-3.5" />
              rahemanperfumes@gmail.com
            </a>
          </div>
        </div>

        <div className="divide-y divide-white/10 border-t border-white/10 lg:contents">
          {FOOTER_COLUMNS.map((column) => {
            const isOpen = openSection === column.id
            return (
              <nav key={column.id} aria-label={column.title} className="lg:border-0">
                {/* Mobile/tablet collapsible trigger */}
                <button
                  type="button"
                  onClick={() => toggleSection(column.id)}
                  aria-expanded={isOpen}
                  className="flex w-full items-center justify-between py-3.5 text-left lg:hidden"
                >
                  <span className="text-label-sm font-bold uppercase tracking-[0.18em] text-brand-gold">
                    {column.title}
                  </span>
                  <Icon
                    name="chevron-down"
                    className={cn(
                      'h-4 w-4 text-brand-gold/80 transition-transform duration-200',
                      isOpen && 'rotate-180',
                    )}
                    strokeWidth={2}
                  />
                </button>

                {/* Desktop static heading */}
                <h3 className="hidden text-label-sm font-bold uppercase tracking-[0.18em] text-brand-gold lg:block">
                  {column.title}
                </h3>

                <ul
                  className={cn(
                    'space-y-2.5 pb-4 lg:mt-4 lg:block lg:pb-0',
                    isOpen ? 'block' : 'hidden',
                  )}
                >
                  {column.links.map((link) => (
                    <li key={`${column.id}-${link.label}`}>
                      <Link
                        to={link.to}
                        onClick={() => setOpenSection(null)}
                        className="font-manrope text-body-sm font-semibold text-brand-cream/65 transition-colors hover:text-brand-ivory"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            )
          })}
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-white/10">
        <div className="shell flex flex-col gap-3 py-5 lg:flex-row lg:items-center lg:justify-between lg:gap-4 lg:py-6">
          <div className="flex flex-col gap-1">
            <p className="text-xs text-brand-cream/55 sm:text-body-sm">{COPYRIGHT}</p>
            <p className="hidden text-body-sm text-brand-cream/45 md:block">{TAGLINE}</p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <span className="hidden text-label-sm font-bold uppercase text-brand-cream/45 sm:inline">
              We Accept
            </span>
            {badges.map((badge) => (
              <span
                key={badge}
                className="rounded border border-white/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand-cream/70 sm:px-2.5 sm:py-1"
              >
                {badge}
              </span>
            ))}
          </div>
        </div>
      </div>
    </footer>
  )
}

export default Footer
