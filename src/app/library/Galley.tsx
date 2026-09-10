import { Slug, Working } from '@/components/Setting'
import styles from './page.module.css'

/**
 * The shelf while it is fetched.
 *
 * One definition, used by the route's loading boundary and by the
 * sheet's own suspense fallback. Two copies of a waiting state drift,
 * and the whole point of the shape is that it matches what follows.
 */
export function RowsGalley() {
  return (
    <>
      <Working label="Reading the library" />
      <ul className={styles.rows}>
        {[68, 82, 57, 74, 63, 79].map((w, i) => (
          <li key={i} className={styles.row}>
            <div className={styles.rowBody}>
              <Slug tall w={`${w}%`} delay={i * 0.07} />
              <Slug w="44%" delay={i * 0.07} />
            </div>
          </li>
        ))}
      </ul>
    </>
  )
}
