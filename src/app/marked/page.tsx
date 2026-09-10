import { supabaseAdmin } from '@/lib/supabase'
import { requireOwner } from '@/lib/auth'
import { searchHighlights } from '@/lib/highlights'
import { SheetNav } from '@/components/SheetNav'
import { MarkedSheet } from './MarkedSheet'
import styles from './page.module.css'


/**
 * Everything ever marked, searched or simply read down.
 *
 * The search runs on the server against the query in the URL, so a
 * search is a place you can link to and come back to rather than a
 * state that evaporates. With no query it browses, because a sheet
 * that shows nothing until typed into hides everything you have.
 */
export default async function MarkedPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q } = await searchParams
  const query = q ?? ''
  // The gate and the read start together rather than one after the
  // other. Neither needs the other's answer, and each is a round trip
  // to a different continent -- run in sequence they were most of the
  // wait on every navigation. An unauthenticated request still ends in
  // the redirect the gate throws; it simply does not wait to find out
  // what it would otherwise have shown, and the proxy has already
  // turned nearly all of that traffic away before it reaches here.
  const [, highlights] = await Promise.all([
    requireOwner(),
    searchHighlights(supabaseAdmin(), query),
  ])

  return (
    <main className={styles.sheet}>
      <header className={styles.head}>
        <SheetNav current="marked" />
        <div className={styles.headRow}>
          <h1 className={styles.title}>Marked</h1>
        </div>
      </header>
      <div className={styles.headRule} />

      <div className={styles.body}>
        <MarkedSheet highlights={highlights} query={query} />
      </div>
    </main>
  )
}
