'use client'

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { LibraryRow } from '@/lib/library'
import styles from './page.module.css'

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

  async function remove(row: LibraryRow) {
    setBusy(row.id)
    setError(null)
    try {
      const res = await fetch(`/api/resources/${row.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Could not remove that.')
      }
      startTransition(() => router.refresh())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setBusy(null)
    }
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
