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
import styles from './SectionSummaries.module.css'

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
  noun,
  onToggle,
  onClose,
  onSave,
  onRemove,
}: {
  host: Host
  standing: Highlight | undefined
  open: boolean
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

  return (
    <>
      {createPortal(
        <button
          type="button"
          className={styles.trigger}
          data-said={said || undefined}
          aria-expanded={open}
          aria-label={label}
          title={label}
          onClick={() => {
            if (!open && !said) begin()
            else setEditing(false)
            onToggle()
          }}
        >
          <SummaryIcon filled={said} />
        </button>,
        host.trigger
      )}

      {open &&
        createPortal(
          <div className={styles.panel} role="group" aria-label={label}>
            <p className={styles.label}>
              {said && !writing ? 'In your own words' : `This ${noun} in your own words`}
            </p>

            {writing ? (
              <>
                <NoteEditor
                  className={styles.editor}
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
                  <button
                    type="button"
                    className={`${styles.quiet} ${styles.destructive}`}
                    disabled={standing ? isUnsaved(standing.id) : false}
                    onClick={() => {
                      if (!standing) return
                      onRemove(standing.id)
                      onClose()
                    }}
                  >
                    Remove
                  </button>
                  <button type="button" className={styles.quiet} onClick={onClose}>
                    Close
                  </button>
                </div>
              </>
            )}
          </div>,
          host.panel
        )}
    </>
  )
}
