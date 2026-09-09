'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
// The DOM has a Highlight of its own, so ours is aliased rather than
// left to whichever the compiler reaches for first.
import type { Highlight as Mark } from '@/lib/types'
import { paintMarks } from '@/lib/paintMarks'
import styles from './Highlighter.module.css'

type At = { top: number; left: number; above?: boolean }

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
    // Only ever on release.
    //
    // Watching selectionchange, even debounced, read a pause as a
    // decision: the composer opened mid-drag and took the selection
    // over. Waiting for the pointer to come up is the only signal that
    // actually means done.
    //
    // touchend stands in for mouseup on a touch device, which does not
    // send one for a selection drag, and it is deferred a tick because
    // the selection is not always settled when it fires.
    const onTouch = () => setTimeout(onSelect, 0)
    document.addEventListener('mouseup', onSelect)
    document.addEventListener('touchend', onTouch)
    return () => {
      document.removeEventListener('mouseup', onSelect)
      document.removeEventListener('touchend', onTouch)
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
      existing.map(h => ({
        id: h.id,
        quote: h.quote,
        prefix: h.prefix,
        hasNote: Boolean(h.note),
      })),
      (id, where) => {
        const mark = existing.find(h => h.id === id)
        if (!mark) return
        setOpen({ mark, at: where })
        setPending(null)
        setNote(mark.note ?? '')
        setEditing(false)
        setError(null)
      }
    )
    setDrawn(painted.size)
  }, [existing, children])

  // --- Writing ---------------------------------------------------

  async function keep() {
    if (!pending) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/highlights', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ lessonId, ...pending, note }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'Could not keep that.')
      setPending(null)
      window.getSelection()?.removeAllRanges()
      onChanged?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  async function saveNote() {
    if (!open) return
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
    if (!open) return
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

  const unplaced = existing.length - drawn

  return (
    <div className={styles.holder} ref={holder}>
      {children}

      {existing.length > 0 && (
        <p className={styles.count}>
          {existing.length} {existing.length === 1 ? 'passage' : 'passages'} marked here
          {/* A mark whose words are no longer in the body cannot be
              drawn. Saying so beats a count that does not match what is
              visibly on the page. */}
          {unplaced > 0 && ` · ${unplaced} no longer in this text`}
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
            <button type="button" className={styles.keep} onClick={keep} disabled={busy}>
              {busy ? 'Keeping…' : 'Keep it'}
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
              {error && <p className={styles.problem}>{error}</p>}
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.keep}
                  onClick={() => {
                    setNote(open.mark.note ?? '')
                    setEditing(true)
                  }}
                >
                  {open.mark.note ? 'Edit note' : 'Add a note'}
                </button>
                <button type="button" className={styles.cancel} onClick={remove} disabled={busy}>
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
