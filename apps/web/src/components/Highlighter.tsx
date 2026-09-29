'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
// The DOM has a Highlight of its own, so ours is aliased rather than
// left to whichever the compiler reaches for first.
import { didactic } from '@didactic/api'
import type { Highlight as Mark } from '@didactic/core/types'
import { paintMarks } from '@/lib/paintMarks'
import { paintClozes } from '@/lib/paintClozes'
import { panelSpot, pinSpot, type Spot } from '@didactic/core/markAnchor'
import { usePlayer } from '@/components/Player'
import type { ClozeCard as Card } from '@didactic/core/clozes'
import { cardAnchor } from '@didactic/core/clozes'
import { ClozeCard } from './ClozeCard'
import { ClozeMaker } from './ClozeMaker'
import { NoteEditor } from './NoteEditor'
import { NoteIcon } from './NoteIcon'
import { AskIcon } from './AskIcon'
import { MarksIcon } from './MarksIcon'
import { TopIcon } from './TopIcon'
import { MarkList } from './MarkList'
import { UNSAVED, isUnsaved, inReadingOrder } from '@didactic/core/marks'
import { ExpandIcon } from './ExpandIcon'
import { useOpenedOut } from './useOpenedOut'
import { useBookmark, useKeptScroll } from './useReadingPlace'
import { BookmarkIcon } from './BookmarkIcon'
import { DialIcon } from './DialIcon'
import { RemoveGate } from './RemoveGate'
import { OPEN_SUMMARY } from './SectionSummaries'
import { NoteText } from './NoteText'
import styles from './Highlighter.module.css'

const api = didactic()

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

/**
 * Pulling the page aside on a phone, to read the margin it does not have.
 *
 * `latch` is how far a pull has to go before the page stays aside when
 * the finger lifts; `rest` is how long it stays with nothing touched --
 * long enough to find a note and press it, and every touch or scroll
 * starts the wait again. `share` is how much of the screen the margin
 * takes, leaving a sliver of the reading to tap to put it back.
 */
const PULL = { latch: 60, rest: 8000, share: 0.72, most: 288 }

/**
 * The least room either side of the sheet for the notes to stand in
 * the margins rather than over the reading. 15rem: less than that and
 * a note in the margin is a column of three words a line.
 */
const MARGIN_MIN = 240

/**
 * The least room for a panel -- a mark's, or a summary being written --
 * to open in the margin rather than against the passage. More than a
 * note needs, because the panel carries the editor's toolbar and its
 * buttons: 20rem of panel and the gap either side. Between the two a
 * note rests in the margin and its panel opens in the prose, where it
 * has the reading's width, rather than crushed into a strip.
 */
const PANEL_ROOM = 368

/** Where a panel stands: against a passage, or in the margin beside it. */
type At = Spot & { margin?: boolean }

/** A mark's first word, down the reading, for its note in the margin. */
interface Pinned {
  id: string
  top: number
}

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
  /** The top of the selection, relative to the prose: where it stands
   *  in the margin, where there is one. */
  top: number
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
  resourceId,
  existing,
  summaries = [],
  clozes = [],
  onChanged,
  onTended,
  deskWithin,
  children,
}: {
  /**
   * What is being read: a lesson, or a resource read in the app (053).
   * Exactly one. Everything kept here is kept against it.
   */
  lessonId?: string
  resourceId?: string
  existing: Mark[]
  /** What the reader has said back about this reading, pinned above the
   *  marks in the list beside it. The summaries themselves are written
   *  and kept by the sheet; this only shows them. */
  summaries?: Mark[]
  /**
   * The passages this lesson is being tended on, drawn in plum under
   * the prose. Defaults to none, so a caller that has never heard of
   * the garden -- the refresher renders this same body -- reads exactly
   * as before.
   */
  clozes?: Card[]
  onChanged?: () => void
  /** A cloze was planted, answered, rewritten or pulled up here. */
  onTended?: () => void
  /**
   * The box the desk's buttons are laid out in, where that is not this
   * one.
   *
   * The buttons sit on a sticky line, and a sticky line is bounded by
   * the box it is laid out in: left here, they come to rest where the
   * prose ends and then sit over its last few lines for the whole of
   * the rest of the sheet. A caller that has more sheet below the
   * reading -- the lesson, which has the tally, the rewrite, the
   * garden, *How did you go?* and the way on under it -- hands over the
   * element that holds all of it, and the desk is portalled in as its
   * last child so its travel is the length of the page.
   *
   * Given as an element rather than a ref because a ref's `.current` is
   * not state: it is filled during commit and changing it re-renders
   * nothing, so the portal would never be told it had somewhere to go.
   * A caller holds it in state and passes what it has.
   *
   * Nothing is lost while it is still null on the first render: the
   * desk renders here instead, and the two places pin to the same line
   * at the foot of the window, so what the reader sees does not move.
   */
  deskWithin?: HTMLElement | null
  children: React.ReactNode
}) {
  const holder = useRef<HTMLDivElement>(null)
  /** The same element, as state: the place hooks have to hear when it
   *  arrives, which a ref's `.current` never tells anyone. */
  const [reading, setReading] = useState<HTMLDivElement | null>(null)
  // Stable, or React detaches and re-attaches it on every commit, and
  // the state it sets re-renders the sheet forever.
  const holdReading = useCallback((el: HTMLDivElement | null) => {
    holder.current = el
    setReading(el)
  }, [])
  /** What the reading is called in the sheet's own sentences. */
  const noun = resourceId ? 'reading' : 'lesson'
  const [pending, setPending] = useState<{ quote: string; prefix: string } | null>(null)
  const [offer, setOffer] = useState<Offer | null>(null)
  const [open, setOpen] = useState<{ mark: Mark; at: At } | null>(null)
  /** The tended passage the reader pressed, and where its card stands. */
  const [openCloze, setOpenCloze] = useState<{ cloze: Card; at: Spot } | null>(null)
  /** Making a cloze out of the passage the composer is holding. */
  const [making, setMaking] = useState(false)
  /** Clozes planted or pulled up here, which the sheet has not caught
   *  up with yet -- without this a planted one is not drawn until the
   *  lesson is read again, and a pulled-up one is drawn after it. */
  const [planted, setPlanted] = useState<Card[]>([])
  const [uprooted, setUprooted] = useState<string[]>([])
  const [note, setNote] = useState('')
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [at, setAt] = useState<At | null>(null)
  /** The marks the page managed to draw, in the order they are read. */
  const [drawn, setDrawn] = useState<string[]>([])
  const [listing, setListing] = useState(false)
  /** The list is on its way out. It stays on the page until it has
   *  finished going: a panel that vanishes has not closed, it has been
   *  taken away. */
  const [leaving, setLeaving] = useState(false)

  /** Whether the reader has left the head of the sheet. */
  const [awayFromTop, setAwayFromTop] = useState(false)

  /** The desk's buttons out of their press. Folded on every visit. */
  const [unfurled, setUnfurled] = useState(false)

  // --- Where the reader stopped ------------------------------------

  const of = useMemo(
    () => (lessonId ? { lessonId } : resourceId ? { resourceId } : null),
    [lessonId, resourceId]
  )
  const place = useBookmark(reading, of)
  const restored = useKeptScroll(reading, of)
  /** The bookmark being dragged off its press: where the pointer went
   *  down, and whether it has travelled far enough to be a drag. */
  const dragging = useRef<{ x: number; y: number; moved: boolean } | null>(null)
  /** The line the dragged bookmark would land on, in the window. */
  const [dragAt, setDragAt] = useState<number | null>(null)
  const [backOffered, setBackOffered] = useState(false)

  // On arriving -- once the kept scroll has been put back -- offer the
  // way to the bookmark if it is not already on screen, and withdraw the
  // offer as soon as it is.
  const offeredOnce = useRef(false)
  useEffect(() => {
    if (restored === null || place.top === null || !reading) return
    const inView = () => {
      const y = reading.getBoundingClientRect().top + (place.top ?? 0)
      return y > 0 && y < window.innerHeight
    }
    const look = () => {
      if (!offeredOnce.current) {
        offeredOnce.current = true
        setBackOffered(!inView())
      } else if (inView()) setBackOffered(false)
    }
    const frame = requestAnimationFrame(look)
    window.addEventListener('scroll', look, { passive: true })
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', look)
    }
  }, [restored, place.top, reading])

  const narrow = useNarrow()
  const [big, openOut] = useOpenedOut()

  /**
   * The room beside the sheet, where there is enough of it for notes.
   *
   * Marks and summaries are marginalia, and a wide screen has margins
   * standing empty either side of the reading. Measured rather than
   * set by a breakpoint, because the sheet is not the same width on
   * every page and the notes column takes some of the window when it
   * is open. `left` and `right` are how far the sheet's edges stand out
   * from the prose's; `room` is the narrower of the two margins.
   */
  const [margin, setMargin] = useState<{ left: number; right: number; room: number } | null>(null)
  /** Every drawn mark, and how far down the reading it starts. */
  const [pinned, setPinned] = useState<Pinned[]>([])
  /** How far the sheet's left edge stands out from the prose: where the
   *  bookmark's ribbon hangs. */
  const [edge, setEdge] = useState(0)
  const marginNotes = useRef<HTMLDivElement>(null)

  const measure = useCallback(() => {
    const root = holder.current
    const sheet = root?.closest('main')
    if (!root || !sheet) return
    const r = root.getBoundingClientRect()
    const s = sheet.getBoundingClientRect()
    setEdge(Math.round(r.left - s.left))
    const room = Math.min(s.left, document.documentElement.clientWidth - s.right)
    const next =
      room >= MARGIN_MIN && !window.matchMedia(NARROW).matches
        ? {
            left: Math.round(r.left - s.left),
            right: Math.round(s.right - r.right),
            room: Math.round(room),
          }
        : null
    setMargin(m =>
      m && next && m.left === next.left && m.right === next.right && m.room === next.room ? m : next
    )

    // Only the first piece of each: a mark broken across a link or a
    // line of code is painted in several, and is one note. Measured at
    // every width -- the margin reads them on a wide screen and the
    // gutter's ticks on a phone.
    const tops: Pinned[] = []
    {
      const seen = new Set<string>()
      root.querySelectorAll<HTMLElement>('mark[data-mark]').forEach(piece => {
        const id = piece.dataset.mark
        if (!id || seen.has(id)) return
        seen.add(id)
        tops.push({ id, top: Math.round(piece.getBoundingClientRect().top - r.top) })
      })
    }
    setPinned(before =>
      before.length === tops.length &&
      before.every((p, i) => p.id === tops[i].id && p.top === tops[i].top)
        ? before
        : tops
    )
  }, [])

  // Anything that moves the prose moves its notes: the window, a
  // picture arriving, a summary opening under a heading.
  useEffect(() => {
    const root = holder.current
    if (!root) return
    let frame = 0
    const soon = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(measure)
    }
    window.addEventListener('resize', soon)
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(soon)
    observer?.observe(root)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', soon)
      observer?.disconnect()
    }
  }, [measure])

  // Notes in the margin stand level with their passage, unless the one
  // above is still running: then they queue under it, the way notes in
  // a real margin do. Every render, because a note's height is only
  // known once it is on the page.
  useLayoutEffect(() => {
    let floor = -Infinity
    marginNotes.current?.querySelectorAll<HTMLElement>('[data-top]').forEach(note => {
      const top = Math.max(Number(note.dataset.top), floor)
      note.style.top = `${top}px`
      floor = top + note.offsetHeight + 8
    })
  })

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
  /** Marks removed here, which the sheet has not caught up with yet.
   *  Without this a removed mark is drawn again on the next paint. */
  const [gone, setGone] = useState<string[]>([])

  /**
   * The marks of this lesson: the sheet's, and what this session has
   * done to them since.
   *
   * Writing a mark, editing its note and removing it all happen behind
   * the reader -- the sheet is re-read afterwards, and until it comes
   * back the page would otherwise print what the server last said. So
   * what is held here wins: an edited note over the sheet's copy of the
   * same mark, a removed one over its continued presence, and a mark
   * kept a moment ago over nothing at all.
   *
   * A mark written down is matched by id. One still in flight has no id
   * the server would recognise, so it is matched on what it says -- the
   * passage, its anchor and the note -- which is also what keeps two
   * notes on the same lesson apart: they share an empty quote and
   * nothing else.
   */
  const marks = useMemo(() => {
    const edited = new Map(kept.filter(k => !isUnsaved(k.id)).map(k => [k.id, k]))
    const merged = existing.map(e => edited.get(e.id) ?? e)
    const extras = kept.filter(k =>
      isUnsaved(k.id)
        ? !existing.some(
            e =>
              e.quote === k.quote &&
              (e.prefix ?? '').trim() === (k.prefix ?? '').trim() &&
              (e.note ?? '') === (k.note ?? '')
          )
        : !existing.some(e => e.id === k.id)
    )
    return [...merged, ...extras].filter(m => !gone.includes(m.id))
  }, [existing, kept, gone])

  /**
   * The clozes of this lesson: the sheet's, and what this session has
   * done to them since.
   *
   * The same arrangement the marks have, and for the same reason:
   * planting one and pulling one up both happen behind the reader, and
   * until the sheet comes back the page would otherwise print what the
   * server last said. Matched by id throughout -- unlike a mark, a
   * cloze is never drawn before the server has answered for it, because
   * the whole of it (its blank, its schedule) is the server's answer.
   */
  const tended = useMemo(() => {
    const changed = new Map(planted.map(c => [c.id, c]))
    const merged = clozes.map(c => changed.get(c.id) ?? c)
    const extras = planted.filter(c => !clozes.some(e => e.id === c.id))
    return [...merged, ...extras].filter(c => !uprooted.includes(c.id))
  }, [clozes, planted, uprooted])

  // --- Marking ---------------------------------------------------

  /** What is selected inside the prose, if anything worth keeping is. */
  const readSelection = useCallback((): Offer | null => {
    const root = holder.current
    if (!root) return null

    const selection = window.getSelection()
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null

    const range = selection.getRangeAt(0)
    if (!root.contains(range.commonAncestorContainer)) return null
    // The reader's own writing set into the prose -- a summary under a
    // heading -- is not the text, and is never offered as a passage.
    if (insideOwnWriting(range.startContainer) || insideOwnWriting(range.endContainer)) {
      return null
    }

    const quote = selection.toString().trim()
    if (quote.length < 3) return null

    // A little of the text before the selection, to tell two identical
    // passages apart when the mark is drawn back onto the page.
    const before = document.createRange()
    before.setStart(root, 0)
    before.setEnd(range.startContainer, range.startOffset)
    const prefix = textOutsideOwnWriting(before).slice(-40)

    const view = { width: window.innerWidth, height: window.innerHeight }
    const rect = range.getBoundingClientRect()

    const box = root.getBoundingClientRect()
    return {
      quote,
      prefix,
      pin: pinSpot(rect, view),
      panel: panelSpot(rect, box, view),
      top: Math.round(rect.top - box.top),
    }
  }, [])

  /**
   * Take the passage the reader chose, and open the panel on the verb
   * they picked.
   *
   * Both verbs land here because both start the same way -- the
   * selection is taken in hand and a panel is stood against it -- and
   * differ only in what the panel then shows. Keeping that in one place
   * is what stops a passage being captured two subtly different ways.
   */
  const compose = useCallback(
    (chosen: Offer | null, verb: 'mark' | 'cloze' = 'mark') => {
      if (!chosen) return
      setOffer(null)
      setOpenCloze(null)
      setMaking(verb === 'cloze')
      // Written in the margin beside the passage where there is one,
      // so the words being written about stay in view.
      setAt(margin && margin.room >= PANEL_ROOM && !listing ? inMargin(chosen.top) : chosen.panel)
      setPending({ quote: chosen.quote, prefix: chosen.prefix })
      setNote('')
      setError(null)
    },
    [margin, listing]
  )

  /**
   * Open the agent, with a passage if there is one.
   *
   * The desk is inside the sheet and the panel is mounted from the
   * layout, so they are in different trees; what to ask about travels as
   * an event rather than through a context that would have to wrap the
   * whole catalogue to carry one string.
   *
   * `null` is the desk button: ask about the lesson rather than about a
   * sentence in it, which is the same distinction `noteOnLesson` makes
   * just below.
   */
  const askAbout = useCallback((chosen: Offer | null) => {
    setOffer(null)
    window.dispatchEvent(
      new CustomEvent('didactic:ask', {
        detail: chosen ? { quote: chosen.quote, prefix: chosen.prefix } : {},
      })
    )
  }, [])

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

  /**
   * Float what this selection could become, beside it.
   *
   * There are two verbs now -- keep the passage, or ask it back later
   * -- so a selection cannot be presumed to mean either. It used to be
   * presumed on a mouse: a release opened the note composer there and
   * then, which was defensible while marking was the only thing a
   * selection could do and is not once it is one of two. It also meant
   * selecting a sentence merely to copy it threw a composer at you.
   */
  const offerToKeep = useCallback(() => {
    if (pending || open || openCloze) return
    setOffer(readSelection())
  }, [pending, open, openCloze, readSelection])

  /**
   * Whether the reader has left the head of the sheet.
   *
   * A screen's worth rather than a pixel: the button exists to save a
   * long journey back, and offering it to someone who has nudged the
   * page by a line is offering to undo the nudge. The threshold is also
   * what stops it flickering in and out around the top of the page.
   *
   * `passive`, because this listener must never be a reason a scroll
   * stutters -- it reads one number and sets one boolean.
   */
  useEffect(() => {
    const away = () => setAwayFromTop(window.scrollY > window.innerHeight * 0.75)

    away()
    window.addEventListener('scroll', away, { passive: true })
    // A sheet that grows under the reader -- a lesson finishing its
    // rounds, the garden arriving -- can put the top out of reach
    // without a scroll of their own.
    window.addEventListener('resize', away, { passive: true })

    return () => {
      window.removeEventListener('scroll', away)
      window.removeEventListener('resize', away)
    }
  }, [])

  /**
   * Back to the head of the sheet.
   *
   * Smooth unless the reader has asked for less motion, which is the
   * app's rule everywhere else and matters more here than most: this is
   * the longest travel any control in the catalogue performs.
   */
  const toTop = useCallback(() => {
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    window.scrollTo({ top: 0, behavior: still ? 'auto' : 'smooth' })
  }, [])

  useEffect(() => {
    // When the reader has finished choosing, by whichever of the ways
    // there are to know applies to the thing they are choosing with.
    //
    // Both ways end at the same offer, floated beside the selection;
    // what differs is when the page may believe the selection is
    // finished. A mouse says so by coming up. A finger cannot: the
    // selection is made by long-press and then adjusted with the
    // handles the browser draws itself, and dragging those handles
    // sends the page no events at all -- so a finger's selection is
    // taken as finished only once it has stopped changing for a moment,
    // and until then it stays theirs to widen.
    let settling: ReturnType<typeof setTimeout> | undefined
    let pressing = false

    const settle = () => {
      clearTimeout(settling)
      settling = setTimeout(offerToKeep, SETTLED_MS)
    }
    const down = (e: PointerEvent) => {
      finger.current = e.pointerType !== 'mouse'
      pressing = true
      clearTimeout(settling)
    }
    const up = () => {
      pressing = false
      if (finger.current) settle()
      else offerToKeep()
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
  }, [offerToKeep])

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

    // The tended passages go down first, and the marks over them.
    // Neither layer skips the other's wrappers, so the order is not
    // load-bearing -- it is simply the reading order of the two: a
    // sentence is tended because of what it says, and marked because
    // of what the reader thought about it.
    paintClozes(
      root,
      // `cardAnchor` is what a card offers the prose: its own anchor,
      // or -- for every cloze written before 046, when a card had to
      // quote its lesson -- the passage itself. A card with neither is
      // dropped here rather than searched for and not found.
      tended.flatMap(c => {
        const anchor = cardAnchor(c)
        return anchor ? [{ id: c.id, text: anchor, prefix: c.prefix }] : []
      }),
      (id, piece) => {
        const cloze = tended.find(c => c.id === id)
        if (!cloze) return
        setOpenCloze({
          cloze,
          at: panelSpot(piece.getBoundingClientRect(), root.getBoundingClientRect(), {
            width: window.innerWidth,
            height: window.innerHeight,
          }),
        })
        setOpen(null)
        setPending(null)
        setOffer(null)
        setMaking(false)
      }
    )

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
        const aside = pinned.find(p => p.id === id)
        if (mark)
          openMark(
            mark,
            margin && margin.room >= PANEL_ROOM && !listing && aside ? inMargin(aside.top) : where
          )
      }
    )
    // Held by value: the effect runs on every render, and a new array
    // each time would re-render the list under the reader for nothing.
    setDrawn(before =>
      before.length === painted.length && before.every((id, i) => id === painted[i])
        ? before
        : painted
    )
    measure()
  }, [marks, tended, children, margin, listing, pinned, measure])

  /** Open a mark's panel: pressed in the prose, or in the margin. */
  function openMark(mark: Mark, where: At) {
    setOpen({ mark, at: where })
    setOpenCloze(null)
    setPending(null)
    setOffer(null)
    setNote(mark.note ?? '')
    setEditing(false)
    setError(null)
  }

  // --- Writing ---------------------------------------------------

  function keep() {
    if (!pending) return

    const now = new Date().toISOString()
    const draft: Mark = {
      id: `${UNSAVED}${crypto.randomUUID()}`,
      user_id: '',
      // A mark: an entry is written from the running head and never
      // from inside a lesson.
      kind: 'mark',
      lesson_id: lessonId ?? null,
      resource_id: resourceId ?? null,
      topic_id: null,
      quote: pending.quote,
      // Trimmed the way the server trims it, so the row that comes
      // back matches the draft and the mark is not counted twice.
      prefix: pending.prefix.trim() || null,
      note: note.trim() || null,
      created_at: now,
      updated_at: now,
    }
    const written = { lessonId, resourceId, ...pending, note }

    // Drawn and out of the way first. Nothing below is work the reader
    // is waiting on.
    setKept(k => [...k, draft])
    setPending(null)
    setNote('')
    setError(null)
    setLost(null)
    window.getSelection()?.removeAllRanges()

    void (async () => {
      const { ok, body, error: failed } = await api.highlights.create(written)
      if (!ok) {
        setKept(k => k.filter(m => m.id !== draft.id))
        setLost(
          `That mark was not kept: ${
            failed ?? 'something went wrong'
          }. Select the passage again to try once more.`
        )
        return
      }

      // The real row, under the id the rest of the app knows it by,
      // so it can be edited or removed without a reload. It drops
      // out of this list as soon as the sheet is re-read.
      if (body.highlight) {
        setKept(k => k.map(m => (m.id === draft.id ? body.highlight : m)))
      }
      onChanged?.()
    })()
  }

  async function saveNote() {
    if (!open || isUnsaved(open.mark.id)) return
    setBusy(true)
    setError(null)

    const { ok, error: failed } = await api.highlights.patch(open.mark.id, note)
    if (ok) {
      setOpen(null)
      onChanged?.()
    } else {
      setError(failed ?? 'Could not save that note.')
    }
    setBusy(false)
  }

  /**
   * Remove the mark whose panel is open.
   *
   * The same removal the list does, so it behaves the same way: the
   * passage comes off the prose on the press and the row is dropped
   * behind the reader. It used to wait for the write and then only
   * tell the sheet to re-read itself, which left the wash sitting on
   * the words -- `gone` is what keeps a removed mark from being
   * painted again, and this path never added to it. The next repaint
   * drew it straight back, and the highlight stayed until a reload.
   */
  function remove() {
    if (!open || isUnsaved(open.mark.id)) return
    removeMark(open.mark.id)
  }

  // Escape closes whichever panel is up, which is the one keyboard
  // convention a panel like this must not get wrong.
  useEffect(() => {
    if (!pending && !open && !offer && !listing) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // Whichever is in front: a panel first, and the list only once
      // there is no panel over it.
      if (pending || open || offer) {
        setPending(null)
        setOpen(null)
        setOffer(null)
        window.getSelection()?.removeAllRanges()
        return
      }
      showMarks(false)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [pending, open, offer, listing])

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
  const docked = (spot: At | null) => big || narrow || !spot

  /** Where a panel goes, where it goes anywhere in particular. */
  const placed = (spot: At | null) =>
    docked(spot)
      ? undefined
      : spot!.margin
      ? { top: spot!.top }
      : {
          top: spot!.top,
          left: spot!.left,
          // Lifted clear by its own height when it opens above, so the
          // panel sits over nothing it is describing.
          transform: spot!.above ? 'translateY(-100%)' : undefined,
        }

  const panelClass = (spot: At | null) =>
    `${styles.composer}${
      big
        ? ` ${styles.big}`
        : docked(spot)
        ? ` ${styles.docked}`
        : spot!.margin
        ? ` ${styles.inMargin}`
        : ''
    }`

  /**
   * Whether a panel is standing across the foot of the screen.
   *
   * Which is the one case that collides with the player: a docked panel
   * takes the bottom edge, full width on a phone and the near corner on
   * anything wider, and the bar is already there. Opened out (`big`) is
   * not that -- those take the side of the window, like the mark list,
   * and the foot is left alone.
   */
  const overTheFoot =
    !big &&
    Boolean(
      (pending && docked(at)) ||
        (openCloze && docked(openCloze.at)) ||
        (open && docked(open.at))
    )

  /**
   * The docked panel itself, so its height can be published.
   *
   * State rather than a ref: three different panels render through this
   * and swapping one for another has to re-run the measuring, which a
   * ref quietly would not -- it would leave the observer watching a
   * node that is no longer on the page.
   */
  const [footPanel, setFootPanel] = useState<HTMLDivElement | null>(null)

  const player = usePlayer()
  const { standAside } = player

  /**
   * Writing about a passage is the foreground job; a recording running
   * in the background is not. So the player gives way to this rather
   * than the other way round, and it gives way by folding to its disc
   * rather than by anything moving.
   */
  useEffect(() => {
    standAside(overTheFoot)
    return () => standAside(false)
  }, [overTheFoot, standAside])

  /**
   * How much of the foot the panel has taken, for the player's disc to
   * stand on -- the same arrangement the bench and the marking desk
   * already have between them.
   *
   * Measured, because a panel is as tall as the passage it is quoting
   * and the note being written into it, and it grows as the reader
   * types.
   */
  useEffect(() => {
    if (!footPanel || !overTheFoot) {
      document.body.style.removeProperty('--mark-panel')
      return
    }

    const measure = () => {
      document.body.style.setProperty(
        '--mark-panel',
        `${footPanel.getBoundingClientRect().height}px`
      )
    }
    measure()

    if (typeof ResizeObserver === 'undefined') {
      return () => {
        document.body.style.removeProperty('--mark-panel')
      }
    }

    const observer = new ResizeObserver(measure)
    observer.observe(footPanel)
    return () => {
      observer.disconnect()
      document.body.style.removeProperty('--mark-panel')
    }
  }, [footPanel, overTheFoot])

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
  /**
   * Ask for the list, or send it away. Everything that opens or shuts
   * it goes through here, so it only ever leaves one way.
   *
   * Neither half reads the current state, which is what lets the swipe
   * call it: that listener is registered once and would otherwise hold
   * whatever `listing` was when it was, and a swipe back would find a
   * list that had been shut since the page loaded. Sending away a list
   * that is already away costs one timer and changes nothing.
   */
  function showMarks(next: boolean) {
    if (next) {
      setLeaving(false)
      setListing(true)
    } else {
      setLeaving(true)
    }
  }

  /** It has finished going. */
  function listGone() {
    setListing(false)
    setLeaving(false)
  }

  // One strip of the window, and one thing standing in it: a panel
  // opened out takes the column, and the list yields until it closes
  // rather than the two drawing over each other.
  const writing = big && Boolean(pending || open)
  const showList = listing && !writing
  // The sheet takes its width back as the list slides out rather than
  // after it, so the two movements are one.
  const columnOpen = writing || (showList && !leaving)
  /** Open, as against on its way out: what the controls say, and what
   *  pressing one of them does next. */
  const open_ = showList && !leaving

  // However the list goes, it is gone by the end of its own animation.
  // The timer is the backstop: an animation that never runs -- a tab in
  // the background, a browser that skipped it -- must not leave a panel
  // on the page that the reader has already dismissed.
  useEffect(() => {
    if (!leaving) return
    const timer = setTimeout(listGone, 800)
    return () => clearTimeout(timer)
  }, [leaving])

  // The sheet moves over when the column opens or shuts, and a moved
  // sheet has moved its margins. Measured once it has settled.
  useEffect(() => {
    const timer = setTimeout(measure, 450)
    return () => clearTimeout(timer)
  }, [columnOpen, measure])

  /** In the margin, and not under the notes column where it is open. */
  const marginalia = margin && !columnOpen
  /** Room in the margin for a panel as well as its notes. */
  const panelsAside = Boolean(marginalia && margin.room >= PANEL_ROOM)

  /** A note in the margin opened where its panel fits: beside it, or
   *  against the passage it marks when the margin is only a strip. */
  function besideNote(id: string, top: number): At {
    if (panelsAside) return inMargin(top)
    const root = holder.current
    const piece = root?.querySelector<HTMLElement>(`mark[data-mark="${CSS.escape(id)}"]`)
    if (!root || !piece) return inMargin(top)
    return panelSpot(piece.getBoundingClientRect(), root.getBoundingClientRect(), {
      width: window.innerWidth,
      height: window.innerHeight,
    })
  }

  useEffect(() => {
    if (!columnOpen) return
    document.body.dataset.notes = 'open'
    return () => {
      delete document.body.dataset.notes
    }
  }, [columnOpen])


  // --- Pulling the page aside ---------------------------------------

  /** How far the reading is pulled aside, and how far it can go. */
  const [pull, setPull] = useState(0)
  const [pullReach, setPullReach] = useState(PULL.most)
  /** A finger is on it: it follows without easing. */
  const [pulling, setPulling] = useState(false)
  const pullNow = useRef(0)
  pullNow.current = pull

  // A finger across the reading pulls it aside and shows the marks'
  // notes in the strip it uncovers, each at its line. Past the latch it
  // stays when the finger lifts; short of it, it goes back. Pulled back
  // the same way, or by a tap on the sliver of reading still showing.
  // With the list open, a swipe back still sends the list away.
  //
  // Only across: `touch-action: pan-y` on the reading leaves the up and
  // down to the browser, so a pull and a scroll never fight over one
  // finger. Kept off anything that scrolls sideways of its own accord
  // and off a selection being made.
  useEffect(() => {
    if (!narrow) return
    let from: {
      x: number
      y: number
      base: number
      way: 'across' | 'down' | null
      inMargin: boolean
    } | null = null
    let reach = PULL.most
    let last = 0

    const start = (e: TouchEvent) => {
      if (e.touches.length !== 1) return
      const target = e.target as Element | null
      if (!holder.current?.contains(target) || scrollsSideways(target)) return
      if (pending || open || openCloze || !window.getSelection()?.isCollapsed) return
      const touch = e.touches[0]
      reach = Math.min(PULL.most, window.innerWidth * PULL.share)
      setPullReach(reach)
      last = pullNow.current
      from = {
        x: touch.clientX,
        y: touch.clientY,
        base: pullNow.current,
        way: null,
        inMargin: Boolean(target?.closest(`.${styles.margin}`)),
      }
    }

    const move = (e: TouchEvent) => {
      if (!from || from.way === 'down') return
      const touch = e.touches[0]
      const dx = touch.clientX - from.x
      const dy = touch.clientY - from.y
      if (!from.way) {
        if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.5) from.way = 'across'
        else if (Math.abs(dy) > 10) from.way = 'down'
        else return
        if (from.way === 'down') return
        setPulling(true)
      }
      last = Math.min(reach, Math.max(0, from.base - dx))
      setPull(last)
    }

    const end = (e: TouchEvent) => {
      const was = from
      from = null
      if (!was) return
      if (was.way === 'across') {
        setPulling(false)
        const opening = was.base === 0
        setPull(opening ? (last > PULL.latch ? reach : 0) : last < reach - PULL.latch ? 0 : reach)
        // A swipe back with the list open still sends the list away.
        if (last < was.base) showMarks(false)
        return
      }
      // A tap on the reading while it is aside puts it back; a tap in
      // the margin is a note being opened.
      const touch = e.changedTouches[0]
      if (
        was.way === null &&
        was.base > 0 &&
        !was.inMargin &&
        touch &&
        Math.abs(touch.clientX - was.x) < 8
      ) {
        setPull(0)
      }
    }

    document.addEventListener('touchstart', start, { passive: true })
    document.addEventListener('touchmove', move, { passive: true })
    document.addEventListener('touchend', end, { passive: true })
    document.addEventListener('touchcancel', end, { passive: true })
    return () => {
      document.removeEventListener('touchstart', start)
      document.removeEventListener('touchmove', move)
      document.removeEventListener('touchend', end)
      document.removeEventListener('touchcancel', end)
    }
  }, [narrow, pending, open, openCloze])

  // Aside, it goes back on its own once nothing has touched it for a
  // while -- never while a note's panel is open, and every touch or
  // scroll starts the wait again.
  const busyWriting = Boolean(pending || open || openCloze)
  useEffect(() => {
    if (!pull || pulling || busyWriting) return
    let timer = window.setTimeout(() => setPull(0), PULL.rest)
    const again = () => {
      clearTimeout(timer)
      timer = window.setTimeout(() => setPull(0), PULL.rest)
    }
    document.addEventListener('touchstart', again, { passive: true })
    window.addEventListener('scroll', again, { passive: true })
    return () => {
      clearTimeout(timer)
      document.removeEventListener('touchstart', again)
      window.removeEventListener('scroll', again)
    }
  }, [pull, pulling, busyWriting])

  // Nothing is pulled aside at a width with margins of its own.
  const aside = narrow ? pull : 0

  /**
   * Go to a marked passage in the reading.
   *
   * The point of the list is that the mark is still on the page it was
   * taken from, so pressing one travels there rather than showing the
   * quote again. On a phone the list is over the reading, so it gets
   * out of the way first.
   */
  function travelTo(id: string) {
    const root = holder.current
    if (!root) return
    const piece = root.querySelector<HTMLElement>(
      `[data-mark="${typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(id) : id}"]`
    )
    if (!piece) return
    if (narrow) showMarks(false)
    piece.scrollIntoView({ behavior: 'smooth', block: 'center' })
    // Arriving somewhere in the middle of a page of prose, the mark
    // says which of the words on it was the one asked for.
    piece.dataset.found = ''
    setTimeout(() => delete piece.dataset.found, 1600)
  }

  /**
   * Go to the section a summary says back: its heading, by its place in
   * the reading, near the top of the window so the summary written under
   * it is in view too.
   */
  function findSummary(summary: Mark) {
    const root = holder.current
    if (!root || summary.section_at == null) return
    const heading = root.querySelectorAll<HTMLElement>(
      '[data-prose] h1, [data-prose] h2, [data-prose] h3'
    )[summary.section_at]
    if (!heading) return
    if (narrow) showMarks(false)
    heading.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  /** Save a note against a mark from the list beside the reading. */
  async function saveNoteFor(id: string, text: string) {
    // Throws rather than answering: the list beside the reading awaits
    // this and shows its own failure, so the sentence has to travel.
    const { ok, error: failed } = await api.highlights.patch(id, text)
    if (!ok) throw new Error(failed ?? 'Could not save that note.')
    // Kept in hand as well as re-read, so the list does not sit with
    // the old note while the sheet comes back.
    setKept(k => {
      const held = k.find(m => m.id === id)
      const from = held ?? marks.find(m => m.id === id)
      if (!from) return k
      const next = { ...from, note: text.trim() || null }
      return held ? k.map(m => (m.id === id ? next : m)) : [...k, next]
    })
    onChanged?.()
  }

  /**
   * Remove a mark, from the list and from the words it was drawn on.
   *
   * Taken off the page first and written down behind the reader, the
   * way keeping one is: removing a mark drops a row, rewrites an
   * exposure and recomputes the topic's figure, and none of that is
   * work anyone is waiting on. A failure puts the mark back rather than
   * leaving the page saying something the server does not.
   */
  function removeMark(id: string) {
    setGone(g => [...g, id])
    setLost(null)
    if (open?.mark.id === id) setOpen(null)

    void (async () => {
      const { ok, error: failed } = await api.highlights.remove(id)
      if (ok) {
        onChanged?.()
      } else {
        setGone(g => g.filter(x => x !== id))
        setLost(
          `That mark was not removed: ${
            failed ?? 'something went wrong'
          }. It is still here.`
        )
      }
    })()
  }

  /**
   * What the server made of a cloze written behind the reader.
   *
   * One handler for all three optimistic writes -- planting, editing,
   * answering -- because all three end the same way: the row the page
   * is holding is replaced by whatever is now true, and anything owed
   * to the reader is said in the one place a failure is said. A null
   * row is a plant that never landed -- the draft comes off the prose,
   * and since it was only ever this session's it needs no headstone. A
   * row with a sentence beside it is an answer or an edit that did not
   * reach the server: put it back as it was, and explain.
   */
  const settleCloze = useCallback(
    (id: string, cloze: Card | null, failed: string | null) => {
      setPlanted(p => (cloze ? p.map(c => (c.id === id ? cloze : c)) : p.filter(c => c.id !== id)))
      if (failed) setLost(failed)
      else onTended?.()
    },
    [onTended]
  )

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
  const stand = (node: React.ReactNode, spot: At | null) =>
    docked(spot) ? float(node) : node

  // A mark with no passage is a note on the lesson: it is never drawn
  // on the prose, so it is counted apart rather than reported as a
  // passage that could not be found.
  const passages = marks.filter(m => m.quote.trim()).length
  const notes = marks.length - passages
  const unplaced = passages - drawn.length

  /** One item of the dial: where it stands counting up from the press
   *  that unfurls it, which is the order they come out in. */
  const item = (from: number) => ({ style: { '--i': from } as React.CSSProperties })

  // Counted up from the press, so the one nearest it comes out first.
  const items = [
    marks.length + summaries.length > 0 && 'marks',
    'note',
    'ask',
    'bookmark',
    awayFromTop && 'top',
  ].filter(Boolean) as string[]
  const from = (name: string) => items.length - 1 - items.indexOf(name)

  /**
   * The bookmark's press, which is also the handle it is dragged off.
   *
   * A press drops it at the middle of what is on screen, or takes it out
   * where there is one already -- one per reading. A drag carries a line
   * across the reading and drops it where the line is let go. Told apart
   * by how far the pointer travelled, so a press with a shaky thumb is
   * still a press.
   */
  const bookmarkHandle = {
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
      dragging.current = { x: e.clientX, y: e.clientY, moved: false }
      e.currentTarget.setPointerCapture(e.pointerId)
    },
    onPointerMove: (e: React.PointerEvent<HTMLButtonElement>) => {
      const drag = dragging.current
      if (!drag) return
      if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 8) return
      drag.moved = true
      setDragAt(e.clientY)
    },
    onPointerUp: (e: React.PointerEvent<HTMLButtonElement>) => {
      const drag = dragging.current
      dragging.current = null
      setDragAt(null)
      if (!drag) return
      if (drag.moved) place.dropAt(e.clientY)
      else if (place.bookmark) place.remove()
      else place.dropHere()
      setUnfurled(false)
    },
    onPointerCancel: () => {
      dragging.current = null
      setDragAt(null)
    },
    // The keyboard's press arrives as a click with no pointer behind it.
    onClick: (e: React.MouseEvent<HTMLButtonElement>) => {
      if (e.detail !== 0) return
      if (place.bookmark) place.remove()
      else place.dropHere()
      setUnfurled(false)
    },
  }

  /** The buttons that stand at the corner of the reading, folded behind
   *  one press: the way into what is already marked, the ways to write
   *  about the reading, the bookmark, and the way back to the top. */
  const desk = (
    <div className={styles.desk}>
      {/* Offered on arriving, while the bookmark is out of sight: the
          way to it, which is not the bookmark's own press -- that one
          takes it out. Gone once it is used or the ribbon comes into
          view. */}
      {backOffered && (
        <button
          type="button"
          className={styles.backTo}
          onClick={() => {
            place.goTo()
            setBackOffered(false)
          }}
        >
          <BookmarkIcon filled />
          Back to where you stopped
        </button>
      )}

      <div className={styles.deskStack}>
        <div className={styles.dial} data-open={unfurled || undefined} inert={!unfurled}>
          {items.includes('marks') && (
            <button
              type="button"
              {...item(from('marks'))}
              className={`${styles.dialItem} ${styles.deskNote} ${styles.deskQuiet}`}
              onClick={() => {
                showMarks(!open_)
                setUnfurled(false)
              }}
              aria-label={`What you have marked in this ${noun}`}
              aria-expanded={open_}
              title={`What you have marked in this ${noun}`}
            >
              <MarksIcon />
              <span className={styles.deskTally}>{marks.length + summaries.length}</span>
            </button>
          )}
          <button
            type="button"
            {...item(from('note'))}
            className={`${styles.dialItem} ${styles.deskNote}`}
            onClick={() => {
              noteOnLesson()
              setUnfurled(false)
            }}
            aria-label={`Write a note on this ${noun}`}
            title={`A note on this ${noun}`}
          >
            <NoteIcon />
          </button>

          {/* The third that writes, and the only one that answers. It
              sits with the desk rather than in the corner of the window
              because these are the buttons a reader already reaches for. */}
          <button
            type="button"
            {...item(from('ask'))}
            className={`${styles.dialItem} ${styles.deskNote}`}
            onClick={() => {
              askAbout(null)
              setUnfurled(false)
            }}
            aria-label={`Ask about this ${noun}`}
            title={`Ask about this ${noun}`}
          >
            <AskIcon />
          </button>

          <button
            type="button"
            {...item(from('bookmark'))}
            className={`${styles.dialItem} ${styles.deskNote} ${styles.deskQuiet} ${styles.deskMark}`}
            data-set={place.bookmark ? '' : undefined}
            aria-label={
              place.bookmark
                ? 'Take the bookmark out'
                : 'Bookmark where you are, or drag it onto the page'
            }
            title={
              place.bookmark
                ? 'Take the bookmark out'
                : 'Bookmark the middle of the screen -- or drag it to the line'
            }
            {...bookmarkHandle}
          >
            <BookmarkIcon filled={Boolean(place.bookmark)} />
          </button>

          {/* The way back to the head of the sheet. It appears and goes,
              so it takes the end of the dial furthest from the press,
              where it cannot move the others under the reader's thumb. */}
          {items.includes('top') && (
            <button
              type="button"
              {...item(from('top'))}
              className={`${styles.dialItem} ${styles.deskNote} ${styles.deskQuiet}`}
              onClick={() => {
                toTop()
                setUnfurled(false)
              }}
              aria-label={`Back to the top of the ${noun}`}
              title="Back to the top"
            >
              <TopIcon />
            </button>
          )}
        </div>

        {/* The one press that stays: the rest unfurl up from it and go
            back into it. Folded on every visit. While folded it carries
            the count of what is marked, which the marks' own button
            carries when it is out. */}
        <button
          type="button"
          className={`${styles.deskNote} ${styles.dialPress}`}
          onClick={() => setUnfurled(u => !u)}
          aria-expanded={unfurled}
          aria-label={unfurled ? 'Put the buttons away' : `This ${noun}'s buttons`}
          title={unfurled ? 'Put the buttons away' : `Mark, write, ask, bookmark`}
        >
          <DialIcon />
          {!unfurled && marks.length + summaries.length > 0 && (
            <span className={styles.deskTally}>{marks.length + summaries.length}</span>
          )}
        </button>
      </div>
    </div>
  )

  /** In the box the caller named, or here while there is not one. */
  const deskIn = (node: React.ReactNode, host: HTMLElement | null | undefined) =>
    host ? createPortal(node, host) : node

  return (
    <div
      className={styles.holder}
      ref={holdReading}
      // Said on the holder so the summaries, which are set into the
      // prose by a component of their own, stand in the other margin
      // by the same measure.
      data-margins={marginalia ? '' : undefined}
      data-margin-panels={panelsAside ? '' : undefined}
      data-narrow={narrow || undefined}
      style={
        {
          // The gutter between the sheet's edge and the prose, at every
          // width: where the stars and the bookmark's ribbon stand.
          '--edge': `${edge}px`,
          ...(margin
            ? {
                '--reach-left': `${margin.left}px`,
                '--reach-right': `${margin.right}px`,
                '--margin-room': `${margin.room}px`,
              }
            : narrow
            ? {
                // The strip the pull uncovers, beside the reading.
                '--reach-right': '0px',
                '--margin-room': `${pullReach}px`,
                transform: aside ? `translateX(${-aside}px)` : undefined,
                transition: pulling ? 'none' : undefined,
              }
            : {}),
        } as Record<string, string | undefined> as React.CSSProperties
      }
    >
      {children}

      {/* The bookmark: a ribbon hanging off the sheet's left edge at the
          line it was dropped on. The words are what is kept; this is
          only where they are now. */}
      {place.top !== null && (
        <span
          className={styles.ribbon}
          style={{ top: place.top, '--edge': `${edge}px` } as React.CSSProperties}
          aria-hidden="true"
        />
      )}

      {/* The line a dragged bookmark would land on, across the reading. */}
      {dragAt !== null &&
        reading &&
        float(
          <div
            className={styles.dropLine}
            style={{
              top: dragAt,
              left: reading.getBoundingClientRect().left,
              width: reading.getBoundingClientRect().width,
            }}
            aria-hidden="true"
          />
        )}

      {/* Wherever the margin notes are not showing -- the window too
          narrow for them, or the notes column over them -- a star in the
          gutter beside every marked passage, filled where it carries a
          note. Pressing one is pressing the passage. */}
      {!marginalia &&
        pinned.map(({ id, top }, i) => {
          const mark = marks.find(m => m.id === id)
          if (!mark) return null
          return (
            <button
              // By where it stands, not by id: a mark kept a moment ago
              // changes id when the server answers, and a new key would
              // draw its star a second time.
              key={`${top}:${i}`}
              type="button"
              tabIndex={-1}
              aria-hidden="true"
              className={styles.tick}
              data-noted={mark.note ? '' : undefined}
              // Drawn on only for a mark kept in this visit: the rest were
              // on the page before it was.
              data-fresh={kept.some(k => k.id === id) || undefined}
              style={{ top }}
              onClick={() => openMark(mark, { top, left: 0, above: false })}
            >
              *
            </button>
          )
        })}

      {/* Every mark, down the right-hand margin beside its passage -- or
          in the strip a phone's pull uncovers: the note if it has one,
          the words if not. Quiet until pressed, and pressing one is
          pressing the passage. A copy of what the painted marks already
          offer the keyboard and a screen reader, so it is hidden from
          both. Buttons, which the painters skip, so a note is never
          searched as part of the text. */}
      {(marginalia || aside > 0) && pinned.length > 0 && (
        <div className={styles.margin} ref={marginNotes} aria-hidden="true">
          {pinned.map(({ id, top }) => {
            const mark = marks.find(m => m.id === id)
            if (!mark || open?.mark.id === id) return null
            return (
              <button
                key={id}
                type="button"
                tabIndex={-1}
                className={styles.marginNote}
                data-top={top}
                onClick={() => openMark(mark, besideNote(id, top))}
              >
                {mark.note ? (
                  <NoteText markdown={mark.note} className={styles.marginText} />
                ) : (
                  <span className={`${styles.marginText} ${styles.marginQuote}`}>{mark.quote}</span>
                )}
              </button>
            )
          })}
        </div>
      )}

      {/* Writing about the lesson rather than about a passage in it.
          Sticky rather than fixed, so it travels down the sheet's own
          edge with the reading -- and so it needs no measuring, no
          scroll listener, and nothing to keep in step with the layout.

          Laid out in `deskWithin` where the caller gave one, because a
          sticky line stops at the end of the box it is in and the box
          this component owns is the prose. See the prop.

          It gives way only to a panel docked across the foot, which
          stands where it does. A panel in the margin, against a
          passage or open out in the column is somewhere else, and the
          buttons stay. */}
      {!offer && !overTheFoot && deskIn(desk, deskWithin)}

      {/* The tally under the reading is also the way into the list:
          it is the sentence a reader looks at when they wonder what
          they marked, so it may as well answer. */}
      {marks.length > 0 && (
        <button
          type="button"
          className={styles.count}
          onClick={() => showMarks(!open_)}
          aria-expanded={open_}
        >
          {passages > 0 && `${passages} ${passages === 1 ? 'passage' : 'passages'} marked here`}
          {passages > 0 && notes > 0 && ' · '}
          {notes > 0 && `${notes} ${notes === 1 ? 'note' : 'notes'} on the ${noun}`}
          {/* A mark whose words are no longer in the body cannot be
              drawn. Saying so beats a count that does not match what is
              visibly on the page. */}
          {unplaced > 0 && ` · ${unplaced} no longer in this text`}
        </button>
      )}

      {/* A mark that was drawn and then could not be written. It is
          said here rather than in the composer, because the composer
          closed the moment the reader pressed the button -- which is
          the point of closing it. */}
      {(lost || place.problem) && (
        <p className={styles.problem} role="status">
          {lost ?? place.problem}
        </p>
      )}

      {showList &&
        float(
          <MarkList
            marks={inReadingOrder(marks, drawn)}
            noun={noun}
            summaries={summaries}
            leaving={leaving}
            onTravel={travelTo}
            onSave={saveNoteFor}
            onRemove={removeMark}
            onClose={() => showMarks(false)}
            onGone={listGone}
            onFindSummary={findSummary}
            onOpenSummary={summary => {
              // The column is one strip: the list gives it up to the
              // summary it was asked to open.
              showMarks(false)
              window.dispatchEvent(
                new CustomEvent(OPEN_SUMMARY, { detail: { at: summary.section_at } })
              )
              findSummary(summary)
            }}
          />
        )}

      {offer &&
        !pending &&
        !open &&
        !openCloze &&
        float(
          // What this selection could become. Two verbs, side by side
          // and the same weight, because a passage worth keeping and a
          // passage worth being asked back are different judgements and
          // neither is the default. Each wears the ink of the thing it
          // makes -- mustard for the mark, plum for the cloze -- so the
          // pair is told apart before it is read.
          <div
            className={styles.pins}
            style={{ top: offer.pin.top, left: offer.pin.left }}
            role="group"
            aria-label="What to do with this passage"
            // The press must not reach the page: a tap outside a
            // selection is what ends it, and the words are the whole
            // point of the buttons. What is taken is what the offer was
            // holding, so a browser that ends the selection anyway
            // costs nothing.
            onPointerDown={e => {
              e.preventDefault()
              e.stopPropagation()
            }}
          >
            <button
              type="button"
              className={`${styles.pin} ${styles.pinMark}`}
              onClick={() => compose(offer)}
            >
              Add mark
            </button>
            <button
              type="button"
              className={`${styles.pin} ${styles.pinCloze}`}
              onClick={() => compose(offer, 'cloze')}
            >
              Make a cloze
            </button>
            <button
              type="button"
              className={`${styles.pin} ${styles.pinAsk}`}
              onClick={() => askAbout(offer)}
            >
              Ask more
            </button>
          </div>
        )}

      {pending &&
        stand(
          <div ref={setFootPanel} className={panelClass(at)} style={placed(at)} role="dialog">
            <div className={styles.panelHead}>
              {pending.quote ? (
                <blockquote className={styles.quote}>{pending.quote}</blockquote>
              ) : (
                <p className={styles.about}>A note on this {noun}</p>
              )}
              {opener}
            </div>
            {/* The other thing a chosen passage can become. Keeping it
                is about what the reader thought; making a cloze of it
                is about whether they will still have it in a month, and
                the same selection answers either question. */}
            {making && pending.quote ? (
              <ClozeMaker
                lessonId={lessonId}
                resourceId={resourceId}
                quote={pending.quote}
                prefix={pending.prefix.trim() || null}
                // Drawn and closed on the press; the row is written
                // behind the reader, the way a mark is.
                onPlanted={draft => {
                  setPlanted(p => [...p, draft])
                  setMaking(false)
                  setPending(null)
                  setLost(null)
                  window.getSelection()?.removeAllRanges()
                  onTended?.()
                }}
                onSettled={settleCloze}
                onCancel={() => setMaking(false)}
              />
            ) : (
            <>
            <NoteEditor
              className={styles.note}
              fill={big}
              value={note}
              onChange={setNote}
              label={pending.quote ? 'What about this passage' : `A note on this ${noun}`}
              placeholder={
                pending.quote ? 'What about it? (optional)' : `What the ${noun} left you with`
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
            </>
            )}
          </div>,
          at
        )}

      {/* A tended passage, pressed in the reading. The same card the
          Tend sheet shows -- answered, rewritten or pulled up here
          without leaving the lesson. Two renderings of a flashcard
          would be two sets of answer buttons that could come to mean
          different things, which is the one thing a scheduler cannot
          survive. */}
      {openCloze &&
        stand(
          <div
            ref={setFootPanel}
            className={panelClass(openCloze.at)}
            style={placed(openCloze.at)}
            role="dialog"
          >
            <div className={styles.panelHead}>
              <p className={styles.about}>Tended here</p>
              <button
                type="button"
                className={styles.cancel}
                onClick={() => setOpenCloze(null)}
              >
                Close
              </button>
            </div>
            <ClozeCard
              key={openCloze.cloze.id}
              cloze={openCloze.cloze}
              where="lesson"
              // There is no next card in a lesson, so answering closes
              // the panel and gives the reader their page back. On the
              // press, like everywhere else.
              onAnswered={() => {
                setOpenCloze(null)
                setLost(null)
              }}
              onSettled={settleCloze}
              onEdited={next => {
                setPlanted(p => [...p.filter(c => c.id !== next.id), next])
                setOpenCloze(o => (o ? { ...o, cloze: next } : o))
                onTended?.()
              }}
              onRemoved={id => {
                setUprooted(u => [...u, id])
                setOpenCloze(null)
                onTended?.()
              }}
            />
          </div>,
          openCloze.at
        )}

      {open &&
        stand(
          <div
            ref={setFootPanel}
            className={panelClass(open.at)}
            style={placed(open.at)}
            role="dialog"
          >
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
                    <p className={styles.about}>A note on this {noun}</p>
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
                  <RemoveGate
                    className={styles.cancel}
                    onRemove={remove}
                    disabled={isUnsaved(open.mark.id)}
                  />
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

/** A panel standing in the margin, level with what it is about. */
function inMargin(top: number): At {
  return { top, left: 0, above: false, margin: true }
}

/** What this component and its neighbours set into the prose for the
 *  reader's own writing -- a summary under a heading. */
const OWN_WRITING = '[data-summary-host]'

/** Whether a node sits inside the reader's own writing in the prose. */
function insideOwnWriting(node: Node): boolean {
  const element = node instanceof Element ? node : node.parentElement
  return Boolean(element?.closest(OWN_WRITING))
}

/**
 * The text a range covers, leaving out the reader's own writing.
 *
 * What a mark's prefix is taken from. The painter searches the prose
 * with that writing skipped, so a prefix that ran through a summary
 * under a heading would be a prefix it could never find.
 */
function textOutsideOwnWriting(range: Range): string {
  const root = range.commonAncestorContainer
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let text = ''
  let node: Node | null
  while ((node = walker.nextNode())) {
    if (!range.intersectsNode(node) || insideOwnWriting(node)) continue
    const data = (node as Text).data
    const from = node === range.startContainer ? range.startOffset : 0
    const to = node === range.endContainer ? range.endOffset : data.length
    text += data.slice(from, to)
  }
  return text
}

/**
 * Whether the reader last left the notes open out.
 *
 * Read as this component first renders rather than in an effect: the
 * panel it decides the shape of is not on the page until something is
 * marked, so there is nothing for it to disagree with. On the server,
 * and anywhere site data is blocked, it is simply no.
 */
/**
 * Whether the touch landed on something that scrolls sideways itself.
 *
 * A plot and a wide table are put in a scrolling frame rather than
 * squashed (§8), and a swipe across one of those is the reader looking
 * along it, not asking for anything.
 */
function scrollsSideways(target: EventTarget | null): boolean {
  let node = target instanceof Element ? target : null
  while (node) {
    if (node.scrollWidth > node.clientWidth + 2) {
      const overflow = getComputedStyle(node).overflowX
      if (overflow === 'auto' || overflow === 'scroll') return true
    }
    node = node.parentElement
  }
  return false
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
