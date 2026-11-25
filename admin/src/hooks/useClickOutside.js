import { useEffect } from 'react'

/** Close a popover when the pointer goes down outside it or Escape is pressed. */
export function useClickOutside(ref, handler, active = true) {
  useEffect(() => {
    if (!active) return undefined

    const onPointerDown = (event) => {
      if (ref.current && !ref.current.contains(event.target)) handler()
    }
    const onKeyDown = (event) => {
      if (event.key === 'Escape') handler()
    }

    // `pointerdown` rather than `click`: a click that starts inside and ends
    // outside should still close the panel, which a click listener misses.
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [ref, handler, active])
}

export default useClickOutside
