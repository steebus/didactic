'use client'

import { useEffect, useRef } from 'react'

/** Said when a column opens, with its name, so every other one yields. */
const CLAIMED = 'didactic:column-claimed'

/** How many columns are out. The sheet makes room while any one is. */
let out = 0

/**
 * One column beside the reading at a time.
 *
 * The marks' list, the questions asked on a page, and a note or summary
 * opened out all stand in the same strip down the right of the window,
 * and the sheet moves over for whichever is there (`body[data-notes]`).
 * Two at once drew one over the other, and the first to shut took the
 * sheet's room back from under the second. So a column that opens says
 * so, and any other that is out is asked to go -- `close` is how it goes,
 * which for a list is shutting and for writing is folding back to its
 * panel, so nothing written is lost.
 *
 * The room is counted rather than flagged, so a column shutting as the
 * next one opens -- which is the order this puts them in -- leaves the
 * sheet where the new one wants it.
 */
export function useSideColumn(open: boolean, name: string, close: () => void) {
  const closing = useRef(close)
  useEffect(() => {
    closing.current = close
  })

  useEffect(() => {
    if (!open) return
    out += 1
    document.body.dataset.notes = 'open'
    window.dispatchEvent(new CustomEvent(CLAIMED, { detail: name }))

    const yieldTo = (e: Event) => {
      if ((e as CustomEvent<string>).detail !== name) closing.current()
    }
    window.addEventListener(CLAIMED, yieldTo)
    return () => {
      window.removeEventListener(CLAIMED, yieldTo)
      out -= 1
      if (out === 0) delete document.body.dataset.notes
    }
  }, [open, name])
}
