import { SheetNav } from '@/components/SheetNav'
import { RowsGalley } from './Galley'
import styles from './page.module.css'

/** The shelf, while the route itself is fetched. The sheet's own head
 *  is printed for real; only the rows are stood in for. */
export default function Loading() {
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
        <RowsGalley />
      </div>
    </main>
  )
}
