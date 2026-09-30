import { BannerFigures } from '@/components/BannerFigures'
import { SheetNav } from '@/components/SheetNav'
import { Slug, Working } from '@/components/Setting'
import styles from './page.module.css'

/** The conversations, while they are read. The banner is printed for
 *  real; what is waited for is the list. */
export default function Loading() {
  return (
    <main className={styles.sheet}>
      <header className={styles.head}>
        <SheetNav current="chats" />
        <div className={styles.headRow}>
          <h1 className={styles.title}>Conversations</h1>
          <BannerFigures lines={[<Slug key="a" w="8rem" band />]} />
        </div>
      </header>
      <div className={styles.headRule} />
      <Working label="Gathering the conversations" />
    </main>
  )
}
