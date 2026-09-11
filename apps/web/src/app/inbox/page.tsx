import Link from 'next/link'
import { supabaseAdmin } from '@/lib/supabase'
import { ResourceList } from '@/components/ResourceList'
import { PendingQueue } from '@/components/PendingQueue'
import { AddResource } from '@/components/AddResource'
import type { Resource } from '@didactic/core/types'
import { SheetNav } from '@/components/SheetNav'
import styles from './page.module.css'
import { requireOwner } from '@/lib/auth'
import { getPendingTopics } from '@/lib/pending'


export default async function InboxPage() {
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

        <section>
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>Unsown</h2>
            <span className={styles.sectionNote}>
              {waiting.length} waiting
            </span>
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
      </div>
    </main>
  )
}
