'use client'

import { usePathname } from 'next/navigation'
import { LightingLine } from './LightingLine'
import styles from './SheetFoot.module.css'

/**
 * The strip of press bed under the sheet, and the one setting printed
 * on it.
 *
 * Every sheet in the catalogue is paper laid on a darker bed and every
 * one of them runs to at least the height of the window, so the bed
 * below the trim is the one piece of surface the whole app shares. That
 * is where this goes. The lighting choice is not about the sheet -- it
 * is about the room the sheet is being read in -- so printing it on the
 * paper was always slightly wrong, and printing it on the paper of one
 * sheet out of sixteen was wrong twice.
 *
 * In the root layout rather than on the sheets, because a foot repeated
 * into sixteen pages is sixteen chances for it to drift, and because
 * fifteen of those pages have no foot at all: the subjects sheet was
 * the only one that ever had one.
 */
export function SheetFoot() {
  const here = usePathname()
  if (!hasFoot(here)) return null

  return (
    <footer className={styles.foot}>
      <LightingLine />
    </footer>
  )
}

/**
 * The map is the one surface with no foot to stand at.
 *
 * Every other route is a sheet: paper that ends, on a bed that carries
 * this underneath it. The bed map is a canvas the exact height of the
 * window with its own controls over the top, and anything added below
 * it does not land on a bed -- it makes a page that scrolls, under a
 * map that is panned by dragging. A reader who overshoots a drag would
 * scroll the catalogue instead of moving the map, which costs more
 * than the setting is worth on the one sheet where the setting can be
 * reached by walking off it.
 */
const hasFoot = (here: string | null) => here !== '/graph'
