import { Setting } from '@/components/Setting'
import styles from './loading.module.css'

/**
 * The bed, while it is read.
 *
 * Without this the route had no shell to prerender -- it reads the
 * query string and the session before it can draw anything -- and Next
 * reported uncached data during prerendering. The panel floats on the
 * drill grid because the bed is not a sheet.
 */
export default function Loading() {
  return (
    <main className={styles.bed}>
      <div className={styles.panel}>
        <Setting label="Reading the bed" shape="panel" />
      </div>
    </main>
  )
}
