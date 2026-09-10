import { SheetNav } from '@/components/SheetNav'
import { Slug, Working } from '@/components/Setting'
import styles from './page.module.css'

/**
 * A route, while it is read.
 *
 * A route is a numbered run of lessons in tiers, so that is the shape
 * that stands here: the head with its figures, then rows carrying
 * their own numbers the way the real ones do.
 */
export default function Loading() {
  return (
    <main className={styles.sheet}>
      <header className={styles.head}>
        <SheetNav />
        <div className={styles.headRow}>
          <div>
            <p className={styles.eyebrow}>Curriculum</p>
            <Slug tall w="58%" band />
          </div>
        </div>

        <div className={styles.figures}>
          <span className={styles.figure}>
            <span className={styles.figureLabel}>Shape</span>
            <Slug w="4.5rem" band />
          </span>
          <span className={styles.figure}>
            <span className={styles.figureLabel}>Worked</span>
            <Slug w="3.5rem" band delay={0.1} />
          </span>
        </div>
      </header>
      <div className={styles.headRule} />

      <div className={styles.body}>
        <Working label="Reading the route" />

        <ol className={styles.lessons}>
          {[82, 74, 88, 69, 79, 63].map((w, i) => (
            <li key={i} className={styles.lessonRow}>
              <div className={styles.lessonBody}>
                <Slug tall w={`${w}%`} delay={i * 0.07} />
                <Slug w="47%" delay={i * 0.07} />
              </div>
            </li>
          ))}
        </ol>
      </div>
    </main>
  )
}
