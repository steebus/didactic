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
  /**
   * Rows this reader has already settled, before the server has said
   * so.
   *
   * Saying a thing was read writes an exposure and recomputes the
   * topic's figure, which is a second or two of work on the other side
   * of the world, and none of it is work the reader is waiting on:
   * they have finished the article and are telling the app so. The row
   * changes and leaves at once; a failure puts it back where it was
   * and says why.
   */
  const [settled, setSettled] = useState<Record<string, Resource['status']>>({})
  const [, startTransition] = useTransition()
  const router = useRouter()

  // An override is only ever read for a row still in this list, and
  // the sheet's own answer replaces it the moment they agree, so
  // nothing prunes the map: an entry for a row that has moved to the
  // other list, or that already says what the server says, is a key
  // nothing reads.

  function patch(id: string, body: Record<string, unknown>) {
    const status = body.status as Resource['status'] | undefined
    const previous = settled[id]

    setBusy(id)
    setError(null)
    setAsking(null)
    if (status) setSettled(held => ({ ...held, [id]: status }))

    // A row that changes section should be seen leaving it, or the
    // list simply reshuffles and the reader has to find what moved.
    if (status === 'consumed' || status === 'abandoned') setLeaving(id)

    void (async () => {
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
        startTransition(() => router.refresh())
      } catch (e) {
        // Back where it was, because a row that says "sown" over a
        // write that never landed is worse than no answer at all.
        setSettled(held => {
          const next = { ...held }
          if (previous) next[id] = previous
          else delete next[id]
          return next
        })
        setLeaving(null)
        setError(e instanceof Error ? e.message : 'Could not save that. Try again.')
      } finally {
        setBusy(null)
      }
    })()
  }

  if (resources.length === 0) {
    return <p className={styles.empty}>Nothing waiting. Send it a link and it will file itself.</p>
  }

  return (
    <>
      {error && <p className={styles.empty}>{error}</p>}
      <ul className={styles.list}>
        {resources.map(r => {
          const status = settled[r.id] ?? r.status
          return (
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

            {status === 'consumed' ? (
              <span className={`${styles.status} ${styles.statusConsumed}`}>
                Sown{r.consumed_at
                  ? ` · ${new Date(r.consumed_at).toLocaleDateString('en-GB', {
                      day: 'numeric', month: 'short',
                    })}`
                  : ''}
              </span>
            ) : status === 'abandoned' ? (
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
                {status === 'queued' && (
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
          )
        })}
      </ul>
    </>
  )
}
