'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { HighlightRow } from '@/lib/highlights'
import { NoteEditor } from '@/components/NoteEditor'
import { NoteText } from '@/components/NoteText'
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
  const [error, setError] = useState<string | null>(null)
  /** The last passage removed, held so it can be put back. */
  const [undo, setUndo] = useState<HighlightRow | null>(null)
  /** Rows already taken off the sheet by this reader. Removing writes
   *  a delete and drops three cache tags before the sheet comes back;
   *  the row goes on the press, and comes back if the delete does not
   *  land. */
  const [removed, setRemoved] = useState<string[]>([])
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

  /**
   * Removing is undoable rather than confirmed.
   *
   * A mark is hand-picked and there is no second copy of it, but a
   * confirm dialog would be a modal in a world that has no modals --
   * and it makes the safe case slower without making the unsafe case
   * safer. So the row goes, and what it held is kept in hand until the
   * sheet is left: the passage and its note come back exactly as they
   * were, on the same lesson.
   */
  function remove(mark: HighlightRow) {
    setBusy(true)
    setError(null)
    setUndo(mark)
    setRemoved(gone => [...gone, mark.id])

    void (async () => {
      try {
        const res = await fetch('/api/highlights', {
          method: 'DELETE',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ id: mark.id }),
        })
        if (!res.ok) throw new Error('Could not remove that.')
        startTransition(() => router.refresh())
      } catch (e) {
        setRemoved(gone => gone.filter(id => id !== mark.id))
        setUndo(null)
        setError(e instanceof Error ? e.message : 'Could not remove that.')
      } finally {
        setBusy(false)
      }
    })()
  }

  /** Put back exactly what was removed, on the lesson it came from.
   *
   *  A mark whose lesson has been grubbed out with its subject has
   *  nothing to be put back onto, so it is not offered: the passage is
   *  still readable above, and re-filing it against a lesson that no
   *  longer exists would fail at the server. */
  async function putBack() {
    if (!undo?.lesson_id) return
    setBusy(true)
    try {
      const res = await fetch('/api/highlights', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          lessonId: undo.lesson_id,
          quote: undo.quote,
          prefix: undo.prefix,
          note: undo.note,
        }),
      })
      if (!res.ok) throw new Error('Could not put that back.')
      setUndo(null)
      startTransition(() => router.refresh())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not put that back.')
    } finally {
      setBusy(false)
    }
  }

  // What is on the sheet after this reader's own removals. An id the
  // sheet has already dropped is a key nothing reads, so nothing
  // prunes the list.
  const shown = highlights.filter(h => !removed.includes(h.id))

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
        {/* "Marks" rather than "passages": some of them are notes on a
            lesson, with no passage to speak of. */}
        {query
          ? `${shown.length} ${shown.length === 1 ? 'mark' : 'marks'} matching "${query}"`
          : `${shown.length} ${shown.length === 1 ? 'mark' : 'marks'} kept`}
      </p>

      {error && <p className={styles.problem}>{error}</p>}

      {/* What was just removed, kept in hand. A passage is hand-picked
          and there is no second copy of it, so the way back stays on
          the sheet rather than expiring on a timer nobody is watching. */}
      {undo && (
        <p className={styles.undo}>
          Removed the {undo.quote ? 'passage' : 'note'} from{' '}
          <span className={styles.undoQuote}>{undo.lesson?.title ?? 'that lesson'}</span>.{' '}
          {undo.lesson_id ? (
            <button type="button" className={styles.quiet} onClick={putBack} disabled={busy}>
              Put it back
            </button>
          ) : (
            <span className={styles.undoQuote}>
              The lesson it came from is gone, so it cannot be put back.
            </span>
          )}
        </p>
      )}

      {shown.length === 0 ? (
        <p className={styles.empty}>
          {query
            ? 'Nothing matches that. The search covers both the passage and what you wrote about it.'
            : 'Nothing marked yet. Select any passage while reading a lesson — or write a note on the lesson itself — and it will be kept here, filed under the topic that lesson teaches.'}
        </p>
      ) : (
        <ul className={styles.marks}>
          {shown.map(h => (
            <li key={h.id} className={styles.mark}>
              {/* A mark with no passage is a note on the lesson as a
                  whole. It says so, rather than printing an empty rule
                  where a quote would have been. */}
              {h.quote ? (
                <blockquote className={styles.quote}>{h.quote}</blockquote>
              ) : (
                <p className={styles.about}>A note on this lesson</p>
              )}

              {editing === h.id ? (
                <div className={styles.editor}>
                  <NoteEditor
                    className={styles.noteInput}
                    value={draft}
                    onChange={setDraft}
                    label={h.quote ? `What about "${h.quote.slice(0, 40)}"` : 'The note'}
                    placeholder="What about it?"
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
                h.note && <NoteText markdown={h.note} className={styles.note} />
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
                {/* Removing is set apart from the benign actions by a
                    rule rather than a colour -- the same way leaving is
                    set apart from the sheets in the running head. It
                    used to sit in the same dot-separated run as "Edit
                    note", identical in size, weight and underline. */}
                <button
                  type="button"
                  className={`${styles.quiet} ${styles.destructive}`}
                  onClick={() => remove(h)}
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
