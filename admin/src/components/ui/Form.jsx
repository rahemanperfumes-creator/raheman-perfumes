import { forwardRef, useCallback, useEffect, useId, useRef } from 'react'
import cn from '@/lib/cn'
import { Icon } from './Icon'

/**
 * Form controls.
 *
 * Mirrors the storefront's field set (`frontend/src/components/ui/Form.jsx`) —
 * same APIs, admin tones — minus the shopper-only pieces (radio cards, quantity
 * stepper) and plus the two controls a back office needs: a labelled group row
 * and a search input with a leading icon and a clear button.
 */

export const Input = forwardRef(function Input(
  { label, hint, error, icon, className, containerClassName, required, suffix, ...rest },
  ref,
) {
  const id = useId()
  const inputId = rest.id ?? id

  /* Scroll must never change a number field — a wheel over a focused
     input[type=number] would silently step the value up or down. React's
     onWheel is registered passively, where preventDefault is ignored, so
     the block rides a real non-passive listener instead. */
  const innerRef = useRef(null)
  const setRefs = useCallback(
    (node) => {
      innerRef.current = node
      if (typeof ref === 'function') ref(node)
      else if (ref) ref.current = node
    },
    [ref],
  )
  useEffect(() => {
    const node = innerRef.current
    if (rest.type !== 'number' || !node) return undefined
    const block = (event) => {
      event.preventDefault()
      if (document.activeElement === node) node.blur()
    }
    node.addEventListener('wheel', block, { passive: false })
    return () => node.removeEventListener('wheel', block)
  }, [rest.type])

  return (
    <div className={cn('w-full', containerClassName)}>
      {label && (
        <label htmlFor={inputId} className="field-label">
          {label}
          {required && <span className="ml-0.5 text-error">*</span>}
        </label>
      )}
      <div className="relative">
        {icon && (
          <Icon name={icon} className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
        )}
        <input
          ref={setRefs}
          id={inputId}
          className={cn('field', icon && 'pl-9', suffix && 'pr-10', error && 'border-error focus:border-error focus:ring-error', className)}
          aria-invalid={Boolean(error)}
          {...rest}
        />
        {suffix && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-body-sm text-ink-muted">
            {suffix}
          </div>
        )}
      </div>
      {
        error ? (
          <p className="mt-1.5 flex items-center gap-1 text-body-sm text-error">
            <Icon name="alert-circle" className="h-3.5 w-3.5" />
            {error}
          </p>
        ) : (
          hint && <p className="mt-1.5 text-body-sm text-ink-muted">{hint}</p>
        )
      }
    </div >
  )
})

  export const Textarea = forwardRef(function Textarea({ label, hint, error, rows = 3, className, containerClassName, required, ...rest }, ref) {
    const id = useId()
    const inputId = rest.id ?? id
    return (
      <div className={cn('w-full', containerClassName)}>
        {label && (
          <label htmlFor={inputId} className="field-label">
            {label}
            {required && <span className="ml-0.5 text-error">*</span>}
          </label>
        )}
        <textarea ref={ref} id={inputId} rows={rows} className={cn('field resize-y', error && 'border-error', className)} {...rest} />
        {error ? (
          <p className="mt-1.5 text-body-sm text-error">{error}</p>
        ) : (
          hint && <p className="mt-1.5 text-body-sm text-ink-muted">{hint}</p>
        )}
      </div>
    )
  })

  export const Select = forwardRef(function Select(
    { label, options = [], error, hint, className, containerClassName, placeholder, required, children, ...rest },
    ref,
  ) {
    const id = useId()
    const inputId = rest.id ?? id
    return (
      <div className={cn('w-full', containerClassName)}>
        {label && (
          <label htmlFor={inputId} className="field-label">
            {label}
            {required && <span className="ml-0.5 text-error">*</span>}
          </label>
        )}
        <div className="relative">
          <select ref={ref} id={inputId} className={cn('field appearance-none pr-9', error && 'border-error', className)} {...rest}>
            {placeholder && <option value="">{placeholder}</option>}
            {options.map((option) => (
              <option key={option.value ?? option} value={option.value ?? option}>
                {option.label ?? option}
              </option>
            ))}
            {children}
          </select>
          <Icon name="chevron-down" className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
        </div>
        {error ? (
          <p className="mt-1.5 text-body-sm text-error">{error}</p>
        ) : (
          hint && <p className="mt-1.5 text-body-sm text-ink-muted">{hint}</p>
        )}
      </div>
    )
  })

  export function Checkbox({ label, description, checked, onChange, className, ...rest }) {
    const id = useId()
    return (
      <label htmlFor={rest.id ?? id} className={cn('flex cursor-pointer items-start gap-2.5 text-body-sm', className)}>
        <span className="relative mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
          <input
            id={rest.id ?? id}
            type="checkbox"
            checked={checked}
            onChange={onChange}
            className="peer h-4 w-4 cursor-pointer appearance-none rounded-sm border border-outline-variant bg-brand-paper transition checked:border-shell-obsidian checked:bg-shell-obsidian focus-visible:ring-2 focus-visible:ring-brand-gold"
            {...rest}
          />
          <Icon
            name="check"
            className="pointer-events-none absolute h-3 w-3 text-brand-gold opacity-0 transition-opacity peer-checked:opacity-100"
            strokeWidth={3}
          />
        </span>
        <span className="flex-1">
          <span className="block font-medium text-ink">{label}</span>
          {description && <span className="mt-0.5 block text-ink-muted">{description}</span>}
        </span>
      </label>
    )
  }

  /** Search field for a toolbar — leading icon and a clear affordance. */
  export const SearchInput = forwardRef(function SearchInput({ value, onChange, placeholder = 'Search…', className, ...rest }, ref) {
    return (
      <div className={cn('relative w-full', className)}>
        <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
        <input
          ref={ref}
          type="search"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="field pl-9 pr-9"
          {...rest}
        />
        {value ? (
          <button
            type="button"
            onClick={() => onChange('')}
            aria-label="Clear search"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-ink-muted transition-colors hover:text-ink"
          >
            <Icon name="close" className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
    )
  })

  /** Groups fields into a labelled block inside a modal or a drawer. */
  export function FieldGroup({ title, description, columns = 2, children, className }) {
    return (
      <fieldset className={cn('border-0 p-0', className)}>
        {title && (
          <legend className="mb-3 w-full border-b border-outline-variant/60 pb-2 text-label-md font-bold uppercase text-ink-variant">
            {title}
          </legend>
        )}
        {description && <p className="mb-3 text-body-sm text-ink-muted">{description}</p>}
        <div className={cn('grid gap-4', columns === 2 ? 'sm:grid-cols-2' : columns === 3 ? 'sm:grid-cols-3' : 'grid-cols-1')}>
          {children}
        </div>
      </fieldset>
    )
  }

  /** A single labelled value, for read-only panels in the drawers. */
  export function DetailRow({ label, children, className }) {
    return (
      <div className={cn('flex items-baseline justify-between gap-4 py-2', className)}>
        <dt className="text-label-sm font-bold uppercase tracking-wider text-ink-muted">{label}</dt>
        <dd className="text-right text-body-sm font-medium text-ink">{children}</dd>
      </div>
    )
  }

  export default Input
