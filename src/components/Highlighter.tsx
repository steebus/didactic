'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
// The DOM has a Highlight of its own, so ours is aliased rather than
// left to whichever the compiler reaches for first.
import type { Highlight as Mark } from '@/lib/types'
import { paintMarks } from '@/lib/paintMarks'
import styles from './Highlighter.module.css'

type At = { top: number; left: number; above?: boolean }

/**
 * How long a selection has to stop changing before it counts as
 * finished, where there is no release to go on.
 *
 * Long enough that dragging a handle a character at a time does not
 * open the composer under the reader's thumb, short enough that it
 * does not read as a lag. It only ever applies to the touch case: a
 * mouse says when it is done by coming up.
 */
const SETTLED_MS = 400

/** A mark kept in this session but not yet confirmed by the server.
 *  It is drawn like any other; what it cannot do is be edited or
 *  removed, because there is nothing on the other end to edit yet. */
const UNSAVED = 'unsaved:'
const isUnsaved = (id: string) => id.startsWith(UNSAVED)

/**
 * Marking a passage, and living with the marks afterwards.
 *
 * Wraps the lesson body: watches for a selection inside it, and paints
 * every kept passage back onto the prose so a mark is a thing on the
 * page rather than a row on another sheet. What is stored is the
 * selected text itself, plus a little of what came before it -- a
 * lesson body is rewritten on demand, so an offset into the prose would
 * point at nothing the next time the lesson is regenerated, while the
 * words survive.
 */
export function Highlighter({
  lessonId,
  existing,
  onChanged,
  children,
}: {
  lessonId: string
  existing: Mark[]
  onChanged?: () => void
  children: React.ReactNode
}) {
  const holder = useRef<HTMLDivElement>(null)

  const [pending, setPending] = useState<{ quote: string; prefix: string } | null>(null)
  const [open, setOpen] = useState<{ mark: Mark; at: At } | null>(null)
  const [note, setNote] = useState('')
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [at, setAt] = useState<At | null>(null)
  const [drawn, setDrawn] = useState(0)

  /**
   * Marks kept in this session that the server has not answered for
   * yet, and the one that failed.
   *
   * Keeping a passage writes the mark, writes an exposure and
   * recomputes the topic's ability, which is a few seconds of work
   * behind a button that said "Keeping…" for every one of them. None
   * of it is work the reader is waiting on: they marked a sentence and
   * want to carry on reading. So the mark is drawn and the composer
   * closes at once, and the writing happens behind them. A failure
   * takes the drawing back rather than leaving a mark that only exists
   * on this screen.
   */
  const [kept, setKept] = useState<Mark[]>([])
  const [lost, setLost] = useState<string | null>(null)

  // The server's marks, plus this session's that have not come back in
  // them yet. Matched on the passage rather than the id, because the
  // id the server gives it is not the one it was drawn under.
  const marks = useMemo(
    () => [
      ...existing,
      ...kept.filter(
        k =>
          !existing.some(
            e =>
              e.quote === k.quote &&
              (e.prefix ?? '').trim() === (k.prefix ?? '').trim()
          )
      ),
    ],
    [existing, kept]
  )

  // --- Marking ---------------------------------------------------

  const onSelect = useCallback(() => {
    if (pending || open) return
    const selection = window.getSelection()
    if (!selection || selection.isCollapsed) return

    const range = selection.getRangeAt(0)
    const root = holder.current
    if (!root || !root.contains(range.commonAncestorContainer)) return

    const quote = selection.toString().trim()
    if (quote.length < 3) return

    // A little of the text before the selection, to tell two identical
    // passages apart when the mark is drawn back onto the page.
    const before = document.createRange()
    before.setStart(root, 0)
    before.setEnd(range.startContainer, range.startOffset)
    const prefix = before.toString().slice(-40)

    const rect = range.getBoundingClientRect()
    const rootRect = root.getBoundingClientRect()
    setAt({ top: rect.bottom - rootRect.top + 8, left: Math.max(0, rect.left - rootRect.left) })
    setPending({ quote, prefix })
    setNote('')
    setError(null)
  }, [pending, open])

  useEffect(() => {
    // When the reader has finished choosing, by either of the two ways
    // there are to know.
    //
    // Watching selectionchange alone, even debounced, read a pause
    // mid-drag as a decision: the composer opened and took the
    // selection over. Waiting only for a release missed the other
    // half. On a phone the selection is made by long-press and then
    // adjusted with handles the browser draws itself, and dragging
    // those handles sends the page no touch events at all -- so the
    // only touchend was the one from the long-press, which arrives
    // before there is a selection to read. Nothing opened, and the
    // reader had to tap again to produce an event that would. That
    // second tap was the bug.
    //
    // So a release opens it at once where there is one, and otherwise
    // a selection that has stopped changing counts as a decision. A
    // pointer still down blocks both, which is the mid-drag case the
    // first rule was there for.
    let settling: ReturnType<typeof setTimeout> | undefined
    let pressing = false

    const settle = () => {
      clearTimeout(settling)
      settling = setTimeout(onSelect, SETTLED_MS)
    }
    const down = () => {
      pressing = true
      clearTimeout(settling)
    }
    const up = () => {
      pressing = false
      onSelect()
    }
    const changed = () => {
      if (!pressing) settle()
    }

    document.addEventListener('pointerdown', down)
    document.addEventListener('pointerup', up)
    document.addEventListener('pointercancel', up)
    document.addEventListener('selectionchange', changed)
    return () => {
      clearTimeout(settling)
      document.removeEventListener('pointerdown', down)
      document.removeEventListener('pointerup', up)
      document.removeEventListener('pointercancel', up)
      document.removeEventListener('selectionchange', changed)
    }
  }, [onSelect])

  // --- Painting --------------------------------------------------

  // After layout rather than after paint, so the marks are already
  // drawn the first time the reader sees the prose.
  useLayoutEffect(() => {
    const root = holder.current
    if (!root) return
    const painted = paintMarks(
      root,
      marks.map(h => ({
        id: h.id,
        quote: h.quote,
        prefix: h.prefix,
        hasNote: Boolean(h.note),
      })),
      (id, where) => {
        const mark = marks.find(h => h.id === id)
        if (!mark) return
        setOpen({ mark, at: where })
        setPending(null)
        setNote(mark.note ?? '')
        setEditing(false)
        setError(null)
      }
    )
    setDrawn(painted.size)
  }, [marks, children])

  // --- Writing ---------------------------------------------------

  function keep() {
    if (!pending) return

    const now = new Date().toISOString()
    const draft: Mark = {
      id: `${UNSAVED}${crypto.randomUUID()}`,
      user_id: '',
      lesson_id: lessonId,
      topic_id: null,
      quote: pending.quote,
      // Trimmed the way the server trims it, so the row that comes
      // back matches the draft and the mark is not counted twice.
      prefix: pending.prefix.trim() || null,
      note: note.trim() || null,
      created_at: now,
      updated_at: now,
    }
    const written = { lessonId, ...pending, note }

    // Drawn and out of the way first. Nothing below is work the reader
    // is waiting on.
    setKept(k => [...k, draft])
    setPending(null)
    setNote('')
    setError(null)
    setLost(null)
    window.getSelection()?.removeAllRanges()

    void (async () => {
      try {
        const res = await fetch('/api/highlights', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(written),
        })
        const body = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(body.error ?? 'Could not keep that.')

        // The real row, under the id the rest of the app knows it by,
        // so it can be edited or removed without a reload. It drops
        // out of this list as soon as the sheet is re-read.
        if (body.highlight) {
          setKept(k => k.map(m => (m.id === draft.id ? (body.highlight as Mark) : m)))
        }
        onChanged?.()
      } catch (e) {
        setKept(k => k.filter(m => m.id !== draft.id))
        setLost(
          `That mark was not kept: ${
            e instanceof Error ? e.message : 'something went wrong'
          }. Select the passage again to try once more.`
        )
      }
    })()
  }

  async function saveNote() {
    if (!open || isUnsaved(open.mark.id)) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/highlights', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: open.mark.id, note }),
      })
      if (!res.ok) throw new Error('Could not save that note.')
      setOpen(null)
      onChanged?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (!open || isUnsaved(open.mark.id)) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/highlights', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: open.mark.id }),
      })
      if (!res.ok) throw new Error('Could not remove that.')
      setOpen(null)
      onChanged?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  // Escape closes whichever panel is up, which is the one keyboard
  // convention a panel like this must not get wrong.
  useEffect(() => {
    if (!pending && !open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setPending(null)
      setOpen(null)
      window.getSelection()?.removeAllRanges()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [pending, open])

  const unplaced = marks.length - drawn

  return (
    <div className={styles.holder} ref={holder}>
      {children}

      {marks.length > 0 && (
        <p className={styles.count}>
          {marks.length} {marks.length === 1 ? 'passage' : 'passages'} marked here
          {/* A mark whose words are no longer in the body cannot be
              drawn. Saying so beats a count that does not match what is
              visibly on the page. */}
          {unplaced > 0 && ` · ${unplaced} no longer in this text`}
        </p>
      )}

      {/* A mark that was drawn and then could not be written. It is
          said here rather than in the composer, because the composer
          closed the moment the reader pressed the button -- which is
          the point of closing it. */}
      {lost && (
        <p className={styles.problem} role="status">
          {lost}
        </p>
      )}

      {pending && at && (
        <div className={styles.composer} style={{ top: at.top, left: at.left }} role="dialog">
          <blockquote className={styles.quote}>{pending.quote}</blockquote>
          <textarea
            className={styles.note}
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="What about it? (optional)"
            rows={2}
            autoFocus
          />
          {error && <p className={styles.problem}>{error}</p>}
          <div className={styles.actions}>
            {/* Never busy: the mark is drawn and this closes on the
                press, and the writing goes on behind the reader. */}
            <button type="button" className={styles.keep} onClick={keep}>
              Keep it
            </button>
            <button
              type="button"
              className={styles.cancel}
              onClick={() => {
                setPending(null)
                window.getSelection()?.removeAllRanges()
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {open && (
        <div
          className={styles.composer}
          style={{
            top: open.at.top,
            left: open.at.left,
            // Lifted clear by its own height when it opens above, so
            // the panel sits over nothing it is describing.
            transform: open.at.above ? 'translateY(-100%)' : undefined,
          }}
          role="dialog"
        >
          {editing ? (
            <>
              <textarea
                className={styles.note}
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="What about it?"
                rows={3}
                autoFocus
              />
              {error && <p className={styles.problem}>{error}</p>}
              <div className={styles.actions}>
                <button type="button" className={styles.keep} onClick={saveNote} disabled={busy}>
                  {busy ? 'Saving…' : 'Save'}
                </button>
                <button type="button" className={styles.cancel} onClick={() => setEditing(false)}>
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <>
              <blockquote className={styles.quote}>{open.mark.quote}</blockquote>
              {open.mark.note ? (
                <p className={styles.reading}>{open.mark.note}</p>
              ) : (
                <p className={styles.unnoted}>Kept, with nothing written about it.</p>
              )}
              {isUnsaved(open.mark.id) && (
                <p className={styles.unnoted}>
                  Still being written down. It can be changed in a moment.
                </p>
              )}
              {error && <p className={styles.problem}>{error}</p>}
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.keep}
                  disabled={isUnsaved(open.mark.id)}
                  onClick={() => {
                    setNote(open.mark.note ?? '')
                    setEditing(true)
                  }}
                >
                  {open.mark.note ? 'Edit note' : 'Add a note'}
                </button>
                <button
                  type="button"
                  className={styles.cancel}
                  onClick={remove}
                  disabled={busy || isUnsaved(open.mark.id)}
                >
                  {busy ? 'Removing…' : 'Remove'}
                </button>
                <button type="button" className={styles.cancel} onClick={() => setOpen(null)}>
                  Close
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
