import { useEffect } from 'react'

const BASE_TITLE = 'Raheman Perfumes'

/** Sets `document.title`, restoring the previous one on unmount. */
export function useDocumentTitle(title, { suffix = true } = {}) {
  useEffect(() => {
    const previous = document.title
    document.title = title ? (suffix ? `${title} | ${BASE_TITLE}` : title) : BASE_TITLE
    return () => {
      document.title = previous
    }
  }, [title, suffix])
}

/** Same, but for pages that are not public (cart, checkout, account). */
export function usePrivateTitle(title) {
  useDocumentTitle(title, { suffix: false })
}

export default useDocumentTitle
