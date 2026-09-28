'use client'

import { useState } from 'react'
import type { Highlight as Mark } from '@didactic/core/types'
import { isUnsaved } from '@didactic/core/marks'
import { NoteEditor } from './NoteEditor'
import { NoteText } from './NoteText'
import { SummaryIcon } from './SummaryIcon'
import { ExpandIcon } from './ExpandIcon'
import { RemoveGate } from './RemoveGate'
import { inSectionOrder, summaryLabel } from '@didactic/core/summaries'
import styles from './MarkList.module.css'

/**
 * Everything marked in this lesson, down the side of it.
 *
 * The reading is on the left and what was taken out of it on the
 * right, in the order the lesson reads rather than the order the
 * reader wandered through it. Pressing a passage travels to it in the
 * text, which is the thing a list of quotes on another sheet can never
 * do: the mark is on the page it was taken from, and this is the index
 * to that page.
 */
export function MarkList({
  marks,
  leaving,
  onTravel,
  onSave,
  onRemove,
  onClose,
  onGone,
  noun = 'lesson',
  summaries = [],
  onFindSummary,
  onOpenSummary,
}: {
  /** Already in reading order. */
  marks: Mark[]
  /**
   * What the reader has said back about this reading. Pinned above the
   * marks, in the summary's treatment: it is the most considered thing
   * written here, and it is what the marks were on the way to.
   */
  summaries?: Mark[]
  /** What the reading is called: a lesson, or a resource read here. */
  noun?: string
  /** Travel to the section a summary says back. */
  onFindSummary?: (summary: Mark) => void
  /** Open a summary out in the column, where it can be rewritten. */
  onOpenSummary?: (summary: Mark) => void
  /** On its way out: it draws itself leaving, and says when it has. */
  leaving?: boolean
  /** Travel to the passage in the lesson. */
  onTravel: (id: string) => void
  onSave: (id: string, note: string) => Promise<void>
  /** Removal is not waited on -- the mark leaves the page at once and
   *  is written down behind the reader. */
  onRemove: (id: string) => void
  onClose: () => void
  onGone: () => void
}) {
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save(id: string) {
    setBusy(true)
    setError(null)
    try {
      await onSave(id, draft)
      setEditing(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save that note.')
    } finally {
      setBusy(false)
    }
  }

  function remove(id: string) {
    if (editing === id) setEditing(null)
    onRemove(id)
  }

  return (
    <aside
      className={leaving ? `${styles.list} ${styles.leaving}` : styles.list}
      aria-label={`What you have marked in this ${noun}`}
      // It is gone when it has finished going. Its own animation only:
      // a row inside it flashing is not the list leaving.
      onAnimationEnd={e => {
        if (leaving && e.target === e.currentTarget) onGone()
      }}
    >
      <div className={styles.head}>
        <p className={styles.title}>
          Marked here
          <span className={styles.tally}>{marks.length}</span>
        </p>
        <button type="button" className={styles.close} onClick={onClose} aria-label="Close the marks">
          ✕
        </button>
      </div>

      {summaries.length > 0 && (
        <section className={styles.said} aria-label="In your own words">
          <p className={styles.saidHead}>
            <span className={styles.saidSprig} aria-hidden="true">
              <SummaryIcon filled size={14} />
            </span>
            In your own words
          </p>
          <ol className={styles.saidList}>
            {inSectionOrder(summaries).map(summary => {
              // A section's summary can be travelled to and opened out;
              // the whole reading's is at the foot, and has neither.
              const ofSection = summary.section_at != null
              return (
                <li key={summary.id} className={styles.saidRow}>
                  <div className={styles.saidHead}>
                    {ofSection && onFindSummary ? (
                      <button
                        type="button"
                        className={`${styles.saidOf} ${styles.saidFind}`}
                        onClick={() => onFindSummary(summary)}
                        title="Go to this section"
                      >
                        {summaryLabel(summary.section)}
                      </button>
                    ) : (
                      <p className={styles.saidOf}>{summaryLabel(summary.section)}</p>
                    )}
                    {ofSection && onOpenSummary && (
                      <button
                        type="button"
                        className={styles.saidOpen}
                        onClick={() => onOpenSummary(summary)}
                        aria-label={`Open your summary of “${summary.section}”`}
                        title="Open it out"
                      >
                        <ExpandIcon folding={false} />
                      </button>
                    )}
                  </div>
                  {ofSection && onFindSummary ? (
                    <button
                      type="button"
                      className={styles.saidFindNote}
                      onClick={() => onFindSummary(summary)}
                      title="Go to this section"
                    >
                      <NoteText markdown={summary.note ?? ''} className={styles.saidNote} />
                    </button>
                  ) : (
                    <NoteText markdown={summary.note ?? ''} className={styles.saidNote} />
                  )}
                </li>
              )
            })}
          </ol>
        </section>
      )}

      {marks.length === 0 ? (
        <p className={styles.empty}>
          Nothing marked in this {noun} yet. Select a passage, or write a note on
          the {noun} itself.
        </p>
      ) : (
        <ol className={styles.marks}>
          {marks.map(mark => (
            <li key={mark.id} className={styles.mark}>
              {mark.quote ? (
                <button
                  type="button"
                  className={styles.passage}
                  onClick={() => onTravel(mark.id)}
                  title="Go to this passage"
                >
                  {mark.quote}
                </button>
              ) : (
                <p className={styles.about}>A note on this {noun}</p>
              )}

              {editing === mark.id ? (
                <>
                  <NoteEditor
                    className={styles.editor}
                    value={draft}
                    onChange={setDraft}
                    label="What about this passage"
                    placeholder="What about it?"
                  />
                  {error && <p className={styles.problem}>{error}</p>}
                  <div className={styles.actions}>
                    <button
                      type="button"
                      className={styles.keep}
                      onClick={() => save(mark.id)}
                      disabled={busy}
                    >
                      {busy ? 'Saving…' : 'Save'}
                    </button>
                    <button
                      type="button"
                      className={styles.quiet}
                      onClick={() => setEditing(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </>
              ) : (
                <>
                  {mark.note && <NoteText markdown={mark.note} className={styles.note} />}
                  {/* A mark still being written down has nothing on the
                      other end to edit or remove yet. */}
                  {isUnsaved(mark.id) ? (
                    <p className={styles.waiting}>Still being written down.</p>
                  ) : (
                    <div className={styles.actions}>
                      <button
                        type="button"
                        className={styles.quiet}
                        onClick={() => {
                          setEditing(mark.id)
                          setDraft(mark.note ?? '')
                          setError(null)
                        }}
                      >
                        {mark.note ? 'Edit note' : 'Add a note'}
                      </button>
                      <span className={styles.destructive}>
                        <RemoveGate className={styles.quiet} onRemove={() => remove(mark.id)} />
                      </span>
                    </div>
                  )}
                  {error && editing === null && <p className={styles.problem}>{error}</p>}
                </>
              )}
            </li>
          ))}
        </ol>
      )}
    </aside>
  )
}
