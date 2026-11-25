import { useEffect } from 'react'
import cn from '@/lib/cn'
import { formatPrice } from '@/lib/format'
import { Icon } from '@/components/ui/Icon'

/** Formats date into standard "18 May 2026" format matching reference template */
function formatInvoiceDate(dateInput) {
  if (!dateInput) return new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  try {
    const d = new Date(dateInput)
    if (isNaN(d.getTime())) return String(dateInput).split('at')[0].trim()
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  } catch {
    return String(dateInput)
  }
}

/**
 * Clean Single-Page Invoice matching the user-provided reference template (Image 2).
 * Strictly sized for single-page A4 printing.
 */
export function TaxInvoice({ tracking, className, id = 'printable-tax-invoice' }) {
  if (!tracking) return null

  const items = tracking.items || []
  const subtotal = Number(tracking.amounts?.subtotal) || 0
  const discount = Math.abs(Number(tracking.amounts?.discount) || 0)
  const shipping = Number(tracking.amounts?.shipping) || 0
  const total = Number(tracking.amounts?.total) || (subtotal - discount + shipping)

  const isPaid =
    tracking.payment?.status?.toLowerCase().includes('paid') ||
    tracking.payment?.method?.toLowerCase().includes('razorpay') ||
    tracking.payment?.method?.toLowerCase().includes('online') ||
    tracking.payment?.method?.toLowerCase().includes('prepaid')

  const invoiceNumber = `INV-${String(tracking.orderId || '000001').replace(/^RP/i, '')}`
  const invoiceDate = formatInvoiceDate(tracking.placedAt || tracking.date)
  const termsText = isPaid ? 'Paid via Razorpay' : 'Due on Receipt (COD)'
  const balanceDue = isPaid ? 0 : total

  const dest = tracking.destination || {}
  const customerName = dest.name || tracking.consignee || 'Valued Customer'

  return (
    <article
      id={id}
      className={cn(
        'mx-auto w-full max-w-[800px] bg-white text-[#1E293B] font-sans text-[12px] leading-normal select-text print:max-w-none print:w-full print:p-0 print:m-0 print:shadow-none print:border-none',
        className,
      )}
      style={{
        WebkitPrintColorAdjust: 'exact',
        printColorAdjust: 'exact',
      }}
    >
      <div className="border border-neutral-200 p-8 sm:p-10 bg-white shadow-sm print:border-none print:p-0 print:shadow-none">
        {/* ────────── 1. HEADER (LOGO LEFT, COMPANY RIGHT) ────────── */}
        <header className="flex items-start justify-between gap-6 pb-6">
          {/* Logo Badge (Matching circular logo in reference) */}
          <div className="flex items-center gap-3">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#16A34A] text-white shadow-sm print:bg-[#16A34A]">
              <span className="font-serif text-3xl font-bold tracking-tight">R</span>
            </div>
          </div>

          {/* Company Details (Right aligned as in reference) */}
          <div className="text-right text-[11px] text-neutral-600 leading-snug">
            <p className="font-bold text-[14px] text-neutral-900">Raheman Perfumes</p>
            <p className="mt-0.5">Main Road, Kendrapara</p>
            <p>Kendrapara, Odisha 754211</p>
            <p>India</p>
            <p className="mt-1 font-semibold text-neutral-800">GSTIN: 21AAKPR1234F1Z5</p>
            <p>support@rahemanperfumes.com</p>
          </div>
        </header>

        {/* ────────── 2. CENTERED "INVOICE" TITLE ────────── */}
        <div className="py-2 text-center">
          <h1 className="text-2xl font-normal tracking-[0.2em] text-neutral-800 uppercase font-sans">
            INVOICE
          </h1>
        </div>

        {/* ────────── 3. BILL TO, SHIP TO & INVOICE# ────────── */}
        <div className="flex flex-wrap items-start justify-between gap-6 pt-4 pb-6 text-[11.5px]">
          {/* Left: Bill To & Ship To */}
          <div className="space-y-4 max-w-sm">
            <div>
              <p className="text-neutral-500 font-semibold uppercase text-[10px] tracking-wider">Bill To</p>
              <p className="mt-1 font-bold text-neutral-900 text-[13px]">{customerName}</p>
              <p className="text-neutral-700 leading-relaxed mt-0.5">
                {dest.line1}
                {dest.line2 ? `, ${dest.line2}` : ''}
                <br />
                {dest.city || 'Kendrapara'}
                {dest.state ? `, ${dest.state}` : ' Odisha'} {dest.pincode ? ` ${dest.pincode}` : ''}
                <br />
                India
              </p>
              {dest.phone && (
                <p className="mt-0.5 text-neutral-600 font-mono text-[11px]">Ph: +91 {dest.phone}</p>
              )}
            </div>

            <div>
              <p className="text-neutral-500 font-semibold uppercase text-[10px] tracking-wider">Ship To</p>
              <p className="mt-0.5 text-neutral-700 leading-relaxed">
                {dest.line1}
                <br />
                {dest.city || 'Kendrapara'}
                {dest.state ? `, ${dest.state}` : ' Odisha'} {dest.pincode ? ` ${dest.pincode}` : ''}
                <br />
                India
              </p>
            </div>
          </div>

          {/* Right: Invoice# */}
          <div className="text-right">
            <p className="text-neutral-500 text-[11px]">Invoice#</p>
            <p className="text-sm font-bold text-neutral-900 tracking-wide font-mono mt-0.5">
              {invoiceNumber}
            </p>
            <p className="text-neutral-500 text-[10.5px] mt-1 font-mono">Order #{tracking.orderId}</p>
          </div>
        </div>

        {/* ────────── 4. GREEN HORIZONTAL INFO BAR (MATCHING REFERENCE) ────────── */}
        <div className="bg-[#16A34A] text-white rounded overflow-hidden mb-4 print:bg-[#16A34A]">
          <div className="grid grid-cols-3 divide-x divide-white/20 text-center py-2.5 px-3">
            <div>
              <p className="text-[11px] font-semibold tracking-wide">Invoice Date</p>
              <p className="text-[11px] font-normal mt-1 opacity-95">{invoiceDate}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold tracking-wide">Terms</p>
              <p className="text-[11px] font-normal mt-1 opacity-95">{termsText}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold tracking-wide">Due Date</p>
              <p className="text-[11px] font-normal mt-1 opacity-95">{invoiceDate}</p>
            </div>
          </div>
        </div>

        {/* ────────── 5. TABLE (GREEN HEADER MATCHING REFERENCE) ────────── */}
        <div className="overflow-hidden mb-6">
          <table className="w-full text-left text-[11.5px] border-collapse">
            <thead>
              <tr className="bg-[#16A34A] text-white print:bg-[#16A34A]">
                <th className="py-2.5 px-3 text-center w-10 font-semibold">#</th>
                <th className="py-2.5 px-3 font-semibold text-left">Item & Description</th>
                <th className="py-2.5 px-3 text-center w-20 font-semibold">Qty</th>
                <th className="py-2.5 px-3 text-right w-24 font-semibold">Rate</th>
                <th className="py-2.5 px-3 text-right w-24 font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200">
              {items.map((item, idx) => {
                const itemQty = Number(item.qty) || 1
                const itemPrice = Number(item.price) || 0
                const itemLineTotal = itemPrice * itemQty

                return (
                  <tr key={item.id || idx}>
                    <td className="py-3 px-3 text-center text-neutral-500 font-mono align-top">{idx + 1}</td>
                    <td className="py-3 px-3 align-top">
                      <p className="font-semibold text-neutral-900 text-[12px]">{item.name}</p>
                      <p className="text-[10.5px] text-neutral-500 mt-0.5">
                        Size - {item.volume || '50ml'}, Artisanal Extrait
                      </p>
                    </td>
                    <td className="py-3 px-3 text-center text-neutral-700 font-mono align-top">
                      {itemQty.toFixed(2)}
                      <span className="block text-[10px] text-neutral-400">pcs</span>
                    </td>
                    <td className="py-3 px-3 text-right text-neutral-800 font-mono align-top">
                      {itemPrice.toFixed(2)}
                    </td>
                    <td className="py-3 px-3 text-right font-semibold text-neutral-900 font-mono align-top">
                      {itemLineTotal.toFixed(2)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* ────────── 6. BOTTOM ROW: TERMS LEFT, TOTALS BOX RIGHT ────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_260px] gap-8 items-start pt-2">
          {/* Left: Thank you & Terms */}
          <div className="space-y-4 text-[11px] text-neutral-600">
            <p className="font-medium text-neutral-800">Thanks for your business.</p>

            <div>
              <p className="font-semibold text-neutral-800 uppercase text-[10px] tracking-wider">Terms & Conditions</p>
              <p className="mt-1 leading-relaxed text-neutral-500 text-[10.5px]">
                Full payment is due upon receipt of this invoice. Fragrances travel in tamper-evident sealed packaging. No returns or exchanges accepted once delivered under atelier policy.
              </p>
            </div>

            <div className="pt-2 flex items-center gap-2 text-[10px] text-neutral-400">
              <Icon name="shield-check" className="h-3.5 w-3.5 text-[#16A34A]" />
              <span>Raheman Perfumes Authentic Sealed Atelier · Computer Generated Invoice</span>
            </div>
          </div>

          {/* Right: Shaded Totals Box (Matching reference) */}
          <div className="rounded bg-[#F8FAFC] border border-neutral-200 overflow-hidden text-[11.5px] print:bg-[#F8FAFC]">
            <div className="p-3.5 space-y-2">
              <div className="flex justify-between text-neutral-600">
                <span>Sub Total</span>
                <span className="font-mono text-neutral-900">{subtotal.toFixed(2)}</span>
              </div>

              {discount > 0 && (
                <div className="flex justify-between text-emerald-700">
                  <span>Discount</span>
                  <span className="font-mono">-{discount.toFixed(2)}</span>
                </div>
              )}

              <div className="flex justify-between text-neutral-600">
                <span>Shipping</span>
                <span className="font-mono text-neutral-900">
                  {shipping === 0 ? '0.00' : shipping.toFixed(2)}
                </span>
              </div>

              <div className="flex justify-between text-neutral-600">
                <span>Tax Rate</span>
                <span className="font-mono text-neutral-900">18.00% (Inc)</span>
              </div>

              <div className="flex justify-between border-t border-neutral-200 pt-2 font-bold text-neutral-900 text-[13px]">
                <span>Total</span>
                <span className="font-mono">₹{total.toFixed(2)}</span>
              </div>
            </div>

            {/* Bottom Highlight Bar (Balance Due) */}
            <div className="bg-[#DCFCE7] text-[#166534] px-3.5 py-2 flex justify-between items-center font-bold text-[12px] border-t border-[#BBF7D0] print:bg-[#DCFCE7]">
              <span>Balance Due</span>
              <span className="font-mono">₹{balanceDue.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Bottom Page Number 1 */}
        <div className="mt-8 text-right text-[10px] text-neutral-400 font-mono">
          1
        </div>
      </div>
    </article>
  )
}

/**
 * Interactive Modal for viewing and printing the Tax Invoice.
 */
export function TaxInvoiceModal({ tracking, open, onClose }) {
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && open) onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  if (!open || !tracking) return null

  const handlePrint = () => {
    window.print()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/75 p-3 sm:p-6 backdrop-blur-sm print:p-0 print:bg-white print:static print:overflow-visible">
      {/* Container */}
      <div className="relative flex flex-col max-h-[95vh] w-full max-w-[850px] rounded-2xl bg-neutral-100 shadow-2xl print:max-h-none print:shadow-none print:rounded-none print:bg-white print:w-full">
        {/* Floating Top Control Bar (Hidden when printing) */}
        <div className="no-print flex shrink-0 items-center justify-between border-b border-neutral-300 bg-white px-5 py-3 rounded-t-2xl">
          <div className="flex items-center gap-2.5">
            <Icon name="file-text" className="h-5 w-5 text-[#16A34A]" />
            <h2 className="text-sm font-bold text-neutral-900">
              Invoice — Order #{tracking.orderId}
            </h2>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-2 rounded-xl bg-[#16A34A] px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-[#15803D] active:scale-95"
            >
              <Icon name="printer" className="h-4 w-4" />
              <span>Print / Download PDF</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close invoice preview"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-500 transition hover:bg-neutral-100 hover:text-neutral-900"
            >
              <Icon name="close" className="h-4 w-4" strokeWidth={2.2} />
            </button>
          </div>
        </div>

        {/* Scrollable Document Preview Body */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-6 print:p-0 print:overflow-visible">
          <TaxInvoice tracking={tracking} />
        </div>
      </div>
    </div>
  )
}

export default TaxInvoice
