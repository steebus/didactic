import { SheetNav } from '@/components/SheetNav'
import { Slug, Working } from '@/components/Setting'
import styles from './page.module.css'

/** The reading, while it is taken. Each entry is a name, a paragraph
 *  and a line of evidence, so that is what stands here. */
export default function Loading() {
  return (
    <main className={styles.sheet}>
      <header className={styles.head}>
        <SheetNav back={{ href: '/', label: 'Subjects' }} />
        <div className={styles.headRow}>
          <h1 className={styles.title}>Sprouting subjects</h1>
        </div>
      </header>
      <div className={styles.headRule} />

      <div className={styles.body}>
        <Working label="Reading what is sprouting" />
        <ul className={styles.list}>
          {['42%', '55%', '36%'].map((w, i) => (
            <li key={i} className={styles.entry}>
              <Slug w="18%" delay={i * 0.04} />
              <Slug w={w} tall delay={i * 0.04} />
              <p className={styles.why}>
                <Slug w="94%" delay={i * 0.04} />
                <Slug w="76%" delay={i * 0.04} />
              </p>
              <Slug w="48%" delay={i * 0.04} />
            </li>
          ))}
        </ul>
      </div>
    </main>
  )
}
