'use client'

import { useState } from 'react'
import { summaryProblem, WHOLE_SUMMARY_NOTE } from '@didactic/core/summaries'
import { isUnsaved } from '@didactic/core/marks'
import type { Highlight } from '@didactic/core/types'
import { NoteEditor } from './NoteEditor'
import { NoteText } from './NoteText'
import { SummaryIcon } from './SummaryIcon'
import styles from './ReadingSummary.module.css'

/**
 * The whole reading, said back, at the foot of it.
 *
 * Where the section summaries are a press beside each heading, this one
 * is asked for in the open: it comes after the reading and before
 * saying how it went, which is the order the two happen in -- a reader
 * who cannot say what the lesson was about has their answer to *How did
 * you go?* before they reach it.
 *
 * The tally under the title counts the sections already said back, so
 * the one place a reader finishes is also where they can see how much
 * of the reading they have put into their own words.
 */
export function ReadingSummary({
  summary,
  tally,
  noun,
  onSave,
  onRemove,
  problem,
}: {
  /** The summary of the whole reading, if one stands. */
  summary: Highlight | undefined
  /** Sections said back, out of those the reading has. */
  tally: { said: number; of: number }
  /** 'lesson', or what a resource is called. */
  noun: string
  onSave: (note: string) => Promise<boolean>
  onRemove: (id: string) => void
  /** A save or removal that did not land, said by whoever holds them. */
  problem?: string | null
}) {
  const said = Boolean(summary?.note)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [wrong, setWrong] = useState<string | null>(null)
  const writing = editing || !said

  async function keep() {
    const why = summaryProblem(draft)
    if (why) {
      setWrong(why)
      return
    }
    setWrong(null)
    setEditing(false)
    const kept = await onSave(draft)
    if (kept) setDraft('')
  }

  return (
    <section className={styles.summary} aria-labelledby="reading-summary-title">
      <div className={styles.head}>
        <span className={styles.mark} aria-hidden="true">
          <SummaryIcon filled={said} size={20} />
        </span>
        <h2 id="reading-summary-title" className={styles.title}>
          In your own words
        </h2>
      </div>

      <p className={styles.note}>
        {said
          ? `Your account of this ${noun}.`
          : `Say what this ${noun} was about, the way you would explain it to someone who has not read it. ${WHOLE_SUMMARY_NOTE}`}
        {tally.of > 0 &&
          ` ${tally.said} of ${tally.of} ${tally.of === 1 ? 'section' : 'sections'} said back — press the sprig beside a heading to summarise one.`}
      </p>

      {writing ? (
        <>
          <NoteEditor
            className={styles.editor}
            value={draft}
            onChange={setDraft}
            label={`A summary of this ${noun}`}
            placeholder={`What was this ${noun} about?`}
            tall
          />
          {(wrong || problem) && <p className={styles.problem}>{wrong ?? problem}</p>}
          <div className={styles.actions}>
            <button type="button" className={styles.keep} onClick={keep}>
              {said ? 'Keep the new one' : 'Keep it'}
            </button>
            {said && (
              <button
                type="button"
                className={styles.quiet}
                onClick={() => {
                  setEditing(false)
                  setWrong(null)
                }}
              >
                Cancel
              </button>
            )}
          </div>
        </>
      ) : (
        <>
          <NoteText markdown={summary?.note ?? ''} className={styles.said} />
          {problem && <p className={styles.problem}>{problem}</p>}
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.quiet}
              disabled={summary ? isUnsaved(summary.id) : false}
              onClick={() => {
                setDraft(summary?.note ?? '')
                setWrong(null)
                setEditing(true)
              }}
            >
              Rewrite it
            </button>
            <button
              type="button"
              className={`${styles.quiet} ${styles.destructive}`}
              disabled={summary ? isUnsaved(summary.id) : false}
              onClick={() => summary && onRemove(summary.id)}
            >
              Remove
            </button>
          </div>
        </>
      )}
    </section>
  )
}
