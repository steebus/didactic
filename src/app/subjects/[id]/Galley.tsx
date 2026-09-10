import { SheetNav } from '@/components/SheetNav'
import { Slug, Working } from '@/components/Setting'
import styles from './page.module.css'

/**
 * The band while the bed is read.
 *
 * The head cannot be printed ahead of the data: it carries the
 * subject's own plate colour as well as its name, and guessing a
 * colour would mean the band changing under the reader. So it stands
 * in the sheet's default ground with its type slugged out in light,
 * which keeps the shape and the height of the head right even where
 * its colour is not yet.
 */
export function HeadGalley() {
  return (
    <header className={styles.head}>
      <SheetNav back={{ href: '/', label: 'Stock list' }} />

      <div className={styles.headRow}>
        <div className={styles.headTitle}>
          <p className={styles.eyebrow}>Subject</p>
          <Slug tall w="60%" band />
          <Slug w="34%" band delay={0.1} />
        </div>
      </div>

      <div className={styles.headFoot}>
        <div className={styles.figures}>
          <span className={styles.figure}>
            <span className={styles.figureLabel}>Viability</span>
            <Slug w="4rem" band />
          </span>
          <span className={styles.figure}>
            <span className={styles.figureLabel}>Condition</span>
            <Slug w="5rem" band delay={0.1} />
          </span>
        </div>
      </div>
    </header>
  )
}

/** The outline and its margin, at the depths an outline actually
 *  takes: a topic, its children indented under it. */
export function BedGalley() {
  return (
    <div className={styles.spread}>
      <div className={styles.main}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>Topics</h2>
        </div>

        <Working label="Reading the bed" />

        <ul className={styles.tree}>
          {[
            [0, 64],
            [1, 52],
            [1, 47],
            [0, 71],
            [1, 55],
            [0, 58],
            [0, 66],
          ].map(([depth, w], i) => (
            <li
              key={i}
              className={styles.branch}
              style={{ '--depth': depth } as React.CSSProperties}
            >
              <div className={styles.topicRow}>
                <div className={styles.topicBody}>
                  <Slug tall w={`${w}%`} delay={i * 0.06} />
                  <Slug w="30%" delay={i * 0.06} />
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <aside className={styles.margin}>
        <section className={styles.block}>
          <h2 className={styles.blockTitle}>Condition</h2>
          <Slug w="100%" />
          <Slug w="62%" />
        </section>
        <section className={styles.block}>
          <h2 className={styles.blockTitle}>How you sowed it</h2>
          <Slug w="84%" />
          <Slug w="91%" />
          <Slug w="57%" />
        </section>
      </aside>
    </div>
  )
}
