'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { didactic } from '@didactic/api'
import type { HighlightRow } from '@didactic/core/shapes'
import {
  byDay,
  dayName,
  gist,
  opens,
  strandOf,
  tallyOf,
  STRAND_LABEL,
} from '@didactic/core/timeline'
import { NoteEditor } from '@/components/NoteEditor'
import { NoteText } from '@/components/NoteText'
import { StrandGlyph } from '@/components/StrandGlyph'
import styles from './page.module.css'

const api = didactic()

/**
 * The timeline: what was kept and what was written, in the order it
 * happened, drawn as a plate.
 *
 * It was an ordered list -- a date heading, then every row printed
 * whole, one after another. Which is honest and unreadable: an entry
 * about a week and a sentence off an article sat at the same weight, a
 * single long entry pushed a month of marks off the screen, and there
 * was no way to see the shape of a season without reading all of it.
 *
 * Now it is a stem. One line runs the length of the sheet with the days
 * as stations on it, and every row hangs off it as a specimen: a leaf
 * for a passage that was kept, a bud for a note of your own, the thing
 * in flower for an entry. Each shows its own opening words and opens in
 * place onto the rest.
 *
 * Three rules hold it to the catalogue rather than to a feed:
 *
 * - the summary is the row's **own words**, clipped, never a description
 *   of them. This sheet is a record of what someone chose to keep, and a
 *   generated précis would be the app talking over them;
 * - a row with nothing more under it gets no control that opens it, so
 *   pressing one is always worth it;
 * - the forms are what the rows *are*, not decoration. Which is why they
 *   are shared geometry in `core/specimens` and not a flourish in a
 *   stylesheet.
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
  /** Rows opened out of their clip. Everything starts folded: the sheet
   *  is for reading a season down, and a season read whole is the thing
   *  it could not do before. */
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

  /** What can be opened at all. A row holding nothing under its summary
   *  is already showing everything it has. */
  const foldable = shown.filter(opens)
  const allOut = foldable.length > 0 && foldable.every(h => opened.includes(h.id))

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

      <div className={styles.countRow}>
        <p className={styles.count}>
          {/* Both counted, because they are two different things to have
              done and a single total would hide which. */}
          {query ? `Matching "${query}": ` : ''}
          {tallyOf(shown) || 'nothing'}
        </p>

        {/* One press for the whole plate, for reading a season rather
            than finding one thing in it. Absent when nothing on the
            sheet has anything folded away. */}
        {foldable.length > 0 && (
          <button
            type="button"
            className={styles.foldAll}
            aria-pressed={allOut}
            onClick={() => setOpened(allOut ? [] : foldable.map(h => h.id))}
          >
            {allOut ? 'Fold them back' : 'Open them all'}
          </button>
        )}
      </div>

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
        // The stem. One line down the sheet, the days as stations on it,
        // every row a specimen hanging off it.
        <ol className={styles.timeline}>
          {days.map(day => (
            <li key={day.date} className={styles.day}>
              <h2 className={styles.dayName}>
                <span className={styles.dayNode} aria-hidden="true" />
                <span className={styles.dayLabel}>{dayName(day.date)}</span>
                <span className={styles.dayRule} aria-hidden="true" />
                <span className={styles.dayCount}>{tallyOf(day.entries)}</span>
              </h2>

              <ol className={styles.strands}>
                {day.entries.map(h => {
                  const strand = strandOf(h)
                  const isEntry = strand === 'entry'
                  // A row with nothing folded away is already open: it
                  // never gets a control that would do nothing.
                  const canOpen = opens(h)
                  const out = !canOpen || opened.includes(h.id)
                  const summary = gist(h)

                  return (
                    <li key={h.id} className={styles.strand} data-strand={strand} data-out={out || undefined}>
                      <span className={styles.stalk} aria-hidden="true" />
                      <span className={styles.specimen}>
                        <StrandGlyph strand={strand} className={styles.glyph} />
                      </span>

                      <div className={styles.strandBody}>
                        <p className={styles.strandLabel}>
                          {STRAND_LABEL[strand]}
                          {/* An entry is about a week and a mark is
                              about a sentence; where a mark came from
                              belongs in the caption, not the label. */}
                          {!isEntry && h.topic && (
                            <>
                              {' · '}
                              <Link href={`/topics/${h.topic.id}`} className={styles.inlineLink}>
                                {h.topic.title}
                              </Link>
                            </>
                          )}
                        </p>

                        {/* Folded: the row's own opening words. Never a
                            description of them. */}
                        {!out ? (
                          <button
                            type="button"
                            className={styles.summary}
                            aria-expanded={false}
                            onClick={() => setOpened(o => [...o, h.id])}
                          >
                            <span className={styles.summaryText} data-strand={strand}>
                              {summary || 'A mark with nothing written on it'}
                            </span>
                            <span className={styles.summaryMore}>Open</span>
                          </button>
                        ) : (
                          <>
                            {isEntry ? (
                              h.note && <NoteText markdown={h.note} className={styles.note} />
                            ) : (
                              <>
                                {h.quote ? (
                                  <blockquote className={styles.quote}>{h.quote}</blockquote>
                                ) : (
                                  !h.note && (
                                    <p className={styles.bare}>A note on this lesson</p>
                                  )
                                )}

                                {editing === h.id ? (
                                  <div className={styles.editor}>
                                    <NoteEditor
                                      className={styles.noteInput}
                                      value={draft}
                                      onChange={setDraft}
                                      label={
                                        h.quote ? `What about "${h.quote.slice(0, 40)}"` : 'The note'
                                      }
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
                              {isEntry && h.topic && (
                                <>
                                  <Link
                                    href={`/topics/${h.topic.id}`}
                                    className={styles.inlineLink}
                                  >
                                    {h.topic.title}
                                  </Link>
                                  {h.lesson && ' · '}
                                </>
                              )}
                              {h.lesson && (
                                <Link href={`/lesson/${h.lesson.id}`} className={styles.inlineLink}>
                                  {h.lesson.title}
                                </Link>
                              )}
                              {!isEntry && editing !== h.id && (
                                <>
                                  {h.lesson && ' · '}
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
                              {canOpen && (
                                <>
                                  {' · '}
                                  <button
                                    type="button"
                                    className={styles.quiet}
                                    aria-expanded
                                    onClick={() => setOpened(o => o.filter(id => id !== h.id))}
                                  >
                                    Fold it back
                                  </button>
                                </>
                              )}
                              {/* Removing is set apart from the benign
                                  actions by a rule rather than a colour
                                  -- the same way leaving is set apart
                                  from the sheets in the running head. */}
                              <button
                                type="button"
                                className={`${styles.quiet} ${styles.destructive}`}
                                onClick={() => remove(h)}
                                disabled={busy}
                              >
                                Remove
                              </button>
                            </p>
                          </>
                        )}
                      </div>
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
