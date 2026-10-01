'use client'

import { useLayoutEffect, useRef, useState } from 'react'
import { activityLevel, activityTitle, calendarLayout, type ActivityDay } from '@didactic/core/activity'
import styles from './ActivityRule.module.css'

// How far a pointer may travel and still be a press rather than a drag.
const DRAG_SLOP = 4

/**
 * The rule under the masthead, with the reader's year grown up out of it.
 *
 * Shut, it is the mustard rule it always was, with a stem for every day
 * something was done: taller for a fuller day, in the plate of the
 * subject most of it went to, rising into the band. It scrolls sideways
 * -- by touch natively, by mouse through a drag -- and opens at today. A
 * press, as opposed to a drag, opens it into the same year as a
 * calendar: a weekday to a row, a week to a column, a month to a block.
 *
 * The stems come up in a wave, left to right, whenever the strip is
 * shown shut; the calendar's cells cascade in the same direction when it
 * opens, and it folds away where it stands before the stems return. Both waves start at the left edge of what is in view rather
 * than at the start of the year, so on a phone, scrolled to today, they
 * are not spent on days off-screen.
 *
 * A day is weighed, coloured and placed in `core/activity`; this draws.
 */
export function ActivityRule({
  days,
  colours = {},
  stemInk,
  cellInk,
  onPlayhead,
  still = false,
}: {
  days: ActivityDay[]
  /** Subject id to plate, for a strip that spans subjects. */
  colours?: Record<string, string>
  /** One ink for every stem and cell, for a strip inside one subject:
   *  stems in the band's own lettering, since on a band in the subject's
   *  plate a stem in that plate would vanish, and cells in the plate. */
  stemInk?: string
  cellInk?: string
  /** Hands back the playhead's element, for a caller that moves it
   *  every frame without rendering: it sits at `left` px along the
   *  stems, one `--pitch` a day, and is invisible until shown. */
  onPlayhead?: (el: HTMLSpanElement | null) => void
  /** A strip that only shows: it does not open into the calendar. */
  still?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [closing, setClosing] = useState(false)
  // Where in view each wave starts: a day index shut, a column open.
  // Null until measured, and nothing moves until it is.
  const [start, setStart] = useState<number | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x: number; left: number; moved: boolean } | null>(null)

  // Today is at the right-hand end: land there, then find what is first
  // in view, before paint so the wave never starts from the wrong place.
  useLayoutEffect(() => {
    const el = scroller.current
    if (!el) return
    el.scrollLeft = el.scrollWidth
    const unit = el.querySelector<HTMLElement>(open ? `.${styles.cell}` : `.${styles.tick}`)
    const pitch = unit ? unit.offsetWidth + parseFloat(getComputedStyle(unit.parentElement!).columnGap || '0') : 1
    setStart(Math.max(0, Math.floor(el.scrollLeft / pitch) - 1))
  }, [open])

  const scores = days.map(d => d.score)
  const levels = days.map(d => activityLevel(d.score, scores))
  const layout = calendarLayout(days)
  const plateOf = (d: ActivityDay) => (d.subjectId && colours[d.subjectId]) || 'var(--ink-soft)'
  const stem = (d: ActivityDay) => stemInk ?? plateOf(d)
  const ink = (d: ActivityDay) => cellInk ?? plateOf(d)

  const shut = () => {
    setClosing(false)
    setStart(null)
    setOpen(false)
  }
  const toggle = () => {
    if (closing || still) return
    if (!open) {
      setStart(null)
      setOpen(true)
    } else {
      // Fold first, and shut once the fold has had its time. A timer
      // rather than `transitionend`, which never arrives in a background
      // tab or under reduced motion and would leave the strip stuck.
      const fold = scroller.current?.querySelector<HTMLElement>(`.${styles.fold}`)
      const ms = fold ? parseFloat(getComputedStyle(fold).transitionDuration) * 1000 : 0
      setClosing(true)
      setTimeout(shut, ms)
    }
  }

  return (
    <div
      className={styles.rule}
      data-open={open || undefined}
      data-closing={closing || undefined}
      data-ready={start !== null || undefined}
      data-still={still || undefined}
      style={{ '--start': start ?? 0, '--cols': layout.cols } as React.CSSProperties}
    >
      <div
        ref={scroller}
        className={styles.scroller}
        data-scroller
        role={still ? undefined : 'button'}
        tabIndex={still ? undefined : 0}
        aria-expanded={still ? undefined : open}
        aria-label={still ? undefined : open ? 'Fold the year away' : 'Open the year of activity'}
        onPointerDown={e => {
          if (e.pointerType !== 'mouse' || e.button !== 0) return
          drag.current = { x: e.clientX, left: e.currentTarget.scrollLeft, moved: false }
        }}
        onPointerMove={e => {
          const d = drag.current
          if (!d) return
          const dx = e.clientX - d.x
          if (!d.moved && Math.abs(dx) > DRAG_SLOP) {
            d.moved = true
            e.currentTarget.setPointerCapture(e.pointerId)
          }
          if (d.moved) e.currentTarget.scrollLeft = d.left - dx
        }}
        onPointerUp={() => {
          // Left set until the click that follows has read it.
          setTimeout(() => (drag.current = null))
        }}
        onClick={() => {
          if (!drag.current?.moved) toggle()
        }}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            toggle()
          }
        }}
      >
        <div className={styles.track} aria-hidden>
          {onPlayhead && <span ref={onPlayhead} className={styles.playhead} />}
          <div className={styles.ticks}>
            {days.map((d, i) => (
              <span
                key={d.day}
                className={styles.tick}
                data-level={levels[i]}
                style={{ '--i': i, ...(levels[i] ? { background: stem(d) } : null) } as React.CSSProperties}
                title={levels[i] ? activityTitle(d) : undefined}
              />
            ))}
          </div>
          <div className={styles.dates}>
            {layout.months.map(m => (
              <span key={m.day} className={styles.date} style={{ '--i': m.i } as React.CSSProperties}>
                {m.label}
              </span>
            ))}
          </div>
        </div>

        <div className={styles.fold}>
          <div className={styles.calendar} aria-hidden={!open}>
            <div className={styles.months}>
              {layout.months.map(m => (
                <span key={m.day} className={styles.month} style={{ '--col': m.col } as React.CSSProperties}>
                  {m.label}
                </span>
              ))}
            </div>
            <div className={styles.grid}>
              {days.map((d, i) => {
                const { col, row } = layout.cells[i]
                return (
                  <span
                    key={d.day}
                    className={styles.cell}
                    data-level={levels[i]}
                    style={{
                      gridColumn: col,
                      gridRow: row,
                      '--col': col,
                      '--row': row,
                      ...(levels[i] ? { '--cell-ink': ink(d) } : null),
                    } as React.CSSProperties}
                    title={activityTitle(d)}
                  />
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
