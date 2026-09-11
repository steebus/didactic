import { requireOwner } from '@/lib/auth'
import { getLibrary } from '@/lib/library'
import { SheetNav } from '@/components/SheetNav'
import { LibrarySheet } from './LibrarySheet'
import styles from './page.module.css'


/**
 * Everything filed, in one place.
 *
 * The inbox answers "what is waiting" and a topic sheet answers "what
 * is filed here". Neither answers "what do I have", and a resource
 * filed against nothing appeared on no sheet at all.
 */
export default async function LibraryPage() {
  // The gate and the read start together rather than one after the
  // other. Neither needs the other's answer, and each is a round trip
  // to a different continent -- run in sequence they were most of the
  // wait on every navigation. An unauthenticated request still ends in
  // the redirect the gate throws; it simply does not wait to find out
  // what it would otherwise have shown, and the proxy has already
  // turned nearly all of that traffic away before it reaches here.
  const [, resources] = await Promise.all([requireOwner(), getLibrary()])

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
