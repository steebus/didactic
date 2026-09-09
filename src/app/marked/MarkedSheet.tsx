'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { HighlightRow } from '@/lib/highlights'
import styles from './page.module.css'

/**
 * The marks, with a box to narrow them.
 *
 * Searching navigates rather than filtering in place: the query lives
 * in the URL, so a search can be linked to, gone back to, and reloaded
 * into the same result. The note is editable here because the thought
 * about a passage is usually the part that turns out to be wrong a
 * week later.
 */
export function MarkedSheet({
  highlights,
  query,
}: {
  highlights: HighlightRow[]
  query: string
}) {
  const [term, setTerm] = useState(query)
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [, startTransition] = useTransition()
  const router = useRouter()

  function search(next: string) {
    router.push(next.trim() ? `/marked?q=${encodeURIComponent(next.trim())}` : '/marked')
  }

  async function saveNote(id: string) {
    setBusy(true)
    try {
      await fetch('/api/highlights', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id, note: draft }),
      })
      setEditing(null)
      startTransition(() => router.refresh())
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: string) {
    setBusy(true)
    try {
      await fetch('/api/highlights', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id }),
      })
      startTransition(() => router.refresh())
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <form
        className={styles.searchRow}
        onSubmit={e => {
          e.preventDefault()
          search(term)
        }}
      >
        <input
          className={styles.search}
          value={term}
          onChange={e => setTerm(e.target.value)}
          placeholder="Search the quotes and your notes"
          aria-label="Search marked passages"
        />
        <button type="submit" className={styles.searchButton}>
          Search
        </button>
        {query && (
          <button
            type="button"
            className={styles.clear}
            onClick={() => {
              setTerm('')
              search('')
            }}
          >
            Clear
          </button>
        )}
      </form>

      <p className={styles.count}>
        {query
          ? `${highlights.length} ${highlights.length === 1 ? 'passage' : 'passages'} matching "${query}"`
          : `${highlights.length} ${highlights.length === 1 ? 'passage' : 'passages'} marked`}
      </p>

      {highlights.length === 0 ? (
        <p className={styles.empty}>
          {query
            ? 'Nothing matches that. The search covers both the passage and what you wrote about it.'
            : 'Nothing marked yet. Select any passage while reading a lesson and it will be kept here, filed under the topic that lesson teaches.'}
        </p>
      ) : (
        <ul className={styles.marks}>
          {highlights.map(h => (
            <li key={h.id} className={styles.mark}>
              <blockquote className={styles.quote}>{h.quote}</blockquote>

              {editing === h.id ? (
                <div className={styles.editor}>
                  <textarea
                    className={styles.noteInput}
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    rows={3}
                    autoFocus
                  />
                  <div className={styles.editorActions}>
                    <button
                      type="button"
                      className={styles.keep}
                      onClick={() => saveNote(h.id)}
                      disabled={busy}
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      className={styles.quiet}
                      onClick={() => setEditing(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                h.note && <p className={styles.note}>{h.note}</p>
              )}

              <p className={styles.meta}>
                {h.topic && (
                  <Link href={`/topics/${h.topic.id}`} className={styles.inlineLink}>
                    {h.topic.title}
                  </Link>
                )}
                {h.topic && h.lesson && ' · '}
                {h.lesson && (
                  <Link href={`/lesson/${h.lesson.id}`} className={styles.inlineLink}>
                    {h.lesson.title}
                  </Link>
                )}
                {editing !== h.id && (
                  <>
                    {' · '}
                    <button
                      type="button"
                      className={styles.quiet}
                      onClick={() => {
                        setEditing(h.id)
                        setDraft(h.note ?? '')
                      }}
                    >
                      {h.note ? 'Edit note' : 'Add a note'}
                    </button>
                  </>
                )}
                {' · '}
                <button
                  type="button"
                  className={styles.quiet}
                  onClick={() => remove(h.id)}
                  disabled={busy}
                >
                  Remove
                </button>
              </p>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
