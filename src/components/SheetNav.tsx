import Link from 'next/link'
import { SignOut } from './SignOut'
import { InboxTally } from './InboxTally'
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
  current?: 'stock' | 'bed' | 'library' | 'marked' | 'inbox' | 'sow'
}) {
  const sheets = [
    { key: 'stock', href: '/', label: 'Stock list' },
    { key: 'bed', href: '/graph', label: 'The bed' },
    { key: 'library', href: '/library', label: 'Library' },
    { key: 'marked', href: '/marked', label: 'Marked' },
    { key: 'inbox', href: '/inbox', label: 'Inbox' },
    { key: 'sow', href: '/subjects/new', label: 'Sow' },
  ] as const

  return (
    <nav className={styles.nav} aria-label="Sheets">
      {/* The sheets first, the way back beneath them.
          They were competing for one line: a back link left, the sheets
          pushed right by an auto margin, and a long label like "back to
          the curriculum" breaking the row into a ragged second line
          that read as an accident. The set of sheets is fixed and the
          way back is one item, so they are two lines by construction
          rather than by whatever the labels happen to measure. */}
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
            </span>
          ) : (
            <Link key={sheet.key} href={sheet.href} className={styles.sheet}>
              {sheet.label}
              {sheet.key === 'inbox' && <InboxTally />}
            </Link>
          )
        )}
        {/* The catalogue is private, so every sheet carries the way
            out of it. */}
        <SignOut />
      </span>
      {back && (
        <Link href={back.href} className={styles.back}>
          <span className={styles.arrow} aria-hidden="true">
            ←
          </span>
          {back.label}
        </Link>
      )}
    </nav>
  )
}
