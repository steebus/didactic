import { Slug, Working } from '@/components/Setting'
import styles from './page.module.css'

/** The marked passages while they are gathered: a quote with its
 *  caption under it, which is what a mark is. */
export function MarksGalley() {
  return (
    <>
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
    </>
  )
}
