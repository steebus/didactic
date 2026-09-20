'use client'

import { usePathname } from 'next/navigation'
import { LightingLine } from './LightingLine'
import styles from './SheetFoot.module.css'

/**
 * The last line of the sheet: whatever the sheet already prints at its
 * foot, and then the light it is being read under.
 *
 * It stood on the press bed *below* the trim for a version, which gave
 * it a ground a shade darker than the paper and made three glyphs read
 * as a banner section -- a separate piece of furniture bolted under the
 * page rather than the end of it. It sits in the sheet's own bottom
 * trim now, on the sheet's own paper, with nothing behind it: every
 * sheet in the catalogue ends with the same `var(--space-6)` of clear
 * paper, whatever its measure, and this takes that back.
 *
 * In the root layout rather than on the sheets, because a foot repeated
 * into sixteen pages is sixteen chances for it to drift, and because
 * fifteen of those pages have no foot at all: the subjects sheet was
 * the only one that ever had one. Where a sheet does print its own --
 * the subjects sheet's tally and its way out -- this falls in under it
 * and reads as its second line.
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
 * Every other route is a sheet: paper that ends, with a trim at the
 * bottom of it for this to sit in. The bed map is a canvas the exact
 * height of the window with its own controls over the top -- no paper,
 * no trim, nothing to sit in -- and anything added below it makes a
 * page that scrolls under a map that is panned by dragging. A reader
 * who overshoots a drag would scroll the catalogue instead of moving
 * the map, which costs more than the setting is worth on the one sheet
 * where the setting can be reached by walking off it.
 */
const hasFoot = (here: string | null) => here !== '/graph'
