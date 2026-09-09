'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import styles from '@/app/inbox/page.module.css'

interface PendingTopic {
  id: string
  title: string
  summary: string | null
  nearest: {
    id: string
    title: string
    summary: string | null
    similarity: number
  } | null
}

/**
 * How close, in words. The number is a cosine similarity, which means
 * nothing to anyone who has not been staring at embeddings, and the
 * whole difficulty of this queue is being asked to judge a field you
 * are here precisely because you do not know it.
 */
function closeness(similarity: number): string {
  if (similarity >= 0.92) return 'almost the same wording'
  if (similarity >= 0.88) return 'very close wording'
  return 'close wording'
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
        would rather ask than guess. It is comparing wording, not meaning, so
        two topics that merely sound alike will land here — read both
        descriptions and keep them separate unless one genuinely says
        everything the other does. Keeping them separate is safe and costs one
        click to undo later; merging cannot be undone.
      </p>

      {error && <p className={styles.empty}>{error}</p>}

      <ul className={styles.pendingList}>
        {topics.map(topic => (
          <li key={topic.id} className={styles.pendingRow}>
            <span className={styles.pendingName}>
              {topic.title}
              {topic.summary && <span className={styles.pendingGloss}>{topic.summary}</span>}
              {topic.nearest ? (
                <span className={styles.compare}>
                  <span className={styles.compareHead}>
                    {closeness(topic.nearest.similarity)} to an existing topic
                  </span>
                  <span className={styles.compareName}>{topic.nearest.title}</span>
                  {topic.nearest.summary && (
                    <span className={styles.pendingGloss}>{topic.nearest.summary}</span>
                  )}
                  <span className={styles.compareAsk}>
                    Merge only if the second covers everything the first does. If
                    it goes further, or narrower, keep them separate.
                  </span>
                </span>
              ) : (
                <span className={styles.compare}>
                  <span className={styles.compareHead}>nothing close to it on the map</span>
                  <span className={styles.compareAsk}>
                    Nothing to merge into, so this is a keep or a discard.
                  </span>
                </span>
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
