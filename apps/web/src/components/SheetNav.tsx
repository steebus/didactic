import { Suspense } from 'react'
import Link from 'next/link'
import { SignOut } from './SignOut'
import { InboxTally } from './InboxTally'
import { TendTally } from './TendTally'
import { WriteEntry } from './WriteEntry'
import styles from './SheetNav.module.css'

/**
 * The catalogue's running head: where you are, how to get back, and the
 * other sheets. Every surface carries one, so no page is a dead end.
 */
export function SheetNav({
  back,
  current,
}: {
  /** Where "back" goes, and what it is called. */
  back?: { href: string; label: string }
  /** Which sheet is showing, so its link is marked rather than offered. */
  current?: 'stock' | 'bed' | 'marked' | 'tend' | 'inbox' | 'sow'
}) {
  const sheets = [
    { key: 'stock', href: '/', label: 'Subjects' },
    { key: 'bed', href: '/graph', label: 'The bed' },
    { key: 'marked', href: '/marked', label: 'Marked' },
    // Between Marked and Inbox on purpose: what you kept, then what you
    // are keeping hold of, then what is waiting to be filed.
    { key: 'tend', href: '/tend', label: 'Tend' },
    { key: 'inbox', href: '/inbox', label: 'Inbox' },
    { key: 'sow', href: '/subjects/new', label: 'Sow' },
  ] as const

  return (
    <nav className={styles.nav} aria-label="Sheets">
      {/* The way back sits top-left, where a reader looks first to leave;
          the sheets keep the right. They share one row and wrap to two
          only when the width runs out, rather than being stacked by
          construction. */}
      {back && (
        <Link href={back.href} className={styles.back}>
          <span className={styles.arrow} aria-hidden="true">
            ←
          </span>
          {back.label}
        </Link>
      )}
      <span className={styles.sheets}>
        {sheets
          // A back link to the same place as a sheet link is one link
          // printed twice.
          .filter(sheet => sheet.href !== back?.href)
          .map(sheet =>
          sheet.key === current ? (
            <span key={sheet.key} className={styles.here} aria-current="page">
              {sheet.label}
              {/* Printed on the sheet you are already on as well: the
                  figure is what is waiting, not an invitation to go
                  somewhere. */}
              {sheet.key === 'inbox' && <InboxTally />}
              {sheet.key === 'tend' && <TendTally />}
            </span>
          ) : (
            <Link key={sheet.key} href={sheet.href} className={styles.sheet}>
              {sheet.label}
              {sheet.key === 'inbox' && <InboxTally />}
              {sheet.key === 'tend' && <TendTally />}
            </Link>
          )
        )}
        {/* Two things that are not sheets: writing something down, and
            leaving. Both are done from wherever you are standing rather
            than being places to go, and both are set apart from the
            sheets by a rule. */}
        {/* Behind a boundary because it reads the address it is
            standing at -- an entry is filed under the topic you are on
            -- and a client hook that reads URL data blocks the static
            shell of every sheet that carries this head, which is all of
            them. No fallback: the control is one item in a wrapping
            run, and a placeholder that is later replaced would shift
            the run it sits in. */}
        <Suspense fallback={null}>
          <WriteEntry />
        </Suspense>
        {/* The catalogue is private, so every sheet carries the way
            out of it. */}
        <SignOut />
      </span>
    </nav>
  )
}
