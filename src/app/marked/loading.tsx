import { SheetNav } from '@/components/SheetNav'
import { Slug, Working } from '@/components/Setting'
import styles from './page.module.css'

/** The marked passages, while they are gathered. A mark is a quote
 *  with a caption under it, so that is what stands here. */
export default function Loading() {
  return (
    <main className={styles.sheet}>
      <header className={styles.head}>
        <SheetNav current="marked" />
        <div className={styles.headRow}>
          <h1 className={styles.title}>Marked</h1>
        </div>
      </header>
      <div className={styles.headRule} />

      <div className={styles.body}>
        <Working label="Gathering the marks" />

        <ul className={styles.marks}>
          {[
            ['97%', '88%', '54%'],
            ['93%', '61%'],
            ['98%', '90%', '72%'],
            ['86%', '49%'],
          ].map((lines, i) => (
            <li key={i} className={styles.mark}>
              <div className={styles.quote}>
                {lines.map((w, j) => (
                  <Slug key={j} w={w} delay={i * 0.09} />
                ))}
              </div>
              <Slug w="34%" delay={i * 0.09} />
            </li>
          ))}
        </ul>
      </div>
    </main>
  )
}
