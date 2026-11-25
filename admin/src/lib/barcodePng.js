/**
 * Rasterise a barcode into a PNG, and hand it to the browser as a download.
 *
 * The barcode is inline SVG because a label has to print crisply, scale to any
 * width and stay recolourable — none of which a fixed bitmap can do. A PNG is
 * what a supplier or a label printer usually asks for, though, and a screenshot
 * of the form is not one, so the export goes back through a canvas.
 *
 * Two things about that trip are not obvious:
 *
 * **The scale is a whole number, always.** The symbol is a run of one-module
 * narrow bars. On screen `shapeRendering="crispEdges"` stops a bar that lands
 * mid-pixel from being antialiased into a grey smear; a raster has no such
 * escape hatch, so the same blur is baked in and a scanner reads a narrower,
 * paler bar than the encoder wrote. Scaling by an integer keeps every run on
 * exact pixel boundaries, which is what makes the output scannable rather than
 * merely readable-looking. Eight gives a 1-module bar 8px, comfortably past the
 * ~2px floor at which most scanners stop resolving.
 *
 * **Nothing inside the SVG can fetch.** An SVG handed to an `<img>` is loaded in
 * a context with no network access, so a webfont would quietly fall back and the
 * caption would come out in the wrong face. `Barcode` draws its caption in a
 * system monospace stack, which the SVG engine resolves locally and which
 * therefore survives the trip — change that to a hosted font and the caption is
 * what breaks first.
 */

/** Pixels per module. Integer by contract — see the note above. */
const DEFAULT_SCALE = 8

/**
 * The barcode as a PNG blob, or `null` when there is nothing encodable to draw.
 *
 * Rejects only if the browser cannot rasterise the SVG at all; a missing or
 * invalid SKU is an ordinary `null`, because `Barcode` already renders a visible
 * "No barcode" state for it and the caller has nothing to report.
 *
 * @param {SVGElement} svg the rendered barcode node
 * @param {{ scale?: number }} [options]
 * @returns {Promise<Blob|null>}
 */
export async function barcodePngBlob(svg, { scale = DEFAULT_SCALE } = {}) {
  if (!svg || svg.tagName?.toLowerCase() !== 'svg' || typeof document === 'undefined') return null

  // The viewBox is in modules, so it — not the element's CSS width — is what the
  // symbol is actually sized by. Reading the laid-out width instead would make
  // the export depend on how wide the form happened to be.
  const box = svg.viewBox?.baseVal
  const width = box?.width || svg.clientWidth
  const height = box?.height || svg.clientHeight
  if (!width || !height) return null

  // The live node inherits the SVG namespace from the document it sits in; a
  // string handed to an `<img>` has to carry it itself or the raster comes back
  // empty. Same for the explicit width/height, which the `100%` in the markup
  // would otherwise leave to the image's default size.
  const clone = svg.cloneNode(true)
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
  clone.setAttribute('width', String(width))
  clone.setAttribute('height', String(height))

  const source = URL.createObjectURL(
    new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' }),
  )

  try {
    const image = await new Promise((resolve, reject) => {
      const element = new Image()
      element.onload = () => resolve(element)
      element.onerror = () => reject(new Error('The barcode could not be rendered as an image.'))
      element.src = source
    })

    const canvas = document.createElement('canvas')
    canvas.width = Math.round(width * scale)
    canvas.height = Math.round(height * scale)

    const context = canvas.getContext('2d')
    if (!context) return null

    // Opaque white under the symbol, whatever the SVG paints for itself. A PNG
    // with a live alpha channel dropped onto dark label stock is a barcode no
    // scanner can find.
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(image, 0, 0, canvas.width, canvas.height)

    return await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
  } finally {
    URL.revokeObjectURL(source)
  }
}

/**
 * Save the barcode as a PNG named `filename`.
 *
 * Resolves `true` when a file was offered, `false` when the SKU had nothing
 * encodable to draw. Silent on success, matching the panel's CSV exports — the
 * browser's own download is the feedback.
 *
 * @returns {Promise<boolean>}
 */
export async function downloadBarcodePng(svg, filename, options) {
  const blob = await barcodePngBlob(svg, options)
  if (!blob) return false

  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
  return true
}

export default downloadBarcodePng
