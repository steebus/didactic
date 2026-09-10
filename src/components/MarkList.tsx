'use client'

import { useState } from 'react'
import type { Highlight as Mark } from '@/lib/types'
import { isUnsaved } from '@/lib/marks'
import { NoteEditor } from './NoteEditor'
import { NoteText } from './NoteText'
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
}: {
  /** Already in reading order. */
  marks: Mark[]
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
      aria-label="What you have marked in this lesson"
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

      {marks.length === 0 ? (
        <p className={styles.empty}>
          Nothing marked in this lesson yet. Select a passage, or write a note on
          the lesson itself.
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
                <p className={styles.about}>A note on this lesson</p>
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
                      <button
                        type="button"
                        className={`${styles.quiet} ${styles.destructive}`}
                        onClick={() => remove(mark.id)}
                      >
                        Remove
                      </button>
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
