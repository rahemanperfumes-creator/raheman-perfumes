import cn from '@/lib/cn'
import { asShot } from '@/data/productImages'

/**
 * Vector flacon.
 *
 * The source designs used grey image placeholders. Rather than ship broken
 * images, the storefront draws the bottle itself — an SVG whose glass tint and
 * label follow the fragrance's provenance tier, so every card looks intentional
 * and the page has no external image requests.
 */

const TIER_GLASS = {
  Original: { glass: '#1C1A18', liquid: '#5C131D', cap: '#D8B878', label: '#FFFFFF', ink: '#1C1A18' },
  Inspired: { glass: '#241A33', liquid: '#3B2354', cap: '#D8B878', label: '#FFFFFF', ink: '#3B2354' },
  Mixed: { glass: '#2E1C0C', liquid: '#8C4F1A', cap: '#D8B878', label: '#FFFFFF', ink: '#8C4F1A' },
  Attar: { glass: '#2B2113', liquid: '#6B4C1B', cap: '#D8B878', label: '#FFFFFF', ink: '#6B4C1B' },
  Combo: { glass: '#0F2419', liquid: '#1C402E', cap: '#D8B878', label: '#FFFFFF', ink: '#1C402E' },
  Bakhoor: { glass: '#2B1B12', liquid: '#6E3F1D', cap: '#D8B878', label: '#FFFFFF', ink: '#6E3F1D' },
}

/** Deterministic 0–3 index so a product's bottle shape never changes between renders. */
function shapeIndex(seed = '') {
  let hash = 0
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) % 997
  return hash % 4
}

export function FlaconArt({
  tier = 'Original',
  seed = 'rehman',
  label,
  sublabel,
  volume,
  className,
  showLabel = true,
  muted = false,
}) {
  const palette = TIER_GLASS[tier] ?? TIER_GLASS.Original
  const shape = shapeIndex(seed)

  // Four silhouettes: classic shouldered, tall column, wide decanter, rounded flask.
  const bodies = [
    'M46 96 C46 84 54 78 58 70 L58 44 C58 40 62 38 66 38 L94 38 C98 38 102 40 102 44 L102 70 C106 78 114 84 114 96 L114 168 C114 178 108 184 98 184 L62 184 C52 184 46 178 46 168 Z',
    'M54 84 L54 46 C54 42 58 40 62 40 L98 40 C102 40 106 42 106 46 L106 84 C112 92 116 100 116 110 L116 172 C116 181 110 186 101 186 L59 186 C50 186 44 181 44 172 L44 110 C44 100 48 92 54 84 Z',
    'M40 110 C40 92 58 82 80 82 C102 82 120 92 120 110 L120 164 C120 176 112 184 100 184 L60 184 C48 184 40 176 40 164 Z',
    'M60 92 L60 48 C60 43 64 40 69 40 L91 40 C96 40 100 43 100 48 L100 92 C110 100 116 110 116 122 L116 166 C116 177 108 184 97 184 L63 184 C52 184 44 177 44 166 L44 122 C44 110 50 100 60 92 Z',
  ]

  return (
    <svg
      viewBox="0 0 160 220"
      className={cn('h-full w-full', muted && 'opacity-60', className)}
      role="img"
      aria-label={label ? `${label} bottle` : 'Perfume bottle'}
    >
      <defs>
        <linearGradient id={`glass-${seed}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={palette.glass} stopOpacity="0.95" />
          <stop offset="100%" stopColor={palette.glass} stopOpacity="0.75" />
        </linearGradient>
        <linearGradient id={`liquid-${seed}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={palette.liquid} stopOpacity="0.55" />
          <stop offset="100%" stopColor={palette.liquid} stopOpacity="0.95" />
        </linearGradient>
        <linearGradient id={`cap-${seed}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#B08F4E" />
          <stop offset="45%" stopColor={palette.cap} />
          <stop offset="100%" stopColor="#9A7A3C" />
        </linearGradient>
        <radialGradient id={`glow-${seed}`} cx="50%" cy="35%" r="60%">
          <stop offset="0%" stopColor={palette.cap} stopOpacity="0.35" />
          <stop offset="100%" stopColor={palette.cap} stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Ambient glow behind the bottle */}
      <ellipse cx="80" cy="112" rx="62" ry="86" fill={`url(#glow-${seed})`} />

      {/* Neck & collar */}
      <rect x="70" y="24" width="20" height="16" rx="2" fill={palette.glass} opacity="0.9" />
      <rect x="66" y="36" width="28" height="7" rx="2" fill={`url(#cap-${seed})`} />

      {/* Cap */}
      <rect x="68" y="8" width="24" height="20" rx="3" fill={`url(#cap-${seed})`} />
      <rect x="68" y="8" width="9" height="20" rx="3" fill="#FFFFFF" opacity="0.16" />

      {/* Glass body */}
      <path d={bodies[shape]} fill={`url(#glass-${seed})`} />
      {/* Liquid fill */}
      <path d={bodies[shape]} fill={`url(#liquid-${seed})`} opacity="0.85" />
      {/* Glass highlight */}
      <path d={bodies[shape]} fill="#FFFFFF" opacity="0.07" />
      <rect x="56" y="96" width="7" height="70" rx="3.5" fill="#FFFFFF" opacity="0.13" />

      {/* Outline */}
      <path d={bodies[shape]} fill="none" stroke={palette.cap} strokeOpacity="0.45" strokeWidth="1.4" />

      {/* Label plate */}
      {showLabel && (
        <g>
          <rect x="56" y="118" width="48" height="34" rx="2" fill={palette.label} opacity="0.96" />
          <rect x="56" y="118" width="48" height="34" rx="2" fill="none" stroke={palette.cap} strokeWidth="1" />
          <text
            x="80"
            y="133"
            textAnchor="middle"
            fontFamily="Poppins, sans-serif"
            fontSize="9"
            fontWeight="600"
            letterSpacing="0.8"
            fill={palette.ink}
          >
            {label ? String(label).slice(0, 12).toUpperCase() : 'REHMAN'}
          </text>
          <line x1="64" y1="138" x2="96" y2="138" stroke={palette.cap} strokeWidth="0.7" />
          {sublabel && (
            <text
              x="80"
              y="147"
              textAnchor="middle"
              fontFamily="Poppins, sans-serif"
              fontSize="5.5"
              fontWeight="600"
              letterSpacing="0.5"
              fill={palette.ink}
              opacity="0.75"
            >
              {String(sublabel).slice(0, 18).toUpperCase()}
            </text>
          )}
        </g>
      )}

      {/* Volume tick */}
      {volume && (
        <text
          x="140"
          y="188"
          textAnchor="middle"
          fontFamily="Poppins, sans-serif"
          fontSize="7"
          fontWeight="600"
          letterSpacing="0.6"
          fill={palette.cap}
        >
          {String(volume).toUpperCase()}
        </text>
      )}
    </svg>
  )
}

/**
 * Framed product media. Gives every product card a consistent 4:5 stage with
 * the tier-tinted backdrop the designs used behind the bottle.
 *
 * Pass `image` to show a real photograph on the same stage; without one the
 * stage falls back to the drawn flacon.
 *
 * Pass `hoverImage` as well and the stage dissolves from one shot to the other
 * on hover — a slow cross-fade under a hair of lean-in (see `.media-dissolve`
 * in index.css), rather than a turn. That leans on a `group` ancestor to drive
 * it — the product cards provide one, and anywhere without it the stage simply
 * holds its first face rather than dissolving on someone else's hover.
 */
export function FlaconStage({
  tier = 'Original',
  seed,
  label,
  sublabel,
  volume,
  image,
  hoverImage,
  className,
  compact = false,
  aspect = 'square',
  frameless = false,
}) {
  const palette = TIER_GLASS[tier] ?? TIER_GLASS.Original
  const shot = asShot(image)
  const alternate = asShot(hoverImage)
  const alt = label ? `${label} bottle` : 'Perfume bottle'

  // Both faces sit on the same plate: the shot underneath, the alternate
  // stacked above it and dissolved in on hover only if an alternate shot exists.
  const face = (entry, isAlternate) => (
    <img
      src={entry.src}
      alt={isAlternate ? '' : alt}
      aria-hidden={isAlternate || undefined}
      loading={isAlternate || compact ? 'lazy' : 'eager'}
      decoding="async"
      onError={(e) => {
        if (!e.currentTarget.src.includes('rehman-placeholder-bottle.png')) {
          e.currentTarget.src = '/rehman-placeholder-bottle.png'
        }
      }}
      className={cn(
        'transition-transform duration-500 ease-luxury group-hover:scale-[1.06]',
        'absolute inset-0 h-full w-full object-center',
        entry.fit === 'contain' ? 'object-contain' : 'object-cover',
        alternate ? (isAlternate ? 'media-face-alt z-10' : 'media-face-base z-0') : 'z-0',
      )}
    />
  )

  const activeShot = shot || { src: '/rehman-placeholder-bottle.png', fit: 'contain' }
  const isPlaceholder = !activeShot?.src || activeShot.src.includes('rehman-placeholder-bottle.png')
  const aspectClass = aspect === 'square' ? 'aspect-square' : 'aspect-[4/5]'
  const paddingClass = isPlaceholder
    ? (frameless ? 'p-3 sm:p-4' : compact ? 'p-1.5' : 'p-3')
    : (frameless ? 'p-0' : compact ? 'p-0.5' : 'p-0')

  return (
    <div
      className={cn(
        'relative flex items-center justify-center overflow-hidden bg-gradient-to-br from-[#FFFDF9] via-[#FDF3F5] to-[#FBF1E0]',
        frameless ? 'rounded-lg' : 'rounded-lg border border-[#ECE0CC]',
        aspectClass,
        paddingClass,
        className,
      )}
    >
      <div className={cn('relative z-10 h-full w-full overflow-hidden', !frameless && 'rounded-sm', alternate && 'media-dissolve has-alt')}>
        {face(activeShot, false)}
        {alternate && face(alternate, true)}
      </div>
    </div>
  )
}

/** Centered circular out-of-stock stamp rendered over unavailable product photography. */
export function OutOfStockBadge({ compact = false }) {
  return (
    <span
      className={cn(
        'pointer-events-none absolute left-1/2 top-1/2 z-20 flex -translate-x-1/2 -translate-y-1/2 select-none items-center justify-center rounded-full border border-brand-gold/45 bg-white/95 text-center font-sans font-semibold uppercase leading-[1.2] tracking-[0.06em] text-brand-charcoal shadow-lift backdrop-blur-sm',
        compact ? 'h-14 w-14 text-[9px]' : 'h-[76px] w-[76px] text-[10.5px]',
      )}
    >
      OUT OF
      <br />
      STOCK
    </span>
  )
}

export default FlaconArt
