import { sproutingSentence } from '@didactic/core/sprouting'
import { getSprouting } from '@/lib/sprouting'
import { requireOwner } from '@/lib/auth'
import { SheetNav } from '@/components/SheetNav'
import { SproutingSheet } from './SproutingSheet'
import styles from './page.module.css'

/**
 * Sprouting subjects: subjects nobody sowed.
 *
 * Every other subject on the map was named before anything was put in
 * it. These are the other way round: topics the reader's own material
 * keeps putting together, read off the map with the subjects taken out,
 * that no subject already accounts for. The sheet lists them, says what
 * holds each one together in counts, and offers to give each a bed.
 * Nothing is filed until someone presses.
 */
export default async function SproutingPage() {
  const [, sprouting] = await Promise.all([requireOwner(), getSprouting()])

  return (
    <main className={styles.sheet}>
      <header className={styles.head}>
        <SheetNav back={{ href: '/', label: 'Subjects' }} />
        <div className={styles.headRow}>
          <h1 className={styles.title}>Sprouting subjects</h1>
          <p className={styles.standfirst}>{sproutingSentence(sprouting.sprouts.length)}</p>
        </div>
      </header>
      <div className={styles.headRule} />

      <div className={styles.body}>
        <SproutingSheet initial={sprouting} />
      </div>
    </main>
  )
}
