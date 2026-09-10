import { Slug, Working } from '@/components/Setting'
import styles from './page.module.css'

/** The two lists while they are read. The capture box above them
 *  needs nothing from the database and is never stood in for: a grey
 *  box where a working field is about to be would be slower than the
 *  field itself. */
export function QueuesGalley() {
  return (
    <>
      <Working label="Reading the inbox" />

      <section>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>Unsown</h2>
        </div>
        <ul className={styles.list}>
          {[71, 84, 62, 78, 55].map((w, i) => (
            <li key={i} className={styles.row}>
              <div>
                <Slug tall w={`${w}%`} delay={i * 0.07} />
                <Slug w="46%" delay={i * 0.07} />
              </div>
            </li>
          ))}
        </ul>
      </section>
    </>
  )
}
