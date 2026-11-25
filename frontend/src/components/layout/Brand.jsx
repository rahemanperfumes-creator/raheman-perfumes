import { Link } from '@/components/ui/AppLink'
import cn from '@/lib/cn'
import { Icon } from '@/components/ui/Icon'

const LOGO_SIZES = {
  sm: 'h-12 w-12 sm:h-14 sm:w-14',
  md: 'h-[64px] w-[64px] sm:h-[74px] sm:w-[74px] lg:h-[86px] lg:w-[86px]',
  lg: 'h-20 w-20 sm:h-28 sm:w-28',
}

/** The official Raheman Perfumes seal logo, used by the header, mobile nav and footer. */
export function Logo({ size = 'md', className, imgClassName, onClick }) {
  return (
    <Link
      to="/"
      onClick={onClick}
      aria-label="Raheman Perfumes — home"
      className={cn('group inline-flex shrink-0 items-center leading-none', className)}
    >
      <img
        src="/logo.png"
        alt="Raheman Perfumes"
        draggable={false}
        loading="eager"
        decoding="async"
        className={cn(
          'rounded-full object-contain transition-transform duration-300 group-hover:scale-105 drop-shadow-[0_2px_6px_rgba(0,0,0,0.16)]',
          LOGO_SIZES[size] ?? LOGO_SIZES.md,
          imgClassName,
        )}
      />
    </Link>
  )
}

/** Small stroked icon button used across the header for account/wishlist/cart. */
export function HeaderAction({ icon, label, to, onClick, badge, tone = 'dark', className }) {
  const content = (
    <>
      <Icon name={icon} className="h-[18px] w-[18px]" strokeWidth={1.7} />
      {badge > 0 && (
        <span className="absolute -right-1 -top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-brand-goldDark px-1 text-[9px] font-bold text-white">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </>
  )

  const classes = cn(
    'relative flex h-9 w-9 items-center justify-center rounded-full transition sm:h-10 sm:w-10',
    tone === 'light'
      ? 'text-brand-ivory hover:bg-white/10 hover:text-brand-gold'
      : 'text-brand-charcoal hover:bg-neutral-100 hover:text-brand-goldDark',
    className,
  )

  if (to) {
    return (
      <Link to={to} aria-label={label} title={label} className={classes}>
        {content}
      </Link>
    )
  }

  return (
    <button type="button" onClick={onClick} aria-label={label} title={label} className={classes}>
      {content}
    </button>
  )
}

export default Logo
