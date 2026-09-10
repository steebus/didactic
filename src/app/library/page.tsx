import { Suspense } from 'react'
import { requireOwner } from '@/lib/auth'
import { getLibrary } from '@/lib/library'
import { SheetNav } from '@/components/SheetNav'
import { LibrarySheet } from './LibrarySheet'
import { RowsGalley } from './Galley'
import styles from './page.module.css'


/**
 * Everything filed, in one place.
 *
 * The inbox answers "what is waiting" and a topic sheet answers "what
 * is filed here". Neither answers "what do I have", and a resource
 * filed against nothing appeared on no sheet at all.
 *
 * The sheet itself waits for nothing. Its head, its rule and its
 * measure are printed the moment the route is reached -- they are the
 * same on every visit, so they belong to the shell rather than to the
 * request -- and the shelf streams into the galley beneath them. What
 * the reader sees while it arrives is the sheet, not a stand-in for it.
 */
export default function LibraryPage() {
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
        <Suspense fallback={<RowsGalley />}>
          <Shelf />
        </Suspense>
      </div>
    </main>
  )
}

/** The part that needs the session and the database. */
async function Shelf() {
  // The gate and the read start together rather than one after the
  // other. Neither needs the other's answer, and each is a round trip
  // to a different continent -- run in sequence they were most of the
  // wait on every navigation. An unauthenticated request still ends in
  // the redirect the gate throws; it simply does not wait to find out
  // what it would otherwise have shown, and the proxy has already
  // turned nearly all of that traffic away before it reaches here.
  const [, resources] = await Promise.all([requireOwner(), getLibrary()])

  return <LibrarySheet resources={resources} />
}
