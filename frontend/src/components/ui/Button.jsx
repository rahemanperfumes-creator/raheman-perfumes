import { Link } from '@/components/ui/AppLink'
import cn from '@/lib/cn'
import { Icon } from './Icon'

const VARIANTS = {
  primary: 'btn-primary',
  gold: 'btn-gold',
  outline: 'btn-outline',
  'outline-inverse': 'btn-outline-inverse',
  ghost: 'btn-ghost',
  white: 'btn-white',
}

const SIZES = {
  sm: 'btn-sm',
  md: 'btn-md',
  lg: 'btn-lg',
}

/**
 * The single button primitive.
 *
 * Renders a `<button>`, a react-router `<Link>`, or an `<a>` depending on the
 * props given, so navigation never needs a nested click handler.
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
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
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

export default Button
