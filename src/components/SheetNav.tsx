import Link from 'next/link'
import { SignOut } from './SignOut'
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
  current?: 'stock' | 'bed' | 'marked' | 'inbox' | 'sow'
}) {
  const sheets = [
    { key: 'stock', href: '/', label: 'Stock list' },
    { key: 'bed', href: '/graph', label: 'The bed' },
    { key: 'marked', href: '/marked', label: 'Marked' },
    { key: 'inbox', href: '/inbox', label: 'Inbox' },
    { key: 'sow', href: '/subjects/new', label: 'Sow' },
  ] as const

  return (
    <nav className={styles.nav} aria-label="Sheets">
      {back && (
        <Link href={back.href} className={styles.back}>
          <span aria-hidden="true">←</span> {back.label}
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
            </span>
          ) : (
            <Link key={sheet.key} href={sheet.href} className={styles.sheet}>
              {sheet.label}
            </Link>
          )
        )}
        {/* The catalogue is private, so every sheet carries the way
            out of it. */}
        <SignOut />
      </span>
    </nav>
  )
}
