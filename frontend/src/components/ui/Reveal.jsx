import { useEffect, useRef, useState } from 'react'
import cn from '@/lib/cn'
import { REVEAL } from '@/lib/scrollConfig'
import { useIsomorphicLayoutEffect } from '@/hooks/useIsomorphicLayoutEffect'

/**
 * Reveals its children as they enter the viewport.
 *
 * This is the quiet half of the luxury brief. Smooth scrolling only changes how
 * the page *moves*; what makes it feel considered is that content arrives with
 * weight instead of simply being present. The timing that sells it lives in
 * `REVEAL` — long and shallow, never a bounce.
 *
 * Uses IntersectionObserver rather than a scroll listener so the browser can do
 * the work off the main thread, and reveals are one-way by default: content that
 * fades back out as you scroll past reads as a gimmick, not as craft.
 *
 * @param {React.ElementType} as element to render, defaults to a div
 * @param {number} delay milliseconds before this element starts
 * @param {number} index position in a group, multiplied by `REVEAL.stagger`
 * @param {number} y travel distance in px
 * @param {boolean} once stop observing after the first reveal
 */
export function Reveal({
  as: Tag = 'div',
  children,
  className,
  delay = 0,
  index,
  y = REVEAL.distance,
  once = true,
  ...rest
}) {
  const ref = useRef(null)
  const [visible, setVisible] = useState(false)

  const offset = delay + (index ?? 0) * REVEAL.stagger

  /**
   * Anything already on screen when it mounts is put straight into its finished
   * state, with no animation.
   *
   * There is nothing to reveal in content the reader is already looking at — a
   * reveal is a response to arriving somewhere, and nothing arrived. More
   * concretely, this has to be a layout effect: React Router captures the
   * "after" snapshot of a view transition the instant its DOM update returns, so
   * an element still sitting at `opacity: 0` at that moment would be baked into
   * the snapshot and the transition would fade into a page of empty sections
   * before the observer ever fired.
   *
   * Content below the fold is untouched by this and still reveals on scroll.
   */
  useIsomorphicLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const { top, bottom } = el.getBoundingClientRect()
    if (top < window.innerHeight && bottom > 0) setVisible(true)
  }, [])

  useEffect(() => {
    const el = ref.current
    if (!el || visible) return undefined

    // No IntersectionObserver (or a prerender): show the content rather than
    // risk leaving it permanently invisible.
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true)
      return undefined
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return
        setVisible(true)
        if (once) observer.disconnect()
      },
      { threshold: 0, rootMargin: REVEAL.rootMargin },
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [once, visible])

  return (
    <Tag
      ref={ref}
      data-reveal={visible ? 'in' : 'out'}
      style={{
        '--reveal-y': `${y}px`,
        '--reveal-delay': `${offset}ms`,
        '--reveal-duration': `${REVEAL.duration}ms`,
      }}
      className={cn('reveal', className)}
      {...rest}
    >
      {children}
    </Tag>
  )
}

export default Reveal
