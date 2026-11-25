import cn from '@/lib/cn'
import { Icon } from '@/components/ui/Icon'
import { FlaconArt } from '@/components/ui/FlaconArt'
import { resolveImageUrl } from '@/lib/api'

export const PLACEHOLDER_IMAGE = '/rehman-placeholder-bottle.png'

/**
 * A product's face at row size.
 *
 * Shows the uploaded photograph when the record has one, or the official
 * Rehman Perfume bottle placeholder when the admin has not added photography.
 */
export function ProductThumb({ product, image, className = 'h-10 w-10' }) {
  const rawUrl =
    image ||
    product?.images?.[0]?.url ||
    (typeof product?.images?.[0] === 'string' ? product.images[0] : '') ||
    product?.image ||
    PLACEHOLDER_IMAGE

  const resolvedUrl = resolveImageUrl(rawUrl)

  const isPlaceholder = !resolvedUrl || resolvedUrl.includes('rehman-placeholder-bottle.png')
  const frame = cn(
    'flex shrink-0 items-center justify-center overflow-hidden rounded border border-outline-variant/60 bg-brand-cream/60',
    className,
  )

  return (
    <span className={frame}>
      <img
        src={resolvedUrl}
        alt={product?.name ? `${product.name} — photograph` : 'Perfume bottle'}
        className={cn(
          'h-full w-full object-center transition-transform hover:scale-105',
          isPlaceholder ? 'object-contain p-0.5' : 'object-cover',
        )}
        loading="lazy"
        onError={(e) => {
          if (!e.currentTarget.src.includes('rehman-placeholder-bottle.png')) {
            e.currentTarget.src = PLACEHOLDER_IMAGE
          }
        }}
      />
    </span>
  )
}

export default ProductThumb
