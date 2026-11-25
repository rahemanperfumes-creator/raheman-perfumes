import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import cn from '@/lib/cn'
import { Icon } from '@/components/ui/Icon'
import { useAdminStore } from '@/store/adminStore'
import { useUiStore } from '@/store/uiStore'
import { formatPrice } from '@/lib/format'
import { useScrollLock } from '@/components/ui/Modal'

const MAX_PER_GROUP = 5

/**
 * ⌘K palette.
 *
 * The mockup draws the affordance and stops there; wiring it costs little and
 * it is how anyone who uses a back office all day actually navigates. It
 * searches the three record types staff look up by name — fragrances, orders,
 * customers — and each result deep-links to the record itself rather than to
 * the list it lives in.
 */
export function CommandSearch() {
  const open = useUiStore((state) => state.commandOpen)
  const setOpen = useUiStore((state) => state.setCommandOpen)

  const products = useAdminStore((state) => state.products)
  const orders = useAdminStore((state) => state.orders)
  const customers = useAdminStore((state) => state.customers)

  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const inputRef = useRef(null)
  const navigate = useNavigate()

  useScrollLock(open)

  // Global shortcut. Bound once for the app's lifetime.
  useEffect(() => {
    const onKeyDown = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setOpen(!useUiStore.getState().commandOpen)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [setOpen])

  // Reset on each open, and take focus once the panel has mounted.
  useEffect(() => {
    if (!open) return undefined
    setQuery('')
    setCursor(0)
    const timer = setTimeout(() => inputRef.current?.focus(), 30)
    return () => clearTimeout(timer)
  }, [open])

  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return []

    const match = (haystack) => String(haystack).toLowerCase().includes(needle)

    return [
      {
        id: 'products',
        label: 'Fragrances',
        items: products
          .filter((p) => match(p.name) || match(p.brand) || match(p.sku) || match(p.category))
          .slice(0, MAX_PER_GROUP)
          .map((p) => ({
            id: p.id,
            icon: 'package',
            label: p.name,
            hint: `${p.brand} · ${p.sku} · ${formatPrice(p.price)}`,
            to: `/products?focus=${encodeURIComponent(p.id)}`,
          })),
      },
      {
        id: 'orders',
        label: 'Orders',
        items: orders
          .filter((o) => match(o.id) || match(o.customer) || match(o.city))
          .slice(0, MAX_PER_GROUP)
          .map((o) => ({
            id: o.id,
            icon: 'bag',
            label: o.id,
            hint: `${o.customer} · ${o.status} · ${formatPrice(o.amount)}`,
            to: `/orders?focus=${encodeURIComponent(o.id)}`,
          })),
      },
      {
        id: 'customers',
        label: 'Customers',
        items: customers
          .filter((c) => match(c.name) || match(c.email) || match(c.phone) || match(c.city))
          .slice(0, MAX_PER_GROUP)
          .map((c) => ({
            id: c.id,
            icon: 'user',
            label: c.name,
            hint: `${c.email} · ${c.city}`,
            to: `/customers?focus=${encodeURIComponent(c.id)}`,
          })),
      },
    ].filter((group) => group.items.length > 0)
  }, [query, products, orders, customers])

  const flat = useMemo(() => groups.flatMap((group) => group.items), [groups])

  const go = (item) => {
    if (!item) return
    setOpen(false)
    navigate(item.to)
  }

  const onKeyDown = (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setCursor((current) => Math.min(current + 1, flat.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setCursor((current) => Math.max(current - 1, 0))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      go(flat[cursor])
    } else if (event.key === 'Escape') {
      setOpen(false)
    }
  }

  if (!open) return null

  let index = -1

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-start justify-center p-4 pt-[12vh]">
      <div className="fixed inset-0 bg-shell-obsidian/45 backdrop-blur-[2px] animate-fade-in" onClick={() => setOpen(false)} aria-hidden="true" />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search everything"
        className="relative w-full max-w-xl overflow-hidden rounded border border-outline-variant bg-brand-paper shadow-overlay animate-scale-in"
      >
        <div className="relative border-b border-outline-variant/60">
          <Icon name="search" className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setCursor(0)
            }}
            onKeyDown={onKeyDown}
            placeholder="Search orders, customers, codes, perfumes…"
            aria-label="Search orders, customers, codes and perfumes"
            className="w-full bg-transparent py-4 pl-11 pr-16 text-body-md text-ink outline-none placeholder:text-ink-muted/60"
          />
          <kbd className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded bg-surface px-1.5 py-0.5 text-label-sm font-bold uppercase tracking-wider text-ink-muted">
            Esc
          </kbd>
        </div>

        <div className="max-h-[26rem] overflow-y-auto">
          {query.trim().length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-body-sm text-ink-muted">
                Search across {products.length} fragrances, {orders.length} orders and {customers.length} customers.
              </p>
              <p className="mt-1.5 text-body-sm text-ink-muted/70">
                Try a SKU like <span className="font-semibold text-ink-variant">RP-INS</span>, an order like{' '}
                <span className="font-semibold text-ink-variant">RP2041</span>, or a note like{' '}
                <span className="font-semibold text-ink-variant">oud</span>.
              </p>
            </div>
          ) : flat.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-body-sm text-ink-muted">
                Nothing matches “{query.trim()}”. Try a shorter fragment.
              </p>
            </div>
          ) : (
            groups.map((group) => (
              <div key={group.id} className="py-1">
                <p className="px-4 py-1.5 text-label-sm font-bold uppercase tracking-wider text-ink-muted">{group.label}</p>
                <ul>
                  {group.items.map((item) => {
                    index += 1
                    const active = index === cursor
                    return (
                      <li key={`${group.id}-${item.id}`}>
                        <button
                          type="button"
                          onMouseEnter={() => setCursor(flat.indexOf(item))}
                          onClick={() => go(item)}
                          className={cn(
                            'flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors',
                            active ? 'bg-brand-gold/15' : 'hover:bg-surface-low',
                          )}
                        >
                          <Icon name={item.icon} className="h-4 w-4 shrink-0 text-ink-muted" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-body-sm font-semibold text-ink">{item.label}</span>
                            <span className="mt-0.5 block truncate text-body-sm text-ink-muted">{item.hint}</span>
                          </span>
                          {active && <Icon name="arrow-right" className="h-3.5 w-3.5 shrink-0 text-brand-goldDeep" />}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))
          )}
        </div>

        <footer className="flex items-center gap-4 border-t border-outline-variant/60 bg-surface-low/60 px-4 py-2 text-label-sm text-ink-muted">
          <span className="flex items-center gap-1">
            <kbd className="rounded bg-surface px-1 py-0.5 font-bold">↑</kbd>
            <kbd className="rounded bg-surface px-1 py-0.5 font-bold">↓</kbd> to navigate
          </span>
          <span className="flex items-center gap-1">
            <kbd className="rounded bg-surface px-1 py-0.5 font-bold">↵</kbd> to open
          </span>
        </footer>
      </div>
    </div>,
    document.body,
  )
}

export default CommandSearch
