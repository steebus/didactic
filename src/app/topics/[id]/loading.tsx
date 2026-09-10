import { HeadGalley, TopicGalley } from './Galley'
import styles from './page.module.css'

/** A topic sheet, while the route itself is fetched. */
export default function Loading() {
  return (
    <main className={styles.sheet}>
      <HeadGalley />
      <div className={styles.headRule} />
      <div className={styles.body}>
        <TopicGalley />
      </div>
    </main>
  )
}
