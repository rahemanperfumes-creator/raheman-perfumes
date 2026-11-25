import { useLocation } from 'react-router-dom'
import cn from '@/lib/cn'
import { navEntryFor } from '@/data/navigation'

/**
 * The one header every screen opens with: a title and the page's buttons.
 *
 * The title defaults to the screen's entry in `data/navigation.js`, so a page
 * cannot disagree with the label in the sidebar. Pass `title` to say something
 * the nav entry cannot — the dashboard's greeting, for instance.
 */
export function PageHeader({ title, description, actions, className }) {
  const { pathname } = useLocation()
  const entry = navEntryFor(pathname)

  const heading = title ?? entry?.label ?? 'Raheman Admin'

  return (
    <header
      className={cn(
        'flex flex-col gap-3 border-b border-outline-variant/60 pb-4 sm:flex-row sm:items-end sm:justify-between',
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="font-serif text-headline-md font-semibold text-ink">{heading}</h1>
        {description && <p className="mt-1 text-body-sm text-ink-muted">{description}</p>}
      </div>

      {/* Actions sit in a wrapping row rather than a fixed one, because on a phone
          three buttons cannot share a line with a heading — they drop underneath
          it, which is the right answer, rather than scrolling sideways. */}
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  )
}

export default PageHeader
