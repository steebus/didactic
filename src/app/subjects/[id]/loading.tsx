import { HeadGalley, BedGalley } from './Galley'
import styles from './page.module.css'

/** A bed, while the route itself is fetched. */
export default function Loading() {
  return (
    <main className={styles.sheet}>
      <HeadGalley />
      <div className={styles.headRule} />
      <div className={styles.body}>
        <BedGalley />
      </div>
    </main>
  )
}
