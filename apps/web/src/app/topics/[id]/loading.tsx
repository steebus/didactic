import { SheetNav } from '@/components/SheetNav'
import { Slug, Working } from '@/components/Setting'
import styles from './page.module.css'

/**
 * A topic sheet, while it is turned to.
 *
 * The band takes the subject's plate colour, which is not known until
 * the topic is read, so it stands in the sheet's own ground with its
 * type slugged out in light. Beneath it the shape is what a topic
 * sheet is: the routes through it on the left, what is filed against
 * it in the margin.
 */
export default function Loading() {
  return (
    <main className={styles.sheet}>
      <header className={styles.head}>
        <SheetNav back={{ href: '/', label: 'Stock list' }} />

        <div className={styles.headRow}>
          <div>
            <p className={styles.eyebrow}>Topic</p>
            <Slug tall w="56%" band />
          </div>
        </div>

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
      </header>
      <div className={styles.headRule} />

      <div className={styles.body}>
        <div className={styles.spread}>
          <div className={styles.main}>
            <div className={styles.sectionHead}>
              <h2 className={styles.sectionTitle}>Routes through it</h2>
            </div>

            <Working label="Turning to the topic" />

            <ul className={styles.routes}>
              {[68, 74, 59].map((w, i) => (
                <li key={i} className={styles.route}>
                  <div className={styles.routeBody}>
                    <Slug tall w={`${w}%`} delay={i * 0.08} />
                    <Slug w="42%" delay={i * 0.08} />
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <aside className={styles.margin}>
            <section className={styles.block}>
              <h2 className={styles.blockTitle}>Filed here</h2>
              <Slug w="88%" />
              <Slug w="71%" />
              <Slug w="80%" />
            </section>
            <section className={styles.block}>
              <h2 className={styles.blockTitle}>Marked</h2>
              <Slug w="94%" />
              <Slug w="66%" />
            </section>
          </aside>
        </div>
      </div>
    </main>
  )
}
