'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { didactic } from '@didactic/api'
import type { ExposureDepth, Resource, ResourceStatus } from '@didactic/core/types'
import type { LibraryRow } from '@didactic/core/shapes'
import { filingPhrase } from '@didactic/core/filingState'
import styles from '@/app/inbox/page.module.css'

const api = didactic()

const DEPTHS = [
  { value: 'skim', label: 'Skimmed' },
  { value: 'read', label: 'Read it' },
  { value: 'applied', label: 'Applied it' },
] as const

export function ResourceList({
  resources,
  onRemove,
}: {
  /** The shelf rows, which carry where each one got to in being filed.
   *  A plain `Resource` is still accepted: the filing line simply has
   *  nothing to say about a row that does not carry one. */
  resources: Array<Resource | LibraryRow>
  /** Throwing a row away. Offered beside the other things you can do to
   *  a row rather than folded away at the foot of the sheet -- it used
   *  to live under *Tidy up*, which meant scrolling past everything to
   *  get rid of the thing you were looking at. */
  onRemove?: (id: string) => void | Promise<void>
}) {
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

  function patch(id: string, body: { status?: ResourceStatus; depth?: ExposureDepth }) {
    const status = body.status
    const previous = settled[id]

    setBusy(id)
    setError(null)
    setAsking(null)
    if (status) setSettled(held => ({ ...held, [id]: status }))

    // A row that changes section should be seen leaving it, or the
    // list simply reshuffles and the reader has to find what moved.
    if (status === 'consumed' || status === 'abandoned') setLeaving(id)

    void (async () => {
      const { ok, error: failed } = await api.resources.patch(id, body)
      if (ok) {
        startTransition(() => router.refresh())
      } else {
        // Back where it was, because a row that says "sown" over a
        // write that never landed is worse than no answer at all.
        setSettled(held => {
          const next = { ...held }
          if (previous) next[id] = previous
          else delete next[id]
          return next
        })
        setLeaving(null)
        setError(failed ?? 'Could not save that. Try again.')
      }
      setBusy(null)
    })()
  }

  if (resources.length === 0) {
    return <p className={styles.empty}>Nothing to read. Send it a link and it will file itself.</p>
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
                {/* A document is opened in the catalogue rather than in
                    a tab of its own: it is a thing on the shelf, and
                    where an article's link leaves for somebody else's
                    page, this one stays here. */}
                {r.storage_path && (
                  <Link className={styles.rowLink} href={`/resources/${r.id}/read`}>
                    Open it
                  </Link>
                )}
                <span>
                  added {new Date(r.added_at).toLocaleDateString('en-GB', {
                    day: 'numeric', month: 'short',
                  })}
                </span>
              </div>

              {/* Where it has got to in being read and filed.

                  Everything between arriving and being filed used to be
                  invisible: a row said "added 14 Sept" whether it had
                  been filed against six topics, was still in the queue,
                  or had failed three times and given up. The three look
                  identical if the only thing printed is a date. */}
              {'filing' in r && r.filing !== 'none' && (
                <p className={styles.filing} data-filing={r.filing}>
                  <span className={styles.filingWord}>
                    {filingPhrase(r.filing, r.topics.length).word}
                  </span>
                  {r.topics.length > 0 && (
                    <span className={styles.filingTopics}>
                      {r.topics.map(topic => (
                        <Link
                          key={topic.id}
                          href={`/topics/${topic.id}`}
                          className={styles.filingTopic}
                        >
                          {topic.title}
                        </Link>
                      ))}
                    </span>
                  )}
                  {/* The note answers "so is something wrong?", which is
                      the question three of these states raise and none
                      of them used to answer. The reason a failure gives
                      is the worker's own words. */}
                  {r.filing === 'failed' && r.filingError ? (
                    <span className={styles.filingNote}>{r.filingError}</span>
                  ) : (
                    filingPhrase(r.filing, r.topics.length).note && (
                      <span className={styles.filingNote}>
                        {filingPhrase(r.filing, r.topics.length).note}
                      </span>
                    )
                  )}
                </p>
              )}
            </div>

            {status === 'consumed' || status === 'abandoned' ? (
              <span className={styles.actions}>
                {status === 'consumed' ? (
                  <span className={`${styles.status} ${styles.statusConsumed}`}>
                    Read{r.consumed_at
                      ? ` · ${new Date(r.consumed_at).toLocaleDateString('en-GB', {
                          day: 'numeric', month: 'short',
                        })}`
                      : ''}
                  </span>
                ) : (
                  <span className={styles.status}>Set aside</span>
                )}
                {/* A row that has been dealt with can still be thrown
                    away, and from here rather than from the foot of the
                    sheet -- unless something has been read out of it,
                    in which case the record it is part of keeps it. */}
                {onRemove && !('readInto' in r && r.readInto) && (
                  <button
                    className={`${styles.button} ${styles.buttonQuiet} ${styles.buttonRemove}`}
                    disabled={busy === r.id}
                    onClick={() => onRemove(r.id)}
                  >
                    Remove
                  </button>
                )}
              </span>
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
                {/* Throwing it away, set apart from the benign actions
                    by a rule rather than a colour -- the same way
                    leaving is set apart from the sheets in the running
                    head, and removing from editing on the Marked sheet.

                    Not offered at all once something has been read out
                    of it: the exposure log is what every figure on the
                    map is built from, and deleting a row it references
                    would fail at the server. Saying so by leaving the
                    control off is better than printing one that
                    cannot work. */}
                {onRemove && !('readInto' in r && r.readInto) && (
                  <button
                    className={`${styles.button} ${styles.buttonQuiet} ${styles.buttonRemove}`}
                    disabled={busy === r.id}
                    onClick={() => onRemove(r.id)}
                  >
                    Remove
                  </button>
                )}
              </span>
            )}
          </li>
          )
        })}
      </ul>
    </>
  )
}
