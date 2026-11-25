import { forwardRef, useCallback, useEffect, useId, useRef } from 'react'
import cn from '@/lib/cn'
import { Icon } from './Icon'

/** Text / email / tel / password input with an optional leading icon. */
export const Input = forwardRef(function Input(
  { label, hint, error, icon, className, containerClassName, required, ...rest },
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
          {required && <span className="ml-0.5 text-tier-original">*</span>}
        </label>
      )}
      <div className="relative">
        {icon && (
          <Icon
            name={icon}
            className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-muted"
          />
        )}
        <input
          ref={setRefs}
          id={inputId}
          className={cn(
            'field',
            icon && 'pl-10',
            error && 'border-tier-original focus:border-tier-original focus:ring-tier-original',
            className,
          )}
          aria-invalid={Boolean(error)}
          {...rest}
        />
      </div>
      {error ? (
        <p className="mt-1.5 flex items-center gap-1 text-body-sm text-tier-original">
          <Icon name="alert-circle" className="h-3.5 w-3.5" />
          {error}
        </p>
      ) : (
        hint && <p className="mt-1.5 text-body-sm text-brand-muted">{hint}</p>
      )}
    </div>
  )
})

export const Textarea = forwardRef(function Textarea(
  { label, hint, error, rows = 4, className, containerClassName, ...rest },
  ref,
) {
  const id = useId()
  const inputId = rest.id ?? id
  return (
    <div className={cn('w-full', containerClassName)}>
      {label && (
        <label htmlFor={inputId} className="field-label">
          {label}
        </label>
      )}
      <textarea
        ref={ref}
        id={inputId}
        rows={rows}
        className={cn('field resize-y', error && 'border-tier-original', className)}
        {...rest}
      />
      {error ? (
        <p className="mt-1.5 text-body-sm text-tier-original">{error}</p>
      ) : (
        hint && <p className="mt-1.5 text-body-sm text-brand-muted">{hint}</p>
      )}
    </div>
  )
})

export const Select = forwardRef(function Select(
  { label, options = [], error, className, containerClassName, placeholder, children, ...rest },
  ref,
) {
  const id = useId()
  const inputId = rest.id ?? id
  return (
    <div className={cn('w-full', containerClassName)}>
      {label && (
        <label htmlFor={inputId} className="field-label">
          {label}
        </label>
      )}
      <div className="relative">
        <select ref={ref} id={inputId} className={cn('field appearance-none pr-10', className)} {...rest}>
          {placeholder && <option value="">{placeholder}</option>}
          {options.map((option) => (
            <option key={option.value ?? option} value={option.value ?? option}>
              {option.label ?? option}
            </option>
          ))}
          {children}
        </select>
        <Icon
          name="chevron-down"
          className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-brand-muted"
        />
      </div>
      {error && <p className="mt-1.5 text-body-sm text-tier-original">{error}</p>}
    </div>
  )
})

/** Checkbox with the design's square gold-checked treatment. */
export function Checkbox({ label, description, checked, onChange, className, ...rest }) {
  const id = useId()
  return (
    <label
      htmlFor={rest.id ?? id}
      className={cn('flex cursor-pointer items-start gap-3 text-body-sm', className)}
    >
      <span className="relative mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
        <input
          id={rest.id ?? id}
          type="checkbox"
          checked={checked}
          onChange={onChange}
          className="peer h-4 w-4 cursor-pointer appearance-none rounded-sm border border-neutral-300 bg-white transition checked:border-brand-charcoal checked:bg-brand-charcoal focus-visible:ring-2 focus-visible:ring-brand-gold"
          {...rest}
        />
        <Icon
          name="check"
          className="pointer-events-none absolute h-3 w-3 text-brand-gold opacity-0 transition-opacity peer-checked:opacity-100"
          strokeWidth={3}
        />
      </span>
      <span className="flex-1">
        <span className="block font-medium text-brand-charcoal">{label}</span>
        {description && <span className="mt-0.5 block text-brand-muted">{description}</span>}
      </span>
    </label>
  )
}

/** Radio card used for shipping and payment selection. */
export function RadioCard({ name, value, checked, onChange, title, description, meta, badge, className }) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-start gap-3 rounded border p-4 transition',
        checked
          ? 'border-brand-gold bg-white ring-1 ring-brand-gold shadow-card'
          : 'border-brand-border bg-white hover:border-brand-gold/60',
        className,
      )}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
        className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer appearance-none rounded-full border border-neutral-300 bg-white transition checked:border-[5px] checked:border-brand-charcoal focus-visible:ring-2 focus-visible:ring-brand-gold"
      />
      <span className="flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-body-md font-semibold text-brand-charcoal">{title}</span>
          {badge && (
            <span className="rounded-full bg-brand-gold/20 px-2 py-0.5 text-label-sm font-bold uppercase text-brand-goldDark">
              {badge}
            </span>
          )}
        </span>
        {description && <span className="mt-1 block text-body-sm text-brand-muted">{description}</span>}
        {meta && <span className="mt-1.5 block text-body-sm font-medium text-ink-variant">{meta}</span>}
      </span>
    </label>
  )
}

/** Segmented control — used for grid/list toggles and small tab groups. */
export function SegmentedControl({ options = [], value, onChange, className, size = 'md' }) {
  return (
    <div className={cn('inline-flex rounded border border-brand-border bg-brand-cream p-0.5', className)}>
      {options.map((option) => {
        const active = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            title={option.title ?? option.label}
            aria-pressed={active}
            className={cn(
              'inline-flex items-center justify-center gap-1.5 rounded-sm font-semibold uppercase tracking-wider transition',
              size === 'sm' ? 'px-2.5 py-1 text-[10px]' : 'px-3 py-1.5 text-label-sm',
              active ? 'bg-brand-charcoal text-brand-ivory' : 'text-ink-variant hover:text-brand-charcoal',
            )}
          >
            {option.icon && <Icon name={option.icon} className="h-3.5 w-3.5" />}
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

export default Input
