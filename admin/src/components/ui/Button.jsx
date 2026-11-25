import { Link } from 'react-router-dom'
import cn from '@/lib/cn'
import { Icon } from './Icon'

const VARIANTS = {
  primary: 'btn-primary',
  gold: 'btn-gold',
  outline: 'btn-outline',
  ghost: 'btn-ghost',
  danger: 'btn-danger',
}

const SIZES = {
  sm: 'btn-sm',
  md: 'btn-md',
  lg: 'btn-lg',
}

/**
 * The single button primitive.
 *
 * Renders a `<button>`, a react-router `<Link>` or an `<a>` depending on the
 * props given, so navigation never needs a nested click handler. Mirrors the
 * storefront's Button (`frontend/src/components/ui/Button.jsx`) with the admin
 * variant set — obsidian primary, no inverse/white, plus danger.
 */
export function Button({
  children,
  variant = 'primary',
  size = 'md',
  to,
  href,
  className,
  icon,
  iconRight,
  iconClassName = 'w-4 h-4',
  type = 'button',
  fullWidth = false,
  loading = false,
  disabled = false,
  ...rest
}) {
  const classes = cn(
    'btn',
    VARIANTS[variant] ?? VARIANTS.primary,
    SIZES[size] ?? SIZES.md,
    fullWidth && 'w-full',
    className,
  )

  const content = (
    <>
      {loading ? (
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : (
        icon && <Icon name={icon} className={iconClassName} />
      )}
      {children}
      {iconRight && !loading && <Icon name={iconRight} className={iconClassName} />}
    </>
  )

  if (to && !disabled) {
    return (
      <Link to={to} className={classes} {...rest}>
        {content}
      </Link>
    )
  }

  if (href && !disabled) {
    return (
      <a href={href} className={classes} {...rest}>
        {content}
      </a>
    )
  }

  return (
    <button type={type} className={classes} disabled={disabled || loading} {...rest}>
      {content}
    </button>
  )
}

/**
 * A square icon-only button, for the row-level actions in a table. Keeps the
 * hit area at 32px without the visual weight of a labelled button.
 */
export function IconButton({ icon, label, tone = 'default', className, ...rest }) {
  const tones = {
    default: 'text-ink-variant hover:bg-surface-low hover:text-ink',
    danger: 'text-error/80 hover:bg-state-haltedSurface hover:text-error',
    gold: 'text-brand-goldDeep hover:bg-brand-gold/15 hover:text-brand-goldInk',
  }
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex h-8 w-8 items-center justify-center rounded transition-colors',
        tones[tone] ?? tones.default,
        className,
      )}
      {...rest}
    >
      <Icon name={icon} className="h-4 w-4" />
    </button>
  )
}

export default Button
