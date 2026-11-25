import { useEffect } from 'react'

const SUFFIX = 'RAHEMAN PERFUMES'

/** Set the tab title. Every screen names itself, so a wall of tabs is readable. */
export function useDocumentTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} | ${SUFFIX} Admin` : `${SUFFIX} | Admin Panel`
  }, [title])
}

export default useDocumentTitle
