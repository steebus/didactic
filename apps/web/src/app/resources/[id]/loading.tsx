import { SheetNav } from '@/components/SheetNav'
import { Slug, Setting } from '@/components/Setting'
import styles from '@/app/lesson/[id]/page.module.css'

/**
 * A resource, while it is turned to.
 *
 * The first open of an article may fetch its page to bring the words
 * in, which is long enough to be seen -- so what stands in for it is
 * the sheet it is about to be: the lesson's head, and a body set as
 * prose.
 */
export default function Loading() {
  return (
    <main className={styles.sheet}>
      <header className={styles.head}>
        <SheetNav current="inbox" />
        <div className={styles.headRow}>
          <div>
            <p className={styles.eyebrow}>
              <Slug w="8rem" />
            </p>
            <Slug tall w="62%" />
          </div>
        </div>

        <div className={styles.figures}>
          {['Kind', 'From', 'State'].map((label, i) => (
            <span className={styles.figure} key={label}>
              <span className={styles.figureLabel}>{label}</span>
              <Slug w="4.5rem" delay={i * 0.08} />
            </span>
          ))}
        </div>
      </header>
      <div className={styles.headRule} />

      <div className={styles.body}>
        <Setting label="Bringing it in to read" shape="prose" />
      </div>
    </main>
  )
}
