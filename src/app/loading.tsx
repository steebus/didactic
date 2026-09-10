import { SheetNav } from '@/components/SheetNav'
import { EditionGalley, StockGalley } from './Galley'
import styles from './page.module.css'

/** The stock list, while the route itself is fetched. */
export default function Loading() {
  return (
    <main className={styles.sheet}>
      <header className={styles.head}>
        <SheetNav current="stock" />
        <div className={styles.masthead}>
          <h1 className={styles.title}>Didactic</h1>
          <EditionGalley />
        </div>
        <p className={styles.strapline}>
          Everything you are growing, with its viability and what has gone
          dormant since you last tended it.
        </p>
      </header>
      <div className={styles.headRule} />

      <div className={styles.sheetBody}>
        <StockGalley />
      </div>
    </main>
  )
}
