'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { didactic } from '@didactic/api'
import type { HighlightRow } from '@didactic/core/shapes'
import { byDay, clips, dayName, ENTRY_CLIP, strandOf } from '@didactic/core/timeline'
import { NoteEditor } from '@/components/NoteEditor'
import { NoteText } from '@/components/NoteText'
import styles from './page.module.css'

const api = didactic()

/**
 * The timeline: what was kept and what was written, in the order it
 * happened.
 *
 * This sheet was a flat list of marked passages. It is now one stream
 * holding both -- passages kept while reading, and diary entries about
 * a week -- because they are the same history and reading them apart
 * meant holding two sheets in your head to see one month.
 *
 * Searching still navigates rather than filtering in place: the query
 * lives in the URL, so a search can be linked to, gone back to, and
 * reloaded into the same result.
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
  /** Entries opened out of their clip. An entry is a page about a week
   *  and a mark is a sentence; left whole in one stream, one long entry
   *  pushes a month of marks off the screen. */
  const [opened, setOpened] = useState<string[]>([])
  /** The last thing removed, held so it can be put back. */
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
    await api.highlights.patch(id, draft)
    setEditing(null)
    startTransition(() => router.refresh())
    setBusy(false)
  }

  /**
   * Removing is undoable rather than confirmed.
   *
   * A mark is hand-picked and there is no second copy of it, but a
   * confirm dialog would be a modal in a world that has no modals --
   * and it makes the safe case slower without making the unsafe case
   * safer. So the row goes, and what it held is kept in hand until the
   * sheet is left.
   */
  function remove(mark: HighlightRow) {
    setBusy(true)
    setError(null)
    setUndo(mark)
    setRemoved(gone => [...gone, mark.id])

    void (async () => {
      const { ok, error: failed } = await api.highlights.remove(mark.id)
      if (ok) {
        startTransition(() => router.refresh())
      } else {
        setRemoved(gone => gone.filter(id => id !== mark.id))
        setUndo(null)
        setError(failed ?? 'Could not remove that.')
      }
      setBusy(false)
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

    const { ok, error: failed } = await api.highlights.create({
      lessonId: undo.lesson_id,
      quote: undo.quote,
      prefix: undo.prefix,
      note: undo.note,
    })
    if (ok) {
      setUndo(null)
      startTransition(() => router.refresh())
    } else {
      setError(failed ?? 'Could not put that back.')
    }
    setBusy(false)
  }

  // What is on the sheet after this reader's own removals, gathered
  // into the days they happened on.
  const shown = highlights.filter(h => !removed.includes(h.id))
  const days = byDay(shown)

  const entries = shown.filter(h => h.kind === 'diary').length
  const marks = shown.length - entries

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
          placeholder="Search the quotes, your notes and your entries"
          aria-label="Search the timeline"
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
        {/* Both counted, because they are two different things to have
            done and a single total would hide which. */}
        {query ? `Matching "${query}": ` : ''}
        {marks} {marks === 1 ? 'mark' : 'marks'}
        {entries > 0 && ` · ${entries} ${entries === 1 ? 'entry' : 'entries'}`}
      </p>

      {error && <p className={styles.problem}>{error}</p>}

      {/* What was just removed, kept in hand. A passage is hand-picked
          and there is no second copy of it, so the way back stays on
          the sheet rather than expiring on a timer nobody is watching. */}
      {undo && (
        <p className={styles.undo}>
          Removed the {strandOf(undo) === 'entry' ? 'entry' : undo.quote ? 'passage' : 'note'}
          {undo.lesson?.title && (
            <>
              {' '}from <span className={styles.undoQuote}>{undo.lesson.title}</span>
            </>
          )}
          .{' '}
          {undo.kind === 'diary' ? (
            <span className={styles.undoQuote}>An entry cannot be put back once removed.</span>
          ) : undo.lesson_id ? (
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
            ? 'Nothing matches that. The search covers the passage, what you wrote about it, and your entries.'
            : 'Nothing here yet. Select any passage while reading a lesson to keep it — or write an entry from the head of any sheet, about what is sticking and what is not.'}
        </p>
      ) : (
        <ol className={styles.timeline}>
          {days.map(day => (
            <li key={day.date} className={styles.day}>
              {/* The date is the spine of the sheet: one heading over a
                  run, rather than a timestamp on every row. */}
              <h2 className={styles.dayName}>{dayName(day.date)}</h2>

              <ol className={styles.strands}>
                {day.entries.map(h => {
                  const strand = strandOf(h)
                  const isEntry = strand === 'entry'
                  const long = isEntry && clips(h.note)
                  const out = opened.includes(h.id)

                  return (
                    <li key={h.id} className={styles.strand} data-strand={strand}>
                      {isEntry ? (
                        <>
                          <p className={styles.label}>Entry</p>
                          {long && !out ? (
                            <>
                              <p className={styles.clipped}>
                                {(h.note ?? '').slice(0, ENTRY_CLIP).trimEnd()}…
                              </p>
                              <button
                                type="button"
                                className={styles.quiet}
                                onClick={() => setOpened(o => [...o, h.id])}
                              >
                                Read it
                              </button>
                            </>
                          ) : (
                            <>
                              {h.note && <NoteText markdown={h.note} className={styles.note} />}
                              {long && (
                                <button
                                  type="button"
                                  className={styles.quiet}
                                  onClick={() => setOpened(o => o.filter(id => id !== h.id))}
                                >
                                  Fold it back
                                </button>
                              )}
                            </>
                          )}
                        </>
                      ) : (
                        <>
                          {h.quote ? (
                            <blockquote className={styles.quote}>{h.quote}</blockquote>
                          ) : (
                            <p className={styles.label}>A note on this lesson</p>
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
                        </>
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
                        {!isEntry && editing !== h.id && (
                          <>
                            {(h.topic || h.lesson) && ' · '}
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
                        {/* Removing is set apart from the benign actions
                            by a rule rather than a colour -- the same way
                            leaving is set apart from the sheets in the
                            running head. */}
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
                  )
                })}
              </ol>
            </li>
          ))}
        </ol>
      )}
    </>
  )
}
