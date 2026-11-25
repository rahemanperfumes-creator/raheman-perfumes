import { forwardRef, useMemo } from 'react'
import cn from '@/lib/cn'

/**
 * A scannable Code 128 barcode, drawn as inline SVG.
 *
 * The encoder itself lives on the server (`backend/src/lib/barcode.js`), and this
 * is the *only* other copy of the table — a deliberate duplication, because the
 * alternative is worse in both directions. Fetching a barcode image from the API
 * would mean a network round trip per row of a printed label sheet, and a
 * server-rendered PNG cannot be recoloured, scaled or printed crisply at 300 dpi.
 * A browser-side encoder needs the widths, and the widths are the whole table.
 *
 * **The two tables must not drift.** `backend/scripts/barcode.mjs` is the guard:
 * it verifies the server's copy against the specification's bit patterns, so if
 * this file and that one ever disagree it is this one that is wrong, and the
 * symptom would be labels that look fine and scan as garbage. Keep them in step.
 *
 * Set B only, and the same alphabet the server accepts — A–Z, 0–9, space and
 * hyphen. Anything else renders nothing rather than a plausible-looking symbol,
 * because a barcode that lies is worse than one that is visibly absent.
 */

/** Run widths by symbol value. Values 0–105 are 11 modules, the stop is 13. */
const SYMBOLS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
]

const START_B = 104
const STOP = 106
const SET_B_OFFSET = 32

/** The same alphabet the server encodes: A–Z, 0–9, space, hyphen. */
const ENCODABLE = /^[A-Z0-9 -]+$/

/**
 * Bar rectangles for a value, in modules.
 *
 * Mirrors the server's `bars()`. The quiet zone is included as leading and
 * trailing white space — a barcode printed flush against a label edge is one a
 * scanner cannot find, which is why the margin is part of the geometry rather
 * than a CSS padding someone can override.
 */
export function encodeBars(value, { quietZone = 10 } = {}) {
  const text = String(value ?? '').trim().toUpperCase()
  if (!text || !ENCODABLE.test(text)) return null

  const values = [START_B, ...[...text].map((character) => character.charCodeAt(0) - SET_B_OFFSET)]
  // `Σ value × (index + 1)` over `[start, ...data]`, mod 103 — the start occupies
  // weight 1. See the note on the server's `checkSymbol`.
  values.push(values.reduce((total, symbol, index) => total + symbol * (index + 1), 0) % 103)
  values.push(STOP)

  const bars = []
  let x = quietZone
  for (const symbol of values) {
    const widths = SYMBOLS[symbol]
    for (let index = 0; index < widths.length; index += 1) {
      const width = Number(widths[index])
      if (index % 2 === 0) bars.push({ x, width })
      x += width
    }
  }

  return { bars, modules: x + quietZone }
}

/**
 * The barcode as an SVG.
 *
 * `height` is in user units and the width follows from the module count, so the
 * symbol is always proportional — a stretched barcode is an unreadable one, and
 * deriving the width rather than taking it as a prop makes that impossible.
 * `shapeRendering="crispEdges"` stops a browser antialiasing the narrow bars into
 * a grey smear at small sizes.
 *
 * The `ref` is forwarded so a caller can reach the rendered node and rasterise
 * it — see `lib/barcodePng.js`. It lands on whichever of the two states below
 * was drawn, so a caller that needs the drawing itself should check for an
 * `<svg>` rather than assume one.
 *
 * `emptyLabel` words the placeholder for its context, because "no encodable SKU"
 * is only one of the two reasons there is nothing to draw. The other is a
 * fragrance that has not been saved yet and so has no SKU at all — see
 * `ProductFormModal`, which says so rather than implying the SKU is broken.
 */
export const Barcode = forwardRef(function Barcode(
  { value, height = 56, showValue = true, className, emptyLabel = 'No barcode — this fragrance has no encodable SKU.' },
  ref,
) {
  const encoded = useMemo(() => encodeBars(value), [value])

  // Visibly absent rather than plausibly wrong. A fragrance with no SKU yet is
  // the realistic case, and a blank space where a label belongs is the honest
  // thing to draw.
  if (!encoded) {
    return (
      <span
        ref={ref}
        className={cn(
          'inline-flex h-full min-h-[3rem] w-full items-center justify-center rounded border border-dashed border-outline-variant bg-surface-low/60 px-3 text-body-sm text-ink-muted',
          className,
        )}
      >
        {emptyLabel}
      </span>
    )
  }

  const { bars, modules } = encoded
  const caption = String(value).trim().toUpperCase()
  // The caption sits under the bars; the viewBox is just the symbol itself.
  const captionHeight = showValue ? 16 : 0

  return (
    <svg
      ref={ref}
      role="img"
      aria-label={`Barcode ${caption}`}
      viewBox={`0 0 ${modules} ${height + captionHeight}`}
      width="100%"
      height={height + captionHeight}
      preserveAspectRatio="xMidYMid meet"
      className={cn('block', className)}
    >
      {/* Always on paper white, never on the theme's surface — a barcode
          inverted by dark mode is a barcode scanners refuse. */}
      <rect x="0" y="0" width={modules} height={height + captionHeight} fill="#ffffff" />
      {bars.map((bar, index) => (
        <rect key={index} x={bar.x} y="0" width={bar.width} height={height} fill="#000000" shapeRendering="crispEdges" />
      ))}
      {showValue && (
        <text
          x={modules / 2}
          y={height + 12}
          textAnchor="middle"
          fill="#000000"
          // Monospace and widely tracked: the caption is read character by
          // character off a label, often by someone checking it against a screen.
          style={{ font: '600 11px ui-monospace, SFMono-Regular, Menlo, monospace', letterSpacing: '0.18em' }}
        >
          {caption}
        </text>
      )}
    </svg>
  )
})

export default Barcode
