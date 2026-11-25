import cn from '@/lib/cn'

/**
 * Vector flacon — copied from `frontend/src/components/product/FlaconArt.jsx`.
 *
 * The storefront draws its own bottles rather than shipping grey placeholders,
 * and the admin reuses that drawing so a fragrance is recognisable by the same
 * silhouette and tier tint in both apps. Only `FlaconArt` is carried over: the
 * storefront's `FlaconStage` is a 4:5 card frame, which is the wrong shape for
 * a 36px table thumbnail.
 *
 * The glass tint, label and silhouette all follow the provenance tier.
 */

const TIER_GLASS = {
  Original: { glass: '#1C1A18', liquid: '#5C131D', cap: '#D8B878', label: '#FFFFFF', ink: '#1C1A18' },
  Inspired: { glass: '#241A33', liquid: '#3B2354', cap: '#D8B878', label: '#FFFFFF', ink: '#3B2354' },
  Mixed: { glass: '#2E1C0C', liquid: '#8C4F1A', cap: '#D8B878', label: '#FFFFFF', ink: '#8C4F1A' },
  Custom: { glass: '#0F2419', liquid: '#1C402E', cap: '#D8B878', label: '#FFFFFF', ink: '#1C402E' },
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
      </defs>

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

      {/* Label plate — dropped at thumbnail size, where it would be illegible. */}
      {showLabel && label && (
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
            {String(label).slice(0, 12).toUpperCase()}
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

export default FlaconArt
