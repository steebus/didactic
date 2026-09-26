'use client'

import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { slugFor } from '@didactic/core/sections'
import { inSectionOrder, sectionKey, summaryLabel } from '@didactic/core/summaries'
import type { Highlight } from '@didactic/core/types'
import { NoteText } from './NoteText'
import { SummaryIcon } from './SummaryIcon'
import list from './MarkList.module.css'
import styles from './SummaryDrawer.module.css'

/**
 * Every summary written against one reading, down the side of the
 * sheet.
 *
 * The same drawer the marks come out of beside a lesson -- the same
 * column, the same ground, the same way in and out -- because it is the
 * same kind of thing: what the reader wrote while reading, pulled out
 * where they are standing. Read-only here. A summary is written and
 * rewritten against the section it says back, and the way there is one
 * press on each row.
 */
export function SummaryDrawer({
  title,
  href,
  summaries,
  leaving,
  onClose,
  onGone,
}: {
  /** What was read. */
  title: string
  /** Where it is read: a section's link is this with its anchor. */
  href: string
  summaries: Highlight[]
  leaving?: boolean
  onClose: () => void
  onGone: () => void
}) {
  const ordered = inSectionOrder(summaries)

  // Escape sends it away, as it does the marks.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // However it goes, it is gone by the end of its own animation; the
  // timer is the backstop for one that never runs.
  useEffect(() => {
    if (!leaving) return
    const timer = setTimeout(onGone, 800)
    return () => clearTimeout(timer)
  }, [leaving, onGone])

  if (typeof document === 'undefined') return null

  return createPortal(
    <aside
      className={leaving ? `${list.list} ${list.leaving}` : list.list}
      aria-label={`Your summaries of ${title}`}
      onAnimationEnd={e => {
        if (leaving && e.target === e.currentTarget) onGone()
      }}
    >
      <div className={list.head}>
        <p className={list.title}>
          Summaries
          <span className={list.tally}>{ordered.length}</span>
        </p>
        <button
          type="button"
          className={list.close}
          onClick={onClose}
          aria-label="Close the summaries"
        >
          ✕
        </button>
      </div>

      <p className={styles.of}>
        <Link href={href} className={styles.ofLink}>
          {title}
        </Link>
      </p>

      {ordered.length === 0 ? (
        <p className={list.empty}>
          Nothing said back yet. Open it and press the sprig beside a heading to
          summarise that section, or write the whole of it in your own words at
          the foot.
        </p>
      ) : (
        <ol className={list.marks}>
          {ordered.map(summary => {
            const section = sectionKey(summary.section)
            return (
              <li key={summary.id} className={`${list.mark} ${styles.row}`}>
                <p className={styles.section}>
                  <span className={styles.sprig} aria-hidden="true">
                    <SummaryIcon filled size={14} />
                  </span>
                  {/* The way back to the section it says back. */}
                  <Link
                    href={section ? `${href}#${slugFor(section)}` : href}
                    className={styles.sectionLink}
                  >
                    {summaryLabel(section)}
                  </Link>
                </p>
                <NoteText markdown={summary.note ?? ''} className={styles.note} />
              </li>
            )
          })}
        </ol>
      )}
    </aside>,
    document.body
  )
}
