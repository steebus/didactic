'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import styles from '@/app/inbox/page.module.css'

interface PendingNode {
  id: string
  title: string
  nearest: { id: string; title: string } | null
}

/**
 * Adjudication. The resolver defers here when a concept sits between
 * "clearly the same" and "clearly new". A wrong merge destroys history
 * irrecoverably; a wrong split costs one click. So the app asks.
 */
export function PendingQueue({ nodes }: { nodes: PendingNode[] }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()
  const router = useRouter()

  async function adjudicate(
    nodeId: string,
    action: 'confirm' | 'merge' | 'discard',
    mergeInto?: string
  ) {
    setBusy(nodeId)
    setError(null)
    try {
      const res = await fetch('/api/nodes/pending', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ nodeId, action, mergeInto }),
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

  if (nodes.length === 0) return null

  return (
    <section className={styles.decisions}>
      <div className={styles.decisionsHead}>
        <h2 className={styles.decisionsTitle}>
          {nodes.length === 1 ? 'One subject needs your call' : `${nodes.length} subjects need your call`}
        </h2>
      </div>
      <p className={styles.decisionsNote}>
        These came in close enough to something you already have that the app
        would rather ask than guess. Keeping them separate is safe; merging
        cannot be undone.
      </p>

      {error && <p className={styles.empty}>{error}</p>}

      <ul className={styles.pendingList}>
        {nodes.map(node => (
          <li key={node.id} className={styles.pendingRow}>
            <span className={styles.pendingName}>
              {node.title}
              {node.nearest && (
                <span className={styles.rowMeta}> close to {node.nearest.title}</span>
              )}
            </span>
            <span className={styles.actions}>
              <button
                className={styles.button}
                disabled={busy === node.id}
                onClick={() => adjudicate(node.id, 'confirm')}
              >
                Keep separate
              </button>
              {node.nearest && (
                <button
                  className={`${styles.button} ${styles.buttonQuiet}`}
                  disabled={busy === node.id}
                  onClick={() => adjudicate(node.id, 'merge', node.nearest!.id)}
                >
                  Same as {node.nearest.title}
                </button>
              )}
              <button
                className={`${styles.button} ${styles.buttonQuiet}`}
                disabled={busy === node.id}
                onClick={() => adjudicate(node.id, 'discard')}
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
