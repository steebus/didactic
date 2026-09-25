import Link from 'next/link'
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
  filedUnder,
}: {
  /** Where "back" goes, and what it is called. */
  back?: { href: string; label: string }
  /**
   * The topic this sheet is about, if it is about one.
   *
   * An entry written from here starts filed under it, and the composer
   * says so. Passed in rather than read off the address: only the sheet
   * knows what the thing it is printing is called, and a title parsed
   * out of a URL would be an id.
   */
  filedUnder?: { id: string; title: string }
  /** Which sheet is showing, so its link is marked rather than offered. */
  current?: 'stock' | 'bed' | 'marked' | 'chats' | 'tend' | 'inbox'
}) {
  // Subjects is the sheet you are standing on when `current` is
  // 'stock', and a running head printing the sheet you are already on
  // spends a slot saying nothing. Sowing is not a sheet either: it is
  // something you do, and it is offered on the subjects sheet where the
  // decision to start a subject is actually made.
  const sheets = [
    { key: 'stock', href: '/', label: 'Subjects' },
    { key: 'bed', href: '/graph', label: 'The bed' },
    { key: 'marked', href: '/marked', label: 'Marked' },
    { key: 'chats', href: '/chats', label: 'Chats' },
    // Between Marked and Inbox on purpose: what you kept, then what you
    // are keeping hold of, then what is waiting to be filed.
    { key: 'tend', href: '/tend', label: 'Tend' },
    { key: 'inbox', href: '/inbox', label: 'Inbox' },
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
          // The subjects sheet does not offer itself. Every other sheet
          // marks where you are rather than hiding it, because the mark
          // is how you know which of six you are on -- but the head on
          // the home sheet was the most crowded in the build, and its
          // own title is already the largest thing on the page.
          .filter(sheet => !(sheet.key === 'stock' && current === 'stock'))
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
        {/* The one thing in the head that is not a sheet: writing
            something down, which is done from wherever you are standing
            rather than being a place to go. Set apart from the sheets
            by a rule.

            Leaving used to sit beside it on all seven sheets. It is one
            press a year on a single-user app, and it was taking a slot
            in the most-read row in the catalogue; it now sits at the
            foot of the subjects sheet, which is where someone who means
            to leave ends up anyway. */}
        <WriteEntry filedUnder={filedUnder} />
      </span>
    </nav>
  )
}
