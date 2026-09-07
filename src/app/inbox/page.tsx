import Link from 'next/link'
import { supabaseAdmin } from '@/lib/supabase'
import { ResourceList } from '@/components/ResourceList'
import { PendingQueue } from '@/components/PendingQueue'
import type { Resource } from '@/lib/types'
import styles from './page.module.css'

export const dynamic = 'force-dynamic'

async function getPending() {
  const db = supabaseAdmin()
  const { data } = await db.from('nodes')
    .select('id, title, embedding')
    .eq('state', 'pending')
    .order('created_at', { ascending: false })

  return Promise.all(
    (data ?? []).map(async node => {
      let nearest: { id: string; title: string } | null = null
      if (node.embedding) {
        const embedding =
          typeof node.embedding === 'string' ? JSON.parse(node.embedding) : node.embedding
        const { data: matches } = await db.rpc('match_nodes', {
          query_embedding: embedding,
          match_count: 1,
        })
        const top = matches?.[0]
        if (top && top.id !== node.id) nearest = { id: top.id, title: top.title }
      }
      return { id: node.id, title: node.title, nearest }
    })
  )
}

export default async function InboxPage() {
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
        <div className={styles.headRow}>
          <h1 className={styles.title}>Inbox</h1>
          <Link href="/" className={styles.back}>
            Back to the stock list
          </Link>
        </div>
      </header>
      <div className={styles.headRule} />

      <div className={styles.body}>
        <PendingQueue nodes={pending} />

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
