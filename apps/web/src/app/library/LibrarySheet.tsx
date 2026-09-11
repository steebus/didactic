'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { didactic } from '@didactic/api'
import type { LibraryRow } from '@didactic/core/shapes'
import styles from './page.module.css'

const api = didactic()

const KIND_LABEL: Record<string, string> = {
  article: 'Article',
  pdf: 'PDF',
  book: 'Book',
  note: 'Note',
}

const STATUS_LABEL: Record<string, string> = {
  queued: 'Unread',
  reading: 'Reading',
  consumed: 'Read',
  abandoned: 'Abandoned',
}

/**
 * The library, with a box to narrow it.
 *
 * Filtering is in the page rather than in the URL: unlike the marked
 * sheet, this is a shelf being scanned rather than a search worth
 * linking to, and a round trip per keystroke to a database on another
 * continent would make it feel worse than reading the whole list.
 */
export function LibrarySheet({ resources }: { resources: LibraryRow[] }) {
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

  const unfiled = resources.filter(r => r.topics.length === 0).length
  const duplicates = resources.filter(r => r.sameAs.length > 0).length

  /** Fold a near-duplicate into this row. Irreversible, so it is only
   *  ever offered where two rows genuinely look like one thing. */
  async function merge(keep: LibraryRow, mergeId: string) {
    setBusy(keep.id)
    setError(null)

    const { ok, error: failed } = await api.resources.merge(keep.id, mergeId)
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
      <div className={styles.controls}>
        <input
          className={styles.search}
          value={term}
          onChange={e => setTerm(e.target.value)}
          placeholder="Search titles, notes, links and topics"
          aria-label="Search the library"
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

      <p className={styles.count}>
        {shown.length} of {resources.length} {resources.length === 1 ? 'item' : 'items'}
        {/* Filed against nothing means no lesson can reach it and it
            appears on no topic sheet -- worth saying out loud. */}
        {unfiled > 0 && ` · ${unfiled} filed against no topic`}
        {duplicates > 0 && ` · ${duplicates} look like duplicates`}
      </p>

      {error && <p className={styles.problem}>{error}</p>}

      {shown.length === 0 ? (
        <p className={styles.empty}>
          {resources.length === 0
            ? 'Nothing filed yet. Send a link to the inbox, or add something from a topic sheet.'
            : 'Nothing here matches that.'}
        </p>
      ) : (
        <ul className={styles.rows}>
          {shown.map(r => (
            <li key={r.id} className={styles.row}>
              <div className={styles.rowBody}>
                <h2 className={styles.rowTitle}>
                  {r.url ? (
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noreferrer"
                      className={styles.rowLink}
                    >
                      {r.title}
                    </a>
                  ) : (
                    r.title
                  )}
                </h2>

                <p className={styles.rowMeta}>
                  {KIND_LABEL[r.kind] ?? r.kind}
                  {' · '}
                  {STATUS_LABEL[r.status] ?? r.status}
                  {r.topics.length === 0 ? (
                    <span className={styles.unfiled}> · filed against no topic</span>
                  ) : (
                    <>
                      {' · '}
                      {r.topics.map((t, i) => (
                        <span key={t.id}>
                          {i > 0 && ', '}
                          <Link href={`/topics/${t.id}`} className={styles.rowLink}>
                            {t.title}
                          </Link>
                        </span>
                      ))}
                    </>
                  )}
                </p>

                {r.summary && <p className={styles.rowSummary}>{r.summary}</p>}

                {/* Two rows for one thing. Named where the shelf is
                    already being read rather than in a queue of its
                    own, and only ever suggested: merging moves the
                    exposures behind a figure and cannot be undone. */}
                {r.sameAs.length > 0 && (
                  <p className={styles.duplicate}>
                    Looks like the same thing as{' '}
                    {r.sameAs.map((d, i) => (
                      <span key={d.id}>
                        {i > 0 && ', '}
                        <span className={styles.duplicateTitle}>{d.title}</span>
                        {' — '}
                        <button
                          type="button"
                          className={styles.mergeAction}
                          onClick={() => merge(r, d.id)}
                          disabled={busy === r.id}
                        >
                          {busy === r.id ? 'Merging…' : 'fold it into this one'}
                        </button>
                      </span>
                    ))}
                  </p>
                )}
              </div>

              <div className={styles.rowActions}>
                {/* A resource with exposures behind it cannot be deleted
                    without rewriting the log the figures are built on,
                    so the sheet says so rather than offering an action
                    that would fail at the server. */}
                {r.readInto ? (
                  <span className={styles.held} title="Something has been read out of this">
                    Read into the record
                  </span>
                ) : (
                  <button
                    type="button"
                    className={styles.remove}
                    onClick={() => remove(r)}
                    disabled={busy === r.id}
                  >
                    {busy === r.id ? 'Removing…' : 'Remove'}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
