import { SheetNav } from '@/components/SheetNav'
import { Slug, Working } from '@/components/Setting'
import styles from './page.module.css'

/** Loose stock, while it is counted. Every row carries a name, a
 *  description and a line of what it holds, so that is what stands
 *  here — a skeleton that settles into a different shape is a flinch. */
export default function Loading() {
  return (
    <main className={styles.sheet}>
      <header className={styles.head}>
        <SheetNav back={{ href: '/', label: 'Subjects' }} />
        <div className={styles.headRow}>
          <h1 className={styles.title}>Loose stock</h1>
        </div>
      </header>
      <div className={styles.headRule} />

      <div className={styles.body}>
        <Working label="Counting what is loose" />

        <ul className={styles.stock}>
          {['46%', '61%', '38%', '54%'].map((w, i) => (
            <li key={i} className={styles.row}>
              <div className={styles.rowBody}>
                <Slug w={w} tall delay={i * 0.04} />
                <p className={styles.gloss}>
                  <Slug w="92%" delay={i * 0.04} />
                  <Slug w="70%" delay={i * 0.04} />
                </p>
                <p className={styles.holds}>
                  <Slug w="28%" delay={i * 0.04} />
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </main>
  )
}
