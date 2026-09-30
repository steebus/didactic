import { getLibrary } from '@/lib/library'
import { InboxSheet } from './InboxSheet'
import { PendingQueue } from '@/components/PendingQueue'
import { InboxAdd } from '@/components/InboxAdd'
import { BannerFigures } from '@/components/BannerFigures'
import { SheetNav } from '@/components/SheetNav'
import styles from './page.module.css'
import { requireOwner } from '@/lib/auth'
import { getPendingTopics } from '@/lib/pending'
import { drainAfter } from '@/lib/drain'
import { getSubjectArea } from '@/lib/subject'
import Link from 'next/link'

/** The queue is worked after the page is sent, inside its time. */
export const maxDuration = 60


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
export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ subject?: string }>
}) {
  const { subject: subjectId } = await searchParams
  // The gate and the read start together rather than one after the
  // other. Neither needs the other's answer, and each is a round trip
  // to a different continent -- run in sequence they were most of the
  // wait on every navigation. An unauthenticated request still ends in
  // the redirect the gate throws; it simply does not wait to find out
  // what it would otherwise have shown, and the proxy has already
  // turned nearly all of that traffic away before it reaches here.
  const [, library, pending, area] = await Promise.all([
    requireOwner(),
    getLibrary(),
    getPendingTopics(),
    subjectId ? getSubjectArea(subjectId) : null,
  ])

  // Narrowed to one subject: what was filed against the subject itself,
  // and what is filed against any topic in it.
  const inSubject = area
    ? new Set([...area.resources.map(r => r.id)])
    : null
  const topicIds = area ? new Set(area.topics.map(t => t.id)) : null
  const resources =
    inSubject && topicIds
      ? library.filter(r => inSubject.has(r.id) || r.topics.some(t => topicIds.has(t.id)))
      : library

  // Something still waiting to be read: read it now, after the page has
  // gone out, rather than trusting the cron to have been set up.
  if (resources.some(r => r.filing === 'waiting')) drainAfter()

  return (
    <main className={styles.sheet}>
      <header className={styles.head}>
        <SheetNav current="inbox" />
        <div className={styles.headRow}>
          <h1 className={styles.title}>Inbox</h1>
          <BannerFigures
            lines={[
              `${resources.filter(r => r.status === 'queued' || r.status === 'reading').length} unread`,
              `${resources.filter(r => r.status === 'consumed' || r.status === 'abandoned').length} read`,
            ]}
          />
        </div>
      </header>
      <div className={styles.headRule} />

      <div className={styles.body}>
        {area && (
          <p className={styles.only}>
            Only what is filed under {area.subject.title} ·{' '}
            <Link href="/inbox">Show everything</Link>
          </p>
        )}

        <InboxSheet resources={resources} adder={<InboxAdd />}>
          <PendingQueue topics={pending} />
        </InboxSheet>
      </div>
    </main>
  )
}
