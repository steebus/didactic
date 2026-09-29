'use client'

import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { lessonSections } from '@didactic/core/sections'
import { summaryOf, summaryProblem } from '@didactic/core/summaries'
import { isUnsaved } from '@didactic/core/marks'
import type { Highlight } from '@didactic/core/types'
import { NoteEditor } from './NoteEditor'
import { NoteText } from './NoteText'
import { SummaryIcon } from './SummaryIcon'
import { ExpandIcon } from './ExpandIcon'
import { useOpenedOut } from './useOpenedOut'
import { useSideColumn } from './useSideColumn'
import { RemoveGate } from './RemoveGate'
import styles from './SectionSummaries.module.css'

/**
 * Asks for one section's summary to be opened out in the column, by the
 * heading's place in the reading: `{ detail: { at } }`. Said on the
 * window because what asks -- the marks' list -- is another component's.
 */
export const OPEN_SUMMARY = 'didactic:open-summary'

/** Where one heading's control and its writing go on the page. */
interface Host {
  /** Which heading, from nought, in reading order. */
  at: number
  /** What the heading says, as the markdown has it. */
  section: string
  /** Inside the heading, at the end of its words: the press. */
  trigger: HTMLElement
  /** After the heading: the field, when it is open. */
  panel: HTMLElement
}

/** Marks what this component put into the prose, so it can find its own
 *  again and so the painters and the selection leave it alone. */
const HOST = 'data-summary-host'

/**
 * A press beside every heading, for saying the section back.
 *
 * The prose is HTML the renderer set, not elements React owns, so the
 * controls are portalled into two small hosts stood in it for each
 * heading: one inside the heading, after its words, for the press --
 * small and quiet, so a heading still reads as a heading -- and one
 * straight after it for the field, empty until it is opened, so an
 * unopened section takes no more room than it did.
 *
 * The renderer sets the prose again whenever what it prints changes
 * (the roster of lesson names landing, a write finishing), which takes
 * the hosts with it. A watcher on the prose stands them again, so the
 * controls come back rather than quietly disappearing until a reload.
 *
 * Both hosts are skipped by the mark and cloze painters and refused by
 * the selection, so a summary is never searched as part of the text it
 * summarises.
 */
export function SectionSummaries({
  root,
  body,
  summaries,
  onSave,
  onRemove,
  noun = 'section',
}: {
  /** The element the reading is rendered into. */
  root: HTMLElement | null
  /** The reading, as markdown: the headings are read from it. */
  body: string
  summaries: Highlight[]
  onSave: (section: string, at: number, note: string) => Promise<boolean>
  onRemove: (id: string) => void
  noun?: string
}) {
  const sections = useMemo(() => lessonSections(body), [body])
  const [hosts, setHosts] = useState<Host[]>([])
  const [open, setOpen] = useState<number | null>(null)
  const [big, openOut, yieldOut] = useOpenedOut(open !== null)
  /** Sections whose written summary the reader has put away with the
   *  sprig. Shown by default: it is the reader's own account, and it
   *  belongs under the heading it sums up. */
  const [putAway, setPutAway] = useState<number[]>([])

  // Asked for from elsewhere on the page -- the marks' list opening a
  // summary out -- by the heading's place in the reading.
  useEffect(() => {
    const ask = (e: Event) => {
      const at = (e as CustomEvent<{ at: number }>).detail?.at
      if (typeof at !== 'number') return
      setOpen(at)
      openOut(true)
    }
    window.addEventListener(OPEN_SUMMARY, ask)
    return () => window.removeEventListener(OPEN_SUMMARY, ask)
  }, [openOut])

  // Open out, the summary takes the notes' column beside the reading,
  // and the sheet gives up the strip it stands in -- the same as a mark.
  // Another column taking the strip folds it back to its panel under the
  // heading, with what is written in it.
  const column = big && open !== null
  useSideColumn(column, 'summary', yieldOut)

  useEffect(() => {
    if (!root) return
    let frame = 0

    const stand = () => {
      const headings = Array.from(
        root.querySelectorAll<HTMLElement>('[data-prose] h1, [data-prose] h2, [data-prose] h3')
      )
      const next: Host[] = []

      headings.forEach((heading, at) => {
        const section = sections[at]
        if (!section) return

        let trigger = heading.querySelector<HTMLElement>(`:scope > [${HOST}="trigger"]`)
        if (!trigger) {
          trigger = document.createElement('span')
          trigger.setAttribute(HOST, 'trigger')
          trigger.className = styles.triggerHost
          heading.appendChild(trigger)
        }

        let panel = heading.nextElementSibling as HTMLElement | null
        if (!panel || panel.getAttribute(HOST) !== 'panel') {
          panel = document.createElement('div')
          panel.setAttribute(HOST, 'panel')
          heading.after(panel)
        }

        next.push({ at, section: section.text, trigger, panel })
      })

      setHosts(before =>
        before.length === next.length &&
        before.every(
          (h, i) =>
            h.trigger === next[i].trigger &&
            h.panel === next[i].panel &&
            h.section === next[i].section
        )
          ? before
          : next
      )
    }

    stand()

    // Anything the renderer sets again. The hosts' own contents changing
    // is this component rendering, and is not a reason to look.
    const watcher = new MutationObserver(records => {
      if (records.every(r => (r.target as Element).closest?.(`[${HOST}]`))) return
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(stand)
    })
    watcher.observe(root, { childList: true, subtree: true })

    return () => {
      cancelAnimationFrame(frame)
      watcher.disconnect()
    }
  }, [root, sections])

  // What was put in the prose comes out with this component, so a sheet
  // that stops offering summaries leaves no empty boxes behind.
  useEffect(() => {
    if (!root) return
    return () => {
      root.querySelectorAll(`[${HOST}]`).forEach(node => node.remove())
    }
  }, [root])

  return (
    <>
      {hosts.map(host => {
        const standing = summaryOf(summaries, host.section)
        const isOpen = open === host.at

        return (
          <SectionHost
            key={`${host.at}:${host.section}`}
            host={host}
            standing={standing}
            open={isOpen}
            big={big}
            onOpenOut={() => openOut(!big)}
            shown={!putAway.includes(host.at)}
            onShow={() =>
              setPutAway(away =>
                away.includes(host.at) ? away.filter(a => a !== host.at) : [...away, host.at]
              )
            }
            noun={noun}
            onToggle={() => setOpen(isOpen ? null : host.at)}
            onClose={() => setOpen(null)}
            onSave={note => onSave(host.section, host.at, note)}
            onRemove={onRemove}
          />
        )
      })}
    </>
  )
}

function SectionHost({
  host,
  standing,
  open,
  big,
  onOpenOut,
  shown,
  onShow,
  noun,
  onToggle,
  onClose,
  onSave,
  onRemove,
}: {
  host: Host
  standing: Highlight | undefined
  open: boolean
  /** Open out to the notes' column rather than beside the heading. */
  big: boolean
  onOpenOut: () => void
  /** Whether the written summary is showing, where there is one. */
  shown: boolean
  /** Show it, or put it away. */
  onShow: () => void
  noun: string
  onToggle: () => void
  onClose: () => void
  onSave: (note: string) => Promise<boolean>
  onRemove: (id: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [problem, setProblem] = useState<string | null>(null)

  const said = Boolean(standing?.note)
  // Nothing written yet opens straight onto the field: there is nothing
  // to read first.
  const writing = open && (editing || !said)

  function begin() {
    setDraft(standing?.note ?? '')
    setProblem(null)
    setEditing(true)
  }

  async function keep() {
    const wrong = summaryProblem(draft)
    if (wrong) {
      setProblem(wrong)
      return
    }
    setEditing(false)
    onClose()
    // Saved behind the reader; a failure is said by the sheet, which
    // holds the summaries and puts the old one back.
    await onSave(draft)
  }

  const label = said
    ? `Your summary of “${host.section}”`
    : `Summarise “${host.section}” in your own words`

  // The sprig does one thing per state. Nothing written: it opens the
  // field to write in. Written: it shows the summary in the reader's
  // hand, or puts it away -- reading and managing are different acts,
  // and managing is a press on the summary itself.
  const sprigSays = !said
    ? label
    : shown
    ? `Put away your summary of “${host.section}”`
    : `Show your summary of “${host.section}”`

  return (
    <>
      {createPortal(
        <button
          type="button"
          className={styles.trigger}
          data-said={said || undefined}
          aria-expanded={said ? shown : open}
          aria-label={sprigSays}
          title={sprigSays}
          onClick={() => {
            if (said) {
              if (open) onClose()
              onShow()
              return
            }
            if (!open) begin()
            onToggle()
          }}
        >
          <SummaryIcon filled={said} />
        </button>,
        host.trigger
      )}

      {/* The summary, in the reader's hand: under its heading on a phone,
          in the left margin where the sheet has one. A press opens its
          card, where it is rewritten or removed. Hidden from a screen
          reader, which has the sprig and the card to say it. */}
      {said &&
        shown &&
        !open &&
        createPortal(
          <div className={styles.rest} aria-hidden="true" onClick={onToggle}>
            <NoteText markdown={standing?.note ?? ''} className={styles.restText} />
          </div>,
          host.panel
        )}

      {open &&
        createPortal(
          <div
            className={big ? `${styles.panel} ${styles.big}` : styles.panel}
            role="group"
            aria-label={label}
          >
            <div className={styles.head}>
              <p className={styles.label}>
                {said && !writing ? 'In your own words' : `This ${noun} in your own words`}
              </p>
              <button
                type="button"
                className={styles.opener}
                onClick={onOpenOut}
                aria-label={big ? 'Fold the notes back' : 'Open the notes out'}
                aria-pressed={big}
                title={big ? 'Fold the notes back' : 'Open the notes out'}
              >
                <ExpandIcon folding={big} />
              </button>
            </div>
            {big && <p className={styles.of}>{host.section}</p>}

            {writing ? (
              <>
                <NoteEditor
                  className={styles.editor}
                  fill={big}
                  value={draft}
                  onChange={setDraft}
                  label={`A summary of “${host.section}”`}
                  placeholder="What did it say? Put it the way you would explain it to someone."
                  autoFocus
                />
                {problem && <p className={styles.problem}>{problem}</p>}
                <div className={styles.actions}>
                  <button type="button" className={styles.keep} onClick={keep}>
                    Keep it
                  </button>
                  <button
                    type="button"
                    className={styles.quiet}
                    onClick={() => {
                      setEditing(false)
                      if (!said) onClose()
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                <NoteText markdown={standing?.note ?? ''} className={styles.said} />
                <div className={styles.actions}>
                  <button
                    type="button"
                    className={styles.quiet}
                    onClick={begin}
                    disabled={standing ? isUnsaved(standing.id) : false}
                  >
                    Rewrite it
                  </button>
                  <span className={styles.destructive}>
                    <RemoveGate
                      className={styles.quiet}
                      disabled={standing ? isUnsaved(standing.id) : false}
                      onRemove={() => {
                        if (!standing) return
                        onRemove(standing.id)
                        onClose()
                      }}
                    />
                  </span>
                  <button type="button" className={styles.quiet} onClick={onClose}>
                    Close
                  </button>
                </div>
              </>
            )}
          </div>,
          // Open out, it hangs off the body: the column is measured
          // against the window, not the prose.
          big ? document.body : host.panel
        )}
    </>
  )
}
