import { SheetNav } from '@/components/SheetNav'
import { MarksGalley } from './Galley'
import styles from './page.module.css'

/** The marked sheet, while the route is fetched. */
export default function Loading() {
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
        <MarksGalley />
      </div>
    </main>
  )
}
