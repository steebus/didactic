import { getLibrary } from '@/lib/library'
import { InboxSheet } from './InboxSheet'
import { PendingQueue } from '@/components/PendingQueue'
import { AddResource } from '@/components/AddResource'
import { SheetNav } from '@/components/SheetNav'
import styles from './page.module.css'
import { requireOwner } from '@/lib/auth'
import { getPendingTopics } from '@/lib/pending'


/**
 * Everything kept, read and unread, in one place.
 *
 * There were two sheets over one table. The inbox asked "what is
 * waiting" and the library asked "what do I have", and since the answer
 * to the second contains the answer to the first, the two were mostly
 * the same list printed twice -- with removal on one and marking read
 * on the other, so which sheet you were standing on decided what you
 * could do to a row. One sheet, both questions, every action.
 */
export default async function InboxPage() {
  // The gate and the read start together rather than one after the
  // other. Neither needs the other's answer, and each is a round trip
  // to a different continent -- run in sequence they were most of the
  // wait on every navigation. An unauthenticated request still ends in
  // the redirect the gate throws; it simply does not wait to find out
  // what it would otherwise have shown, and the proxy has already
  // turned nearly all of that traffic away before it reaches here.
  const [, resources, pending] = await Promise.all([
    requireOwner(),
    getLibrary(),
    getPendingTopics(),
  ])

  return (
    <main className={styles.sheet}>
      <header className={styles.head}>
        <SheetNav current="inbox" />
        <div className={styles.headRow}>
          <h1 className={styles.title}>Inbox</h1>
        </div>
      </header>
      <div className={styles.headRule} />

      <div className={styles.body}>
        <AddResource />

        <PendingQueue topics={pending} />

        <InboxSheet resources={resources} />
      </div>
    </main>
  )
}
