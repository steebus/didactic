import { Setting } from '@/components/Setting'
import styles from './page.module.css'

/** The shelf, while it is fetched. */
export default function Loading() {
  return (
    <main className={styles.sheet}>
      <div className={styles.body}>
        <Setting label="Reading the library" shape="rows" />
      </div>
    </main>
  )
}
