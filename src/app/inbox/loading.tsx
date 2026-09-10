import { SheetNav } from '@/components/SheetNav'
import { Slug, Working } from '@/components/Setting'
import styles from './page.module.css'

/**
 * The inbox, while it is read.
 *
 * The capture box at the top needs nothing from the database, so it is
 * not stood in for -- printing a grey box where a working field is
 * about to be would be slower than the field itself. What is waited
 * for is the two lists beneath it.
 */
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
      </div>
    </main>
  )
}
