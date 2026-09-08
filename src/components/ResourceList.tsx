'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { Resource } from '@/lib/types'
import styles from '@/app/inbox/page.module.css'

const DEPTHS = [
  { value: 'skim', label: 'Skimmed' },
  { value: 'read', label: 'Read it' },
  { value: 'applied', label: 'Applied it' },
] as const

export function ResourceList({ resources }: { resources: Resource[] }) {
  const [asking, setAsking] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [leaving, setLeaving] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()
  const router = useRouter()

  async function patch(id: string, body: Record<string, unknown>) {
    setBusy(id)
    setError(null)
    try {
      const res = await fetch(`/api/resources/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: 'Request failed' }))
        throw new Error(error ?? 'Request failed')
      }
      setAsking(null)

      // A row that changes section should be seen leaving it, or the
      // list simply reshuffles and the reader has to find what moved.
      if (body.status === 'consumed' || body.status === 'abandoned') {
        setLeaving(id)
        await new Promise(resolve => setTimeout(resolve, 260))
      }

      startTransition(() => router.refresh())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save that. Try again.')
    } finally {
      setBusy(null)
      setLeaving(null)
    }
  }

  if (resources.length === 0) {
    return <p className={styles.empty}>Nothing waiting. Send it a link and it will file itself.</p>
  }

  return (
    <>
      {error && <p className={styles.empty}>{error}</p>}
      <ul className={styles.list}>
        {resources.map(r => (
          <li
            key={r.id}
            className={`${styles.row} ${leaving === r.id ? styles.rowLeaving : ''}`}
          >
            <div>
              <h3 className={styles.rowTitle}>{r.title}</h3>
              <div className={styles.rowMeta}>
                <span className={styles.kind}>{r.kind}</span>
                {r.url && (
                  <a className={styles.rowLink} href={r.url} target="_blank" rel="noreferrer">
                    {new URL(r.url).hostname.replace('www.', '')}
                  </a>
                )}
                <span>
                  added {new Date(r.added_at).toLocaleDateString('en-GB', {
                    day: 'numeric', month: 'short',
                  })}
                </span>
              </div>
            </div>

            {r.status === 'consumed' ? (
              <span className={`${styles.status} ${styles.statusConsumed}`}>
                Sown{r.consumed_at
                  ? ` · ${new Date(r.consumed_at).toLocaleDateString('en-GB', {
                      day: 'numeric', month: 'short',
                    })}`
                  : ''}
              </span>
            ) : r.status === 'abandoned' ? (
              <span className={styles.status}>Set aside</span>
            ) : asking === r.id ? (
              <span className={styles.prompt}>
                <span className={styles.promptLabel}>How did it land?</span>
                {DEPTHS.map(d => (
                  <button
                    key={d.value}
                    className={styles.button}
                    disabled={busy === r.id}
                    onClick={() => patch(r.id, { status: 'consumed', depth: d.value })}
                  >
                    {d.label}
                  </button>
                ))}
              </span>
            ) : (
              <span className={styles.actions}>
                {r.status === 'queued' && (
                  <button
                    className={`${styles.button} ${styles.buttonQuiet}`}
                    disabled={busy === r.id}
                    onClick={() => patch(r.id, { status: 'reading' })}
                  >
                    Reading
                  </button>
                )}
                <button
                  className={styles.button}
                  disabled={busy === r.id}
                  onClick={() => setAsking(r.id)}
                >
                  Done with it
                </button>
                <button
                  className={`${styles.button} ${styles.buttonQuiet}`}
                  disabled={busy === r.id}
                  onClick={() => patch(r.id, { status: 'abandoned' })}
                >
                  Set aside
                </button>
              </span>
            )}
          </li>
        ))}
      </ul>
    </>
  )
}
