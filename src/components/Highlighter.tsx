'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
// The DOM has a Highlight of its own, so ours is aliased rather than
// left to whichever the compiler reaches for first.
import type { Highlight as Mark } from '@/lib/types'
import styles from './Highlighter.module.css'

/**
 * Marking a passage, in place.
 *
 * Wraps the lesson body and watches for a selection inside it. What is
 * stored is the selected text itself, plus a little of what came
 * before it: a lesson body is rewritten on demand, so an offset into
 * the prose would point at nothing the next time the lesson is
 * regenerated, while the words survive.
 */
export function Highlighter({
  lessonId,
  existing,
  onSaved,
  children,
}: {
  lessonId: string
  existing: Mark[]
  onSaved?: () => void
  children: React.ReactNode
}) {
  const holder = useRef<HTMLDivElement>(null)
  const [pending, setPending] = useState<{ quote: string; prefix: string } | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Where the note box sits: beside the passage rather than in a corner
  // of the screen, so the thing being written about stays in view.
  const [at, setAt] = useState<{ top: number; left: number } | null>(null)

  const onSelect = useCallback(() => {
    if (pending) return
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
    setAt({ top: rect.bottom - rootRect.top + 8, left: rect.left - rootRect.left })
    setPending({ quote, prefix })
    setNote('')
    setError(null)
  }, [pending])

  useEffect(() => {
    // mouseup for a pointer; selectionchange is what a touch device
    // fires when the handles are let go, and it is debounced because
    // it also fires for every character of a drag.
    let timer: ReturnType<typeof setTimeout>
    const later = () => {
      clearTimeout(timer)
      timer = setTimeout(onSelect, 400)
    }
    document.addEventListener('mouseup', onSelect)
    document.addEventListener('selectionchange', later)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mouseup', onSelect)
      document.removeEventListener('selectionchange', later)
    }
  }, [onSelect])

  async function save() {
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
      onSaved?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={styles.holder} ref={holder}>
      {children}

      {existing.length > 0 && (
        <p className={styles.count}>
          {existing.length} {existing.length === 1 ? 'passage' : 'passages'} marked here
        </p>
      )}

      {pending && at && (
        <div className={styles.composer} style={{ top: at.top, left: at.left }}>
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
            <button type="button" className={styles.keep} onClick={save} disabled={busy}>
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
    </div>
  )
}
