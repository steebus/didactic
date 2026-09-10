import { Slug, Working } from '@/components/Setting'
import styles from './page.module.css'

/** The edition line while the totals are counted. */
export function EditionGalley() {
  return (
    <div className={styles.edition}>
      <span className={styles.editionRule}>Stock list</span>
      <Slug w="8rem" band />
    </div>
  )
}

/**
 * The holdings while they are read: an emblem, a name, its figures.
 * Weighted the way the real list is, so the page does not resize
 * around the reader when it lands.
 */
export function StockGalley() {
  return (
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
  )
}
