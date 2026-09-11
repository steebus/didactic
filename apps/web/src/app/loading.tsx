import { SheetNav } from '@/components/SheetNav'
import { Slug, Working } from '@/components/Setting'
import styles from './page.module.css'

/**
 * The stock list, while it is read.
 *
 * Everything on this sheet that does not come from the database is
 * printed for real: the running head, the masthead, the section it is
 * under. What is waited for is the holdings, and they are stood in for
 * at the size and rhythm they arrive in -- emblem, name, figures --
 * so the sheet does not change shape under the reader when it lands.
 */
export default function Loading() {
  return (
    <main className={styles.sheet}>
      <header className={styles.head}>
        <SheetNav current="stock" />
        <div className={styles.masthead}>
          <h1 className={styles.title}>Didactic</h1>
          <div className={styles.edition}>
            <span className={styles.editionRule}>Stock list</span>
            <Slug w="8rem" band />
          </div>
        </div>
        <p className={styles.strapline}>
          Everything you are growing, with its viability and what has gone
          dormant since you last tended it.
        </p>
      </header>
      <div className={styles.headRule} />

      <div className={styles.sheetBody}>
        <div className={styles.spread}>
          <section>
            <div className={styles.sectionHead}>
              <h2 className={styles.sectionTitle}>Stock in hand</h2>
              <span className={styles.sectionNote}>Viability · condition</span>
            </div>

            <Working label="Reading the stock list" />

            <ul className={styles.listing}>
              {[76, 62, 70, 55, 48].map((w, i) => (
                <li key={i} className={styles.entry} style={{ '--i': i } as React.CSSProperties}>
                  <Slug round w={`${52 - i * 3}px`} delay={i * 0.08} />
                  <div className={styles.entryBody}>
                    <Slug tall w={`${w}%`} delay={i * 0.08} />
                    <Slug w="38%" delay={i * 0.08} />
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <aside className={styles.margin}>
            <section className={styles.block}>
              <h2 className={styles.blockTitle}>Wants tending</h2>
              <Slug w="86%" />
              <Slug w="72%" />
              <Slug w="79%" />
            </section>
          </aside>
        </div>
      </div>
    </main>
  )
}
