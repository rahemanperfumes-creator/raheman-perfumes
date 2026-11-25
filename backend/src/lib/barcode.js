/**
 * Code 128 barcodes.
 *
 * Every fragrance carries a **fixed, admin-only barcode** that is a scannable
 * restatement of its SKU — `RP-ORG-1061` encodes as `RP-ORG-1061`. The value is
 * stored on the product (`barcode`) and never re-derived on a read, so a code
 * that has been printed on a label stays valid even if this file's encoding
 * changes.
 *
 * **Why the SKU rather than a fresh number.** A barcode's one job is to be unique
 * and stable, and a SKU already is both: `nextSku()` hands it out from an atomic
 * `Counter`, so two staff members creating a fragrance at the same moment cannot
 * collide. Minting a second identifier would mean a second sequence to keep in
 * step with the first, and two records that can disagree about which bottle is
 * which. Code 128 — not EAN-13 — because the SKU is alphanumeric and hyphenated:
 * EAN-13 is twelve digits plus a check digit, so encoding `RP-ORG-1061` as one
 * would mean either a lossy hash (two SKUs could land on the same retail code) or
 * a registered GS1 prefix the shop does not have.
 *
 * Code 128 is the right symbology for this and not a compromise: it is what
 * warehouse and courier handhelds read natively, it carries the full ASCII range
 * with no padding, and a `RP-INS-1033` label scans to exactly the string printed
 * underneath it.
 *
 * The widths below are the standard 108-symbol table (ISO/IEC 15417). Each of
 * values 0–102 is six alternating runs — bar, space, bar, space, bar, space —
 * summing to 11 modules; the stop pattern is 13. Set B maps value `v` to
 * `String.fromCharCode(v + 32)` for `v ≤ 95`, which covers uppercase, digits,
 * space and the hyphen a SKU needs.
 */

/**
 * Bar/space run widths, indexed by symbol value.
 *
 * A string rather than an array so each entry reads as the widths it is —
 * `'212222'` is 2 bar, 1 space, 2 bar, 2 space, 2 bar, 2 space.
 *
 * Values 0–105 are six runs summing to 11 modules. Value 106, the stop pattern,
 * is the one exception: **seven** runs and 13 modules, because it is the stop
 * symbol with a trailing bar overlapped onto it. Encoding it as six runs produces
 * a symbol that looks entirely plausible and that no scanner will accept, which
 * is why `scripts/barcode.mjs` decodes this table back.
 */
export const SYMBOLS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213', //  0–  9
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132', // 10– 19
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211', // 20– 29
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313', // 30– 39
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331', // 40– 49
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111', // 50– 59
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214', // 60– 69
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111', // 70– 79
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141', // 80– 89
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141', // 90– 99
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112',                             // 100–106
]

/** Start Code B — the set that covers the SKU alphabet. */
const START_B = 104
/** The stop pattern, which is 13 modules because it carries a trailing bar. */
const STOP = 106
/** Code Set B maps values 0–95 onto printable ASCII from the space upward. */
const SET_B_OFFSET = 32
const SET_B_MAX = 95

/**
 * What a barcode may contain.
 *
 * Code Set B covers every character below, and keeping the check here means a SKU
 * typed by hand — a manual override on create — cannot produce a symbol nothing
 * can read. The set is deliberately the SKU's own alphabet: uppercase letters,
 * digits, the hyphen and the space.
 */
const ENCODABLE = /^[A-Z0-9 -]+$/

/** The house's symbology name, stored on the product beside the value. */
export const BARCODE_SYMBOLOGY = 'Code 128'

/**
 * Build the barcode value for a SKU.
 *
 * Uppercase and trimmed for the same reason the model does it to `sku`: a
 * lower-case SKU typed into the panel and the same code minted by `nextSku()`
 * must not produce two different labels for one fragrance.
 *
 * Throws rather than coercing. A SKU that cannot be encoded is a data problem
 * that has to surface at the point it is created, not a barcode that silently
 * scans to the wrong string.
 */
export function barcodeFor(sku) {
  const value = String(sku ?? '')
    .trim()
    .toUpperCase()

  if (!value) throw new Error('A barcode needs a SKU to encode.')
  if (value.length > 48) throw new Error(`SKU “${value}” is too long to encode as a barcode.`)
  if (!ENCODABLE.test(value)) {
    throw new Error(`SKU “${value}” holds characters Code 128 Set B cannot carry. Use A–Z, 0–9, spaces and hyphens.`)
  }
  return value
}

/** The encoded value of one character, per Code Set B. */
function valueOf(character) {
  const code = character.charCodeAt(0) - SET_B_OFFSET
  if (code < 0 || code > SET_B_MAX) {
    throw new Error(`Code 128 Set B cannot encode “${character}”.`)
  }
  return code
}

/**
 * The mod-103 check symbol.
 *
 * **`values` must begin with the start symbol.** The start counts once at
 * weight 1 and every data symbol counts once more than the one before it, so
 * with the start at index 0 the rule is simply `Σ value × (index + 1)` over the
 * whole array — the start's own weight falls out of its position rather than
 * being added separately.
 *
 * That is a real trap worth naming: calling this on the payload *without* the
 * start produces a different, wrong number (for `RP-ORG-1061`, 91 instead of
 * the correct 12). Both look like plausible check digits, so the mistake
 * surfaces only as labels a scanner refuses. `scripts/barcode.mjs` recomputes
 * the check from decoded symbols for exactly this reason.
 *
 * @param {number[]} values `[start, ...data]`
 */
export function checkSymbol(values) {
  const sum = values.reduce((total, value, index) => total + value * (index + 1), 0)
  return sum % 103
}

/**
 * The module widths of a whole barcode, in order, starting with a bar.
 *
 * Exported because the encoder is the only part worth testing on its own: the
 * widths are the barcode, and everything else is presentation.
 *
 * @param {string} value an already-validated barcode value
 * @returns {number[]} 1–4s, alternating bar and space, beginning and ending on a bar
 */
export function modules(value) {
  const characters = [...value]
  const values = [START_B, ...characters.map(valueOf)]
  values.push(checkSymbol(values))
  values.push(STOP)

  const widths = []
  for (const symbol of values) {
    for (const width of SYMBOLS[symbol]) widths.push(Number(width))
  }
  return widths
}

/**
 * The barcode as rectangles, ready to draw.
 *
 * Returned as `{x, width}` pairs in modules rather than as raw widths so a
 * renderer — the admin's SVG, a label PDF — has nothing to interpret: it scales
 * and fills. The quiet zones are included, because a barcode printed flush
 * against a label edge is a barcode a scanner cannot find.
 *
 * @param {string} value
 * @param {{quietZone?: number}} [options] modules of white space on each side
 * @returns {{bars: Array<{x: number, width: number}>, modules: number}}
 */
export function bars(value, { quietZone = 10 } = {}) {
  const widths = modules(value)
  const rects = []
  let x = quietZone
  // Even indices are bars, odd are spaces — the pattern starts with a bar.
  for (let index = 0; index < widths.length; index += 1) {
    const width = widths[index]
    if (index % 2 === 0) rects.push({ x, width })
    x += width
  }
  return { bars: rects, modules: x + quietZone }
}

/**
 * The stored barcode record.
 *
 * An object rather than a bare string because the *symbology* is part of the
 * fact: a label printed as Code 128 and a label printed as EAN-13 are different
 * artifacts, and a printer that only has the number would have to guess. It is
 * also the one field the admin's views emit and the storefront's never do.
 */
export const barcodeRecord = (value) => ({
  value,
  symbology: BARCODE_SYMBOLOGY,
  humanReadable: value,
})

export default { barcodeFor, bars, modules, checkSymbol, barcodeRecord, BARCODE_SYMBOLOGY }
