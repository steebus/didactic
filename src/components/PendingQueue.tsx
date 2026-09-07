'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import styles from '@/app/inbox/page.module.css'

interface PendingTopic {
  id: string
  title: string
  nearest: { id: string; title: string } | null
}

/**
 * Adjudication. The resolver defers here when a concept sits between
 * "clearly the same" and "clearly new". A wrong merge destroys history
 * irrecoverably; a wrong split costs one click. So the app asks.
 */
export function PendingQueue({ topics }: { topics: PendingTopic[] }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()
  const router = useRouter()

  async function adjudicate(
    topicId: string,
    action: 'confirm' | 'merge' | 'discard',
    mergeInto?: string
  ) {
    setBusy(topicId)
    setError(null)
    try {
      const res = await fetch('/api/topics/pending', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ topicId, action, mergeInto }),
      })
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: 'Request failed' }))
        throw new Error(error ?? 'Request failed')
      }
      startTransition(() => router.refresh())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save that. Try again.')
    } finally {
      setBusy(null)
    }
  }

  if (topics.length === 0) return null

  return (
    <section className={styles.decisions}>
      <div className={styles.decisionsHead}>
        <h2 className={styles.decisionsTitle}>
          {topics.length === 1 ? 'One topic needs your call' : `${topics.length} topics need your call`}
        </h2>
      </div>
      <p className={styles.decisionsNote}>
        These came in close enough to something you already have that the app
        would rather ask than guess. Keeping them separate is safe; merging
        cannot be undone.
      </p>

      {error && <p className={styles.empty}>{error}</p>}

      <ul className={styles.pendingList}>
        {topics.map(topic => (
          <li key={topic.id} className={styles.pendingRow}>
            <span className={styles.pendingName}>
              {topic.title}
              {topic.nearest && (
                <span className={styles.rowMeta}> close to {topic.nearest.title}</span>
              )}
            </span>
            <span className={styles.actions}>
              <button
                className={styles.button}
                disabled={busy === topic.id}
                onClick={() => adjudicate(topic.id, 'confirm')}
              >
                Keep separate
              </button>
              {topic.nearest && (
                <button
                  className={`${styles.button} ${styles.buttonQuiet}`}
                  disabled={busy === topic.id}
                  onClick={() => adjudicate(topic.id, 'merge', topic.nearest!.id)}
                >
                  Same as {topic.nearest.title}
                </button>
              )}
              <button
                className={`${styles.button} ${styles.buttonQuiet}`}
                disabled={busy === topic.id}
                onClick={() => adjudicate(topic.id, 'discard')}
              >
                Discard
              </button>
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
