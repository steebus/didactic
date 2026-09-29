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
 *
 * `yieldOut` folds this one back for as long as it is `active` -- the
 * note being written, the summary open -- without touching the
 * preference: another column has taken the strip beside the reading
 * (`useSideColumn`), and a reader who opened the list of their marks
 * has not decided to stop writing opened out. The next note opens out
 * again, and so does this one if its own control is pressed.
 */
export function useOpenedOut(
  active = true
): [boolean, (next: boolean) => void, () => void] {
  const [big, setBig] = useState(remembered)
  const [yielded, setYielded] = useState(false)
  if (yielded && !active) setYielded(false)

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
    setYielded(false)
    setBig(next)
    window.dispatchEvent(new Event(CHANGED))
  }, [])

  const yieldOut = useCallback(() => setYielded(true), [])

  return [big && !yielded, openOut, yieldOut]
}
