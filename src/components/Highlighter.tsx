'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
// The DOM has a Highlight of its own, so ours is aliased rather than
// left to whichever the compiler reaches for first.
import type { Highlight as Mark } from '@/lib/types'
import { paintMarks } from '@/lib/paintMarks'
import { panelSpot, pinSpot, type Spot } from '@/lib/markAnchor'
import { NoteEditor } from './NoteEditor'
import { NoteIcon } from './NoteIcon'
import { ExpandIcon } from './ExpandIcon'
import { NoteText } from './NoteText'
import styles from './Highlighter.module.css'

/**
 * How long a selection has to stop changing before the offer to keep it
 * is placed, where there is no release to go on.
 *
 * Long enough that dragging a handle a character at a time does not
 * move the button under the reader's thumb, short enough that it does
 * not read as a lag. It only ever applies to the touch case: a mouse
 * says when it is done by coming up.
 */
const SETTLED_MS = 300

/** The sheet is narrow enough that a panel has to dock. Kept in step
 *  with the phone breakpoint the rest of the stylesheets use. */
const NARROW = '(max-width: 40rem)'

/** Whether the reader writes with the notes open out. Remembered
 *  because it is how they read, not a thing they choose per mark. */
const OPENED_OUT = 'didactic:notes-open'

/** A mark kept in this session but not yet confirmed by the server.
 *  It is drawn like any other; what it cannot do is be edited or
 *  removed, because there is nothing on the other end to edit yet. */
const UNSAVED = 'unsaved:'
const isUnsaved = (id: string) => id.startsWith(UNSAVED)

/**
 * A passage the reader has selected but not yet kept: the words, the
 * text before them, and the two places something can be put against
 * it -- the floating button, in window coordinates, and the composer,
 * in coordinates relative to the prose.
 */
interface Offer {
  quote: string
  prefix: string
  pin: { top: number; left: number }
  panel: Spot
}

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
  const [offer, setOffer] = useState<Offer | null>(null)
  const [open, setOpen] = useState<{ mark: Mark; at: Spot } | null>(null)
  const [note, setNote] = useState('')
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [at, setAt] = useState<Spot | null>(null)
  const [drawn, setDrawn] = useState(0)

  const narrow = useNarrow()
  const [big, setBig] = useState(remembered)

  /** Open the notes out, or fold them back, and remember which. */
  function openOut(next: boolean) {
    setBig(next)
    try {
      localStorage.setItem(OPENED_OUT, next ? 'yes' : 'no')
    } catch {
      // Site data blocked. The preference is not worth an error on the
      // page; it just will not outlast the session.
    }
  }

  /** Whether the last thing to touch the page was a finger. It decides
   *  which of the two ways of marking is in play, and a device can be
   *  both, so it is answered per gesture rather than per device. */
  const finger = useRef(false)

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
  // them yet.
  //
  // One that has been written down is matched by id. One still in
  // flight has no id the server would recognise, so it is matched on
  // what it says -- the passage, its anchor and the note -- which is
  // also what keeps two notes on the same lesson apart: they share an
  // empty quote and nothing else.
  const marks = useMemo(
    () => [
      ...existing,
      ...kept.filter(k =>
        isUnsaved(k.id)
          ? !existing.some(
              e =>
                e.quote === k.quote &&
                (e.prefix ?? '').trim() === (k.prefix ?? '').trim() &&
                (e.note ?? '') === (k.note ?? '')
            )
          : !existing.some(e => e.id === k.id)
      ),
    ],
    [existing, kept]
  )

  // --- Marking ---------------------------------------------------

  /** What is selected inside the prose, if anything worth keeping is. */
  const readSelection = useCallback((): Offer | null => {
    const root = holder.current
    if (!root) return null

    const selection = window.getSelection()
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null

    const range = selection.getRangeAt(0)
    if (!root.contains(range.commonAncestorContainer)) return null

    const quote = selection.toString().trim()
    if (quote.length < 3) return null

    // A little of the text before the selection, to tell two identical
    // passages apart when the mark is drawn back onto the page.
    const before = document.createRange()
    before.setStart(root, 0)
    before.setEnd(range.startContainer, range.startOffset)
    const prefix = before.toString().slice(-40)

    const view = { width: window.innerWidth, height: window.innerHeight }
    const rect = range.getBoundingClientRect()

    return {
      quote,
      prefix,
      pin: pinSpot(rect, view),
      panel: panelSpot(rect, root.getBoundingClientRect(), view),
    }
  }, [])

  /** Put the composer up against the passage. The mouse's way in: a
   *  release is a decision, and the selection is not going to move. */
  const compose = useCallback(
    (chosen: Offer | null) => {
      if (!chosen) return
      setOffer(null)
      setAt(chosen.panel)
      setPending({ quote: chosen.quote, prefix: chosen.prefix })
      setNote('')
      setError(null)
    },
    []
  )

  /**
   * Write about the lesson rather than about a passage in it.
   *
   * The composer opens with nothing quoted, and what is kept is a mark
   * with no words to draw: it belongs to the lesson's topic like any
   * other, it is searched with the rest, and it is the only kind of
   * mark that has to carry a note to exist at all.
   */
  function noteOnLesson() {
    setOffer(null)
    setOpen(null)
    setAt(null)
    setPending({ quote: '', prefix: '' })
    setNote('')
    setError(null)
    window.getSelection()?.removeAllRanges()
  }

  const take = useCallback(() => {
    if (pending || open) return
    compose(readSelection())
  }, [pending, open, compose, readSelection])

  /** Float the offer near the selection and otherwise stay out of the
   *  way. The finger's way in: the selection is still being made. */
  const offerToKeep = useCallback(() => {
    if (pending || open) return
    setOffer(readSelection())
  }, [pending, open, readSelection])

  useEffect(() => {
    // When the reader has finished choosing, by whichever of the ways
    // there are to know applies to the thing they are choosing with.
    //
    // A mouse says it is done by coming up, and the composer opens
    // there and then. A finger cannot: the selection is made by
    // long-press and then adjusted with the handles the browser draws
    // itself, and dragging those handles sends the page no events at
    // all. Opening the composer on the first settled selection -- which
    // is what this did -- took the selection over while it was still
    // one word long, and the reader had no way to widen it. So a finger
    // gets an offer floated beside the selection instead, and the
    // selection stays theirs until they take it.
    let settling: ReturnType<typeof setTimeout> | undefined
    let pressing = false

    const settle = () => {
      clearTimeout(settling)
      settling = setTimeout(() => (finger.current ? offerToKeep() : take()), SETTLED_MS)
    }
    const down = (e: PointerEvent) => {
      finger.current = e.pointerType !== 'mouse'
      pressing = true
      clearTimeout(settling)
    }
    const up = () => {
      pressing = false
      if (finger.current) settle()
      else take()
    }
    const changed = () => {
      const selection = window.getSelection()
      if (!selection || selection.isCollapsed) {
        // Letting go of a selection takes the offer with it, at once
        // rather than after the settling delay.
        clearTimeout(settling)
        setOffer(null)
        return
      }
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
  }, [offerToKeep, take])

  // The offer floats over the page rather than sitting in it, so the
  // prose scrolling under it would leave it behind. Re-measured against
  // the selection instead, which is still there.
  const offering = offer !== null
  useEffect(() => {
    if (!offering) return
    let frame = 0
    const follow = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => setOffer(readSelection()))
    }
    window.addEventListener('scroll', follow, { passive: true })
    window.addEventListener('resize', follow)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', follow)
      window.removeEventListener('resize', follow)
    }
  }, [offering, readSelection])

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
        setOffer(null)
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
    if (!pending && !open && !offer) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setPending(null)
      setOpen(null)
      setOffer(null)
      window.getSelection()?.removeAllRanges()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [pending, open, offer])

  /**
   * Whether a panel docks rather than standing against something.
   *
   * On a phone, always: a 24rem panel set against a sentence on a
   * narrow sheet hangs off the side of it and widens the page. And
   * anywhere, for a panel that was not opened against a passage at
   * all -- a note on the lesson has nothing to stand beside, and left
   * to its own place in the flow it lands under the end of the
   * reading, half off the bottom of the window.
   */
  const docked = (spot: Spot | null) => big || narrow || !spot

  /** Where a panel goes, where it goes anywhere in particular. */
  const placed = (spot: Spot | null) =>
    docked(spot)
      ? undefined
      : {
          top: spot!.top,
          left: spot!.left,
          // Lifted clear by its own height when it opens above, so the
          // panel sits over nothing it is describing.
          transform: spot!.above ? 'translateY(-100%)' : undefined,
        }

  const panelClass = (spot: Spot | null) =>
    `${styles.composer}${big ? ` ${styles.big}` : docked(spot) ? ` ${styles.docked}` : ''}`

  /**
   * Anything measured against the window is hung off the body rather
   * than left in the prose.
   *
   * Every sheet arrives under an animation on `main`, and an animation
   * that touches `transform` leaves `main` the containing block for
   * everything fixed inside it -- so a docked panel came to rest at the
   * foot of the article instead of the foot of the screen. A panel set
   * against a passage is still drawn where it belongs, in the prose it
   * is measured against.
   */
  const float = (node: React.ReactNode) =>
    typeof document === 'undefined' ? null : createPortal(node, document.body)

  /**
   * While the notes are open out, the sheet gives up the strip they
   * stand in rather than being covered by it -- a book with a notebook
   * open beside it, not a panel over the page. The width is stated in
   * globals.css, which is also where the sheet is told to make room.
   *
   * Said on the body because the reading is `main`, and a component
   * inside the sheet cannot narrow the sheet it is inside of.
   */
  useEffect(() => {
    if (!big || !(pending || open)) return
    document.body.dataset.notes = 'open'
    return () => {
      delete document.body.dataset.notes
    }
  }, [big, pending, open])

  /** The control that opens the notes out to a page of their own. */
  const opener = (
    <button
      type="button"
      className={styles.opener}
      onClick={() => openOut(!big)}
      aria-label={big ? 'Fold the notes back' : 'Open the notes out'}
      aria-pressed={big}
      title={big ? 'Fold the notes back' : 'Open the notes out'}
    >
      <ExpandIcon folding={big} />
    </button>
  )

  /** A panel stands where it was measured, or hangs off the body when
   *  it is docked to the corner of the screen. */
  const stand = (node: React.ReactNode, spot: Spot | null) =>
    docked(spot) ? float(node) : node

  // A mark with no passage is a note on the lesson: it is never drawn
  // on the prose, so it is counted apart rather than reported as a
  // passage that could not be found.
  const passages = marks.filter(m => m.quote.trim()).length
  const notes = marks.length - passages
  const unplaced = passages - drawn

  return (
    <div className={styles.holder} ref={holder}>
      {children}

      {/* Writing about the lesson rather than about a passage in it.
          Sticky rather than fixed, so it travels down the sheet's own
          edge with the reading and leaves when the reading is done --
          and so it needs no measuring, no scroll listener, and nothing
          to keep in step with the layout. */}
      {!pending && !open && !offer && (
        <div className={styles.desk}>
          <button
            type="button"
            className={styles.deskNote}
            onClick={noteOnLesson}
            aria-label="Write a note on this lesson"
            title="A note on this lesson"
          >
            <NoteIcon />
          </button>
        </div>
      )}

      {marks.length > 0 && (
        <p className={styles.count}>
          {passages > 0 && `${passages} ${passages === 1 ? 'passage' : 'passages'} marked here`}
          {passages > 0 && notes > 0 && ' · '}
          {notes > 0 && `${notes} ${notes === 1 ? 'note' : 'notes'} on the lesson`}
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

      {offer &&
        !pending &&
        !open &&
        float(
          <button
            type="button"
            className={styles.pin}
            style={{ top: offer.pin.top, left: offer.pin.left }}
            // The press must not reach the page: a tap outside a
            // selection is what ends it, and the words are the whole
            // point of the button. What is kept is what the offer was
            // holding, so a browser that ends the selection anyway
            // costs nothing.
            onPointerDown={e => {
              e.preventDefault()
              e.stopPropagation()
            }}
            onClick={() => compose(offer)}
          >
            Add mark
          </button>
        )}

      {pending &&
        stand(
          <div className={panelClass(at)} style={placed(at)} role="dialog">
            <div className={styles.panelHead}>
              {pending.quote ? (
                <blockquote className={styles.quote}>{pending.quote}</blockquote>
              ) : (
                <p className={styles.about}>A note on this lesson</p>
              )}
              {opener}
            </div>
            <NoteEditor
              className={styles.note}
              fill={big}
              value={note}
              onChange={setNote}
              label={pending.quote ? 'What about this passage' : 'A note on this lesson'}
              placeholder={
                pending.quote ? 'What about it? (optional)' : 'What the lesson left you with'
              }
              // Not on a phone: the keyboard would come up over the
              // passage before the reader has decided to write anything.
              autoFocus={!narrow}
            />
            {error && <p className={styles.problem}>{error}</p>}
            <div className={styles.actions}>
              {/* Never busy: the mark is drawn and this closes on the
                  press, and the writing goes on behind the reader. */}
              <button
                type="button"
                className={styles.keep}
                onClick={keep}
                // A mark with no passage is only the note: with nothing
                // written there is nothing to keep.
                disabled={!pending.quote && !note.trim()}
              >
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
          </div>,
          at
        )}

      {open &&
        stand(
          <div className={panelClass(open.at)} style={placed(open.at)} role="dialog">
            {editing ? (
              <>
                <div className={styles.panelHead}>
                  <p className={styles.about}>The note</p>
                  {opener}
                </div>
                <NoteEditor
                  className={styles.note}
                  fill={big}
                  value={note}
                  onChange={setNote}
                  label="What about this passage"
                  placeholder="What about it?"
                  autoFocus={!narrow}
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
                <div className={styles.panelHead}>
                  {open.mark.quote ? (
                    <blockquote className={styles.quote}>{open.mark.quote}</blockquote>
                  ) : (
                    <p className={styles.about}>A note on this lesson</p>
                  )}
                  {opener}
                </div>
                {open.mark.note ? (
                  <NoteText markdown={open.mark.note} className={styles.reading} />
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
          </div>,
          open.at
        )}
    </div>
  )
}

/**
 * Whether the reader last left the notes open out.
 *
 * Read as this component first renders rather than in an effect: the
 * panel it decides the shape of is not on the page until something is
 * marked, so there is nothing for it to disagree with. On the server,
 * and anywhere site data is blocked, it is simply no.
 */
function remembered(): boolean {
  try {
    return localStorage.getItem(OPENED_OUT) === 'yes'
  } catch {
    return false
  }
}

/** Whether the sheet is being read on a phone-width screen. */
function useNarrow() {
  const [narrow, setNarrow] = useState(false)

  useEffect(() => {
    const query = window.matchMedia(NARROW)
    const sync = () => setNarrow(query.matches)
    sync()
    query.addEventListener('change', sync)
    return () => query.removeEventListener('change', sync)
  }, [])

  return narrow
}
