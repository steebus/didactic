import { SheetNav } from '@/components/SheetNav'
import { Slug, Working } from '@/components/Setting'
import styles from './page.module.css'

/** The shelf, while it is fetched. The head and the controls are the
 *  sheet's own; the rows are stood in for at the shape they take. */
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
      </div>
    </main>
  )
}
