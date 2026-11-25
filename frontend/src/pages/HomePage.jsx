import { useEffect } from 'react'
import { Icon } from '@/components/ui/Icon'
import { Button } from '@/components/ui/Button'
import { SectionHeading } from '@/components/ui/SectionHeading'
import { Accordion } from '@/components/ui/Accordion'
import { Reveal } from '@/components/ui/Reveal'
import { Hero, Pillars, GenderShowcase, OccasionGrid } from '@/components/home/Hero'
import { BrandStrip } from '@/components/home/Collections'
import {
  BestSellers,
  ComingSoon,
  DealsOfDay,
  ShopByNotes,
  WhyShopWithUs,
} from '@/components/home/Showcase'
import { HOME_FAQ, HOUSE_BLURB } from '@/data/content'
import { useCatalogueStore } from '@/store/catalogueStore'
import { useDocumentTitle } from '@/hooks/useDocumentTitle'

/**
 * Storefront home.
 *
 * Reads top to bottom as an editorial page: hero, the pillars, what we stock
 * (categories then maisons), the provenance explainer, then merchandising rails
 * and trust proof.
 */
export function HomePage() {
  useDocumentTitle('Raheman Perfumes — Original Perfumes, Attars & Combos')
  const refreshShowcase = useCatalogueStore((state) => state.refreshShowcase)

  useEffect(() => {
    refreshShowcase()
  }, [refreshShowcase])

  useEffect(() => {
    const script = document.createElement('script')
    script.type = 'application/ld+json'
    script.text = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Store',
      name: 'Raheman Perfumes',
      description: HOUSE_BLURB,
      address: {
        '@type': 'PostalAddress',
        addressCountry: 'IN',
      },
      telephone: '+91-75044-68885',
    })
    document.head.appendChild(script)
    return () => {
      document.head.removeChild(script)
    }
  }, [])

  return (
    <>
      {/* 1. Landing page hero banner */}
      <Hero />

      {/* 2. The Bestsellers */}
      <Reveal>
        <BestSellers />
      </Reveal>

      {/* 3. The 4 Category Tiles: Perfumes, Attars, Combos, Bakhoor */}
      <Reveal>
        <Pillars />
      </Reveal>

      {/* 4. Brands We Carry */}
      <Reveal>
        <BrandStrip />
      </Reveal>

      {/* 5. Discover Your Signature Scent */}
      <Reveal>
        <OccasionGrid />
      </Reveal>

      {/* 6. Shop by Gender */}
      <Reveal>
        <GenderShowcase />
      </Reveal>

      {/* 7. Shop by Notes */}
      <Reveal>
        <ShopByNotes />
      </Reveal>

      {/* 8. Best Discounts Right Now */}
      <Reveal>
        <DealsOfDay />
      </Reveal>

      {/* 9. Upcoming Perfumes (Coming Soon) */}
      <Reveal>
        <ComingSoon />
      </Reveal>

      {/* 10. Why Customers Come Back & Rest as it is */}
      <Reveal>
        <WhyShopWithUs />
      </Reveal>

      {/* FAQ */}
      <Reveal as="section" className="bridal-banner border-b border-[#ECE0CC] py-16 lg:py-20">
        <div className="shell grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
          <div>
            <SectionHeading title="Before You Order" />
            <div className="mt-7 flex flex-wrap gap-3">
              <Button variant="primary" to="/pages/faqs">
                All Fragrance FAQs
              </Button>
              <Button variant="outline" to="/pages/contact">
                Contact Us
              </Button>
            </div>
          </div>

          <Accordion items={HOME_FAQ} />
        </div>
      </Reveal>

      {/* Closing CTA */}
      <Reveal as="section" className="shell py-16 lg:py-20">
        <div
          className="relative overflow-hidden rounded-xl bg-brand-charcoal bg-cover bg-center bg-no-repeat px-8 py-16 text-center text-brand-ivory shadow-2xl lg:px-16 lg:py-20"
          style={{ backgroundImage: "url('/finder.png?v=3')" }}
        >
          {/* Gentle darkening overlay so text remains crystal clear */}
          <div className="pointer-events-none absolute inset-0 bg-black/35 backdrop-brightness-95" aria-hidden="true" />
          <div className="relative z-10 mx-auto max-w-2xl">
            <h2 className="font-serif text-3xl font-medium leading-tight lg:text-headline-xl">
              Find the scent that becomes your signature.
            </h2>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <Button variant="gold" size="lg" to="/shop">
                Shop Fragrances
                <Icon name="arrow-right" className="h-4 w-4" />
              </Button>
              <Button variant="outline-inverse" size="lg" to="/offers">
                View Current Offers
              </Button>
            </div>
          </div>
        </div>
      </Reveal>
    </>
  )
}

export default HomePage
