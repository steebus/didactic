import { supabaseAdmin } from '@/lib/supabase'
import { requireOwner } from '@/lib/auth'
import { searchHighlights } from '@/lib/highlights'
import { SheetNav } from '@/components/SheetNav'
import { MarkedSheet } from './MarkedSheet'
import styles from './page.module.css'

export const dynamic = 'force-dynamic'

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
  await requireOwner()
  const { q } = await searchParams
  const query = q ?? ''
  const highlights = await searchHighlights(supabaseAdmin(), query)

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
