import { SheetNav } from '@/components/SheetNav'
import { Setting } from '@/components/Setting'
import styles from './page.module.css'

/**
 * The garden, while the gate is checked.
 *
 * Every other authenticated sheet has one of these and the Tend sheet
 * did not, which is what the instant-navigation insight was about: the
 * gate reads the session through `connection()`, a read no cache can
 * hold, so without a boundary under the shared layout a navigation into
 * this sheet has nothing to paint until the session comes back. The
 * boundary is what turns that wait into a page.
 *
 * The head needs nothing from the database, so it is drawn rather than
 * stood in for, and what is waited on is the card.
 *
 * The galley is the *same* `panel` under the same words the sheet uses
 * once it is mounted and reading its queue (`TendSheet`, `queue ===
 * null`). Two different waiting states either side of hydration would
 * be a flicker at exactly the moment the reader is waiting on something
 * — here the handoff is invisible, and one wait is one wait.
 */
export default function Loading() {
  return (
    <main className={styles.sheet}>
      <header className={styles.head}>
        <SheetNav current="tend" />
        <div className={styles.headRow}>
          <div>
            <p className={styles.eyebrow}>What you have already read</p>
            <h1 className={styles.title}>Tend</h1>
          </div>
        </div>
      </header>
      <div className={styles.headRule} />

      <div className={styles.body}>
        <Setting label="Looking over the garden" shape="panel" />
      </div>
    </main>
  )
}
