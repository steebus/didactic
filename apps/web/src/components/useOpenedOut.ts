'use client'

import { useCallback, useEffect, useState } from 'react'

/** Whether the reader writes with the notes open out. Remembered
 *  because it is how they read, not a thing they choose per mark. */
const OPENED_OUT = 'didactic:notes-open'

/** Said when it changes, so every panel on the page follows at once. */
const CHANGED = 'didactic:notes-open-changed'

function remembered(): boolean {
  try {
    return localStorage.getItem(OPENED_OUT) === 'yes'
  } catch {
    return false
  }
}

/**
 * The notes open out to the column beside the reading, or folded back
 * to a panel: one preference for a mark's panel and a summary's, since
 * both are the reader writing about what they read.
 */
export function useOpenedOut(): [boolean, (next: boolean) => void] {
  const [big, setBig] = useState(remembered)

  useEffect(() => {
    const follow = () => setBig(remembered())
    window.addEventListener(CHANGED, follow)
    return () => window.removeEventListener(CHANGED, follow)
  }, [])

  const openOut = useCallback((next: boolean) => {
    try {
      localStorage.setItem(OPENED_OUT, next ? 'yes' : 'no')
    } catch {
      // Site data blocked. The preference is not worth an error on the
      // page; it just will not outlast the session.
    }
    setBig(next)
    window.dispatchEvent(new Event(CHANGED))
  }, [])

  return [big, openOut]
}
