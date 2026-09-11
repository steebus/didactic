import { SheetNav } from '@/components/SheetNav'
import { Slug, Setting } from '@/components/Setting'
import styles from './page.module.css'

/**
 * A lesson, while it is turned to.
 *
 * Without one of these the nearest loading boundary is the root, which
 * is the stock list's own galley: turning to a lesson printed the whole
 * catalogue's front sheet for a moment on the way. What is waited for
 * here is a lesson, so what stands in for it is a lesson -- the running
 * head, the eyebrow, a title, the three figures, and the body set as
 * prose.
 */
export default function Loading() {
  return (
    <main className={styles.sheet}>
      <header className={styles.head}>
        <SheetNav />
        <div className={styles.headRow}>
          <div>
            <p className={styles.eyebrow}>
              <Slug w="11rem" />
            </p>
            <Slug tall w="62%" />
          </div>
        </div>

        <div className={styles.figures}>
          {['Stage', 'Length', 'State'].map((label, i) => (
            <span className={styles.figure} key={label}>
              <span className={styles.figureLabel}>{label}</span>
              <Slug w="4.5rem" delay={i * 0.08} />
            </span>
          ))}
        </div>
      </header>
      <div className={styles.headRule} />

      <div className={styles.body}>
        <Setting label="Turning to the lesson" shape="prose" />
      </div>
    </main>
  )
}
