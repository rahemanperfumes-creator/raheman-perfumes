/**
 * Print one element, and only that element.
 *
 * The receipt lives inside a modal, which is portalled into a page full of
 * sidebar, table and scrim — and a print stylesheet that hides all of that has
 * to fight the modal's scroll container and its transform, either of which
 * clips or re-anchors the receipt on paper. So the receipt is copied into a
 * throwaway iframe along with the page's own stylesheets, and the iframe is
 * printed instead. What prints is exactly what was on screen, with nothing
 * around it.
 *
 * @param {HTMLElement} element
 * @param {string} [title] the document title, which browsers use as the PDF name
 */
export function printElement(element, title = 'Receipt') {
  if (!element || typeof document === 'undefined') return

  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  Object.assign(frame.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' })
  document.body.appendChild(frame)

  const styles = [...document.querySelectorAll('style, link[rel="stylesheet"]')].map((node) => node.outerHTML).join('')
  const safeTitle = String(title).replace(/[<>&]/g, '')

  let printed = false
  const print = () => {
    if (printed) return
    printed = true
    frame.contentWindow?.focus()
    frame.contentWindow?.print()
    // `print()` blocks until the dialog closes in every browser that matters,
    // so the frame can go as soon as it returns; the delay covers the ones that
    // return early and print asynchronously.
    setTimeout(() => frame.remove(), 1500)
  }

  // Fires once the copied stylesheets (and the web fonts) have loaded. The
  // timeout is the fallback for a browser that never fires it on a written
  // document.
  frame.onload = print
  setTimeout(print, 800)

  const doc = frame.contentDocument
  doc.open()
  doc.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>${safeTitle}</title>${styles}` +
      '<style>@page{margin:6mm}html,body{margin:0;background:#fff}</style>' +
      `</head><body>${element.outerHTML}</body></html>`,
  )
  doc.close()
}

export default printElement
