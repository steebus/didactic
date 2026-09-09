import { supabaseAdmin } from '@/lib/supabase'
import { requireOwner } from '@/lib/auth'
import { getLibrary } from '@/lib/library'
import { SheetNav } from '@/components/SheetNav'
import { LibrarySheet } from './LibrarySheet'
import styles from './page.module.css'

export const dynamic = 'force-dynamic'

/**
 * Everything filed, in one place.
 *
 * The inbox answers "what is waiting" and a topic sheet answers "what
 * is filed here". Neither answers "what do I have", and a resource
 * filed against nothing appeared on no sheet at all.
 */
export default async function LibraryPage() {
  await requireOwner()
  const resources = await getLibrary(supabaseAdmin())

  return (
    <main className={styles.sheet}>
      <header className={styles.head}>
        <SheetNav current="library" />
        <div className={styles.headRow}>
          <h1 className={styles.title}>Library</h1>
        </div>
      </header>
      <div className={styles.headRule} />

      <div className={styles.body}>
        <LibrarySheet resources={resources} />
      </div>
    </main>
  )
}
