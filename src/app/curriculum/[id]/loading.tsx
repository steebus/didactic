import { Setting } from '@/components/Setting'
import styles from './page.module.css'

/**
 * What stands here while the sheet is fetched.
 *
 * Without this boundary the browser holds the previous page until every
 * query has returned -- the database is on another continent and one
 * round trip measures about 140ms -- so a click looked like nothing had
 * happened at all. The galley arrives immediately and the sheet streams
 * in behind it.
 */
export default function Loading() {
  return (
    <main className={styles.sheet}>
      <div className={styles.body}>
        <Setting label="Reading the route" shape="rows" />
      </div>
    </main>
  )
}
