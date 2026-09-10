import { Suspense } from 'react'
import { supabaseAdmin } from '@/lib/supabase'
import { ResourceList } from '@/components/ResourceList'
import { PendingQueue } from '@/components/PendingQueue'
import { AddResource } from '@/components/AddResource'
import type { Resource } from '@/lib/types'
import { SheetNav } from '@/components/SheetNav'
import { QueuesGalley } from './Galley'
import styles from './page.module.css'
import { requireOwner } from '@/lib/auth'
import { getPendingTopics } from '@/lib/pending'


/**
 * What is waiting: material filed but not read, and topics the
 * resolver would not decide alone.
 *
 * The head and the capture box wait for nothing. They are the same on
 * every visit and need neither the session nor the database, so they
 * are printed the moment the route is reached -- which also means the
 * commonest thing anyone does here, pasting a link, can be done before
 * the lists have arrived.
 */
export default function InboxPage() {
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

        <Suspense fallback={<QueuesGalley />}>
          <Queues />
        </Suspense>
      </div>
    </main>
  )
}

/** The part that needs the session and the database. */
async function Queues() {
  const db = supabaseAdmin()
  // The gate and the read start together rather than one after the
  // other. Neither needs the other's answer, and each is a round trip
  // to a different continent -- run in sequence they were most of the
  // wait on every navigation. An unauthenticated request still ends in
  // the redirect the gate throws; it simply does not wait to find out
  // what it would otherwise have shown, and the proxy has already
  // turned nearly all of that traffic away before it reaches here.
  const [, { data: resources }, pending] = await Promise.all([
    requireOwner(),
    db.from('resources').select('*').order('added_at', { ascending: false }),
    getPendingTopics(),
  ])

  const all = (resources ?? []) as Resource[]
  const waiting = all.filter(r => r.status === 'queued' || r.status === 'reading')
  const settled = all.filter(r => r.status === 'consumed' || r.status === 'abandoned')

  return (
    <>
      <PendingQueue topics={pending} />

      <section>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>Unsown</h2>
          <span className={styles.sectionNote}>{waiting.length} waiting</span>
        </div>
        <ResourceList resources={waiting} />
      </section>

      {settled.length > 0 && (
        <section>
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>Sown</h2>
            <span className={styles.sectionNote}>{settled.length} done with</span>
          </div>
          <ResourceList resources={settled} />
        </section>
      )}
    </>
  )
}
