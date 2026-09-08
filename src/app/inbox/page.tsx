import Link from 'next/link'
import { supabaseAdmin } from '@/lib/supabase'
import { ResourceList } from '@/components/ResourceList'
import { PendingQueue } from '@/components/PendingQueue'
import { AddResource } from '@/components/AddResource'
import type { Resource } from '@/lib/types'
import { SheetNav } from '@/components/SheetNav'
import styles from './page.module.css'
import { requireOwner } from '@/lib/auth'

export const dynamic = 'force-dynamic'

async function getPending() {
  const db = supabaseAdmin()
  const { data } = await db.from('topics')
    .select('id, title, embedding')
    .eq('state', 'pending')
    .order('created_at', { ascending: false })

  return Promise.all(
    (data ?? []).map(async topic => {
      let nearest: { id: string; title: string } | null = null
      if (topic.embedding) {
        const embedding =
          typeof topic.embedding === 'string' ? JSON.parse(topic.embedding) : topic.embedding
        const { data: matches } = await db.rpc('match_topics', {
          query_embedding: embedding,
          match_count: 1,
        })
        const top = matches?.[0]
        if (top && top.id !== topic.id) nearest = { id: top.id, title: top.title }
      }
      return { id: topic.id, title: topic.title, nearest }
    })
  )
}

export default async function InboxPage() {
  await requireOwner()

  const db = supabaseAdmin()
  const [{ data: resources }, pending] = await Promise.all([
    db.from('resources').select('*').order('added_at', { ascending: false }),
    getPending(),
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
