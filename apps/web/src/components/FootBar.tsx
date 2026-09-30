'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { InboxTally } from './InboxTally'
import { TendTally } from './TendTally'
import { WRITE_ENTRY } from './WriteEntry'
import styles from './FootBar.module.css'
import { Plant, Graph, Cards, Tray, Pen } from './NavGlyphs'

type Area = 'home' | 'bed' | 'tend' | 'inbox' | 'add'

/** Which of the five the address belongs to. Anything that is not one of
 *  the four other places is somewhere under Home: a subject, a topic, a
 *  lesson. */
function areaOf(path: string): Area {
  if (path.startsWith('/graph')) return 'bed'
  if (path.startsWith('/tend')) return 'tend'
  if (path.startsWith('/inbox')) return 'inbox'
  if (path.startsWith('/marked') || path.startsWith('/chats')) return 'add'
  return 'home'
}

const AREAS: Area[] = ['home', 'bed', 'tend', 'inbox', 'add']

/**
 * The sheets, at the foot of a phone.
 *
 * Above `40rem` the running head carries them and this renders nothing
 * visible. It lives in the layout, so it is the same element from sheet to
 * sheet: that is what lets the marker slide and the glyphs change state
 * instead of being swapped.
 */
export function FootBar() {
  const path = usePathname()
  const area = areaOf(path)
  const [menu, setMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const bare = path === '/enter'

  // The entry sheet has no bar, and so no room is kept for one.
  useEffect(() => {
    const root = document.documentElement
    if (bare) root.setAttribute('data-bare', '')
    else root.removeAttribute('data-bare')
  }, [bare])

  // Going anywhere puts the menu away.
  const [seen, setSeen] = useState(path)
  if (seen !== path) {
    setSeen(path)
    setMenu(false)
  }

  useEffect(() => {
    if (!menu) return
    const away = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(false)
    }
    const shut = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(false)
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', shut)
    return () => {
      document.removeEventListener('pointerdown', away)
      document.removeEventListener('keydown', shut)
    }
  }, [menu])

  if (bare) return null

  const cell = (key: Exclude<Area, 'add'>, href: string, label: string, glyph: React.ReactNode, tally?: React.ReactNode) => {
    const inner = (
      <>
        <span className={styles.glyph}>
          {glyph}
          {tally && <span className={styles.badge}>{tally}</span>}
        </span>
        <span className={styles.label}>{label}</span>
      </>
    )
    // The sheet you are on is stated, not offered.
    return path === href ? (
      <span className={styles.cell} data-on aria-current="page">
        {inner}
      </span>
    ) : (
      <Link
        href={href}
        className={styles.cell}
        data-on={area === key ? '' : undefined}
        aria-current={area === key ? 'true' : undefined}
      >
        {inner}
      </Link>
    )
  }

  return (
    <nav
      className={styles.bar}
      aria-label="Sheets"
      style={{ '--at': AREAS.indexOf(area) } as React.CSSProperties}
    >
      <div className={styles.row}>
        <span className={styles.marker} aria-hidden="true" />
        {cell('home', '/', 'Home', <Plant />)}
        {cell('bed', '/graph', 'Bed', <Graph />)}
        {cell('tend', '/tend', 'Tend', <Cards />, <TendTally />)}
        {cell('inbox', '/inbox', 'Inbox', <Tray />, <InboxTally />)}

        <div className={styles.addWrap} ref={menuRef}>
          <button
            type="button"
            className={styles.cell}
            data-on={area === 'add' ? '' : undefined}
            aria-expanded={menu}
            aria-haspopup="menu"
            aria-current={area === 'add' ? 'true' : undefined}
            onClick={() => setMenu(was => !was)}
          >
            <span className={styles.glyph} data-open={menu ? '' : undefined}>
              <Pen />
            </span>
            <span className={styles.label}>Activity</span>
          </button>

          {menu && (
            <div className={styles.menu} role="menu">
              <Link href="/marked" role="menuitem" className={styles.item}>
                Marks
              </Link>
              <Link href="/chats" role="menuitem" className={styles.item}>
                Chats
              </Link>
              <button
                type="button"
                role="menuitem"
                className={styles.item}
                onClick={() => {
                  setMenu(false)
                  window.dispatchEvent(new Event(WRITE_ENTRY))
                }}
              >
                Write an entry
              </button>
            </div>
          )}
        </div>
      </div>
    </nav>
  )
}
