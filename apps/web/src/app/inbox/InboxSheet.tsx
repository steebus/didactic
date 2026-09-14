'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { didactic } from '@didactic/api'
import type { LibraryRow } from '@didactic/core/shapes'
import { ResourceList } from '@/components/ResourceList'
import styles from './page.module.css'

const api = didactic()

const KIND_LABEL: Record<string, string> = {
  article: 'Article',
  pdf: 'PDF',
  book: 'Book',
  note: 'Note',
}

/**
 * The kept material, unread first, with a box to narrow it.
 *
 * Filtering is in the page rather than in the URL: this is a shelf
 * being scanned rather than a search worth linking to, and a round trip
 * per keystroke to a database on another continent would make it feel
 * worse than reading the whole list.
 *
 * The rows themselves are `ResourceList`, unchanged -- it already owns
 * marking a thing read and the optimistic shuffle that follows. What
 * came across from the library sheet is what only it could do: finding
 * a row, folding duplicates together, and throwing a thing away.
 */
export function InboxSheet({ resources }: { resources: LibraryRow[] }) {
  const [term, setTerm] = useState('')
  const [kind, setKind] = useState<string>('all')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()
  const router = useRouter()

  const shown = useMemo(() => {
    const q = term.trim().toLowerCase()
    return resources.filter(r => {
      if (kind !== 'all' && r.kind !== kind) return false
      if (!q) return true
      return (
        r.title.toLowerCase().includes(q) ||
        (r.summary ?? '').toLowerCase().includes(q) ||
        (r.url ?? '').toLowerCase().includes(q) ||
        r.topics.some(t => t.title.toLowerCase().includes(q))
      )
    })
  }, [resources, term, kind])

  const unread = shown.filter(r => r.status === 'queued' || r.status === 'reading')
  const read = shown.filter(r => r.status === 'consumed' || r.status === 'abandoned')

  const unfiled = resources.filter(r => r.topics.length === 0).length
  const duplicates = resources.filter(r => r.sameAs.length > 0).length

  /** Fold a near-duplicate into this row. Irreversible, so it is only
   *  ever offered where two rows genuinely look like one thing. */
  async function merge(keepId: string, mergeId: string) {
    setBusy(keepId)
    setError(null)

    const { ok, error: failed } = await api.resources.merge(keepId, mergeId)
    if (ok) startTransition(() => router.refresh())
    else setError(failed ?? 'Could not merge those.')
    setBusy(null)
  }

  async function remove(row: LibraryRow) {
    setBusy(row.id)
    setError(null)

    const { ok, error: failed } = await api.resources.remove(row.id)
    if (ok) startTransition(() => router.refresh())
    else setError(failed ?? 'Could not remove that.')
    setBusy(null)
  }

  return (
    <>
      {/* The filter only earns its space once there is enough to lose
          something in. Below that it is furniture over a list you can
          already see all of. */}
      {resources.length > 8 && (
        <div className={styles.controls}>
          <input
            className={styles.search}
            value={term}
            onChange={e => setTerm(e.target.value)}
            placeholder="Search titles, notes, links and topics"
            aria-label="Search what you have kept"
          />
          <div className={styles.kinds} role="group" aria-label="Filter by kind">
            {['all', 'article', 'book', 'pdf', 'note'].map(k => (
              <button
                key={k}
                type="button"
                className={styles.kind}
                aria-pressed={kind === k}
                onClick={() => setKind(k)}
              >
                {k === 'all' ? 'Everything' : KIND_LABEL[k]}
              </button>
            ))}
          </div>
        </div>
      )}

      {error && <p className={styles.problem}>{error}</p>}

      <section>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>Unread</h2>
          <span className={styles.sectionNote}>{unread.length} to read</span>
        </div>
        <ResourceList resources={unread} />
      </section>

      {read.length > 0 && (
        <section>
          <div className={styles.sectionHead}>
            <h2 className={styles.sectionTitle}>Read</h2>
            <span className={styles.sectionNote}>{read.length} done with</span>
          </div>
          <ResourceList resources={read} />
        </section>
      )}

      {/* Filed against nothing means no lesson can reach it and it
          appears on no topic sheet -- worth saying out loud. */}
      {(unfiled > 0 || duplicates > 0) && (
        <p className={styles.count}>
          {[
            unfiled > 0 && `${unfiled} filed against no topic`,
            duplicates > 0 && `${duplicates} look like duplicates`,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      )}

      {/* Two rows for one thing, and throwing a thing away. Both were
          the library sheet's alone; kept at the foot rather than on
          every row, because tidying up is a different errand from
          reading and should not crowd it. */}
      {(duplicates > 0 || shown.length > 0) && (
        <details className={styles.tidy}>
          <summary className={styles.tidySummary}>Tidy up</summary>

          {duplicates > 0 && (
            <ul className={styles.tidyList}>
              {resources
                .filter(r => r.sameAs.length > 0)
                .map(r => (
                  <li key={r.id} className={styles.tidyRow}>
                    <span className={styles.tidyTitle}>{r.title}</span>
                    <span className={styles.tidyNote}>
                      looks like{' '}
                      {r.sameAs.map((d, i) => (
                        <span key={d.id}>
                          {i > 0 && ', '}
                          {d.title}
                          {' — '}
                          <button
                            type="button"
                            className={styles.tidyAction}
                            onClick={() => merge(r.id, d.id)}
                            disabled={busy === r.id}
                          >
                            {busy === r.id ? 'Merging…' : 'fold it into this one'}
                          </button>
                        </span>
                      ))}
                    </span>
                  </li>
                ))}
            </ul>
          )}

          <ul className={styles.tidyList}>
            {shown.map(r => (
              <li key={r.id} className={styles.tidyRow}>
                <span className={styles.tidyTitle}>{r.title}</span>
                {/* A resource with exposures behind it cannot be deleted
                    without rewriting the log the figures are built on,
                    so the sheet says so rather than offering an action
                    that would fail at the server. */}
                {r.readInto ? (
                  <span className={styles.tidyNote}>read into the record — kept</span>
                ) : (
                  <button
                    type="button"
                    className={styles.tidyAction}
                    onClick={() => remove(r)}
                    disabled={busy === r.id}
                  >
                    {busy === r.id ? 'Removing…' : 'Remove'}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  )
}
