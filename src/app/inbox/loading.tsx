import { SheetNav } from '@/components/SheetNav'
import { QueuesGalley } from './Galley'
import styles from './page.module.css'

/** The inbox, while the route is fetched. */
export default function Loading() {
  return (
    <main className={styles.sheet}>
      <header className={styles.head}>
        <SheetNav current="inbox" />
        <div className={styles.headRow}>
          <h1 className={styles.title}>Inbox</h1>
        </div>
      </header>
      <div className={styles.headRule} />

      <div className={styles.body}>
        <QueuesGalley />
      </div>
    </main>
  )
}
