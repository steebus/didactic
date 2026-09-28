'use client'

import { useEffect, useRef, useState } from 'react'
import { activityLevel, activityTitle, type ActivityDay } from '@didactic/core/activity'
import styles from './ActivityRule.module.css'

// How far a pointer may travel and still be a press rather than a drag.
const DRAG_SLOP = 4

const MONTH = new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: 'UTC' })

/**
 * The rule under the masthead, with the reader's year hung from it.
 *
 * Shut, it is the mustard rule it always was, with a stem growing up
 * from it for every day something was done: taller for a fuller day,
 * in the plate of the subject most of it went to, rising into the band. It scrolls sideways -- by
 * touch natively, by mouse through a drag -- and opens at today. A
 * press, as opposed to a drag, opens it into the same year as a
 * calendar: a week to a column, a weekday to a row.
 *
 * A day is weighed and coloured in `core/activity`; this only draws.
 */
export function ActivityRule({ days, colours }: { days: ActivityDay[]; colours: Record<string, string> }) {
  const [open, setOpen] = useState(false)
  const scroller = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x: number; left: number; moved: boolean } | null>(null)

  // Today is at the right-hand end; open there, and again on unfolding,
  // since the calendar is a different width from the ticks.
  useEffect(() => {
    const el = scroller.current
    if (el) el.scrollLeft = el.scrollWidth
  }, [open])

  const scores = days.map(d => d.score)
  const levels = days.map(d => activityLevel(d.score, scores))
  const ink = (d: ActivityDay) => (d.subjectId && colours[d.subjectId]) || 'var(--ink-soft)'
  // The first column starts on whatever weekday the year does; Monday is row one.
  const offset = days.length ? (new Date(`${days[0].day}T00:00:00Z`).getUTCDay() + 6) % 7 : 0

  // A label at the first of each month. The year rides on January, on
  // the first month shown and on this one, so whatever slice of the
  // strip is in view, the year is never far off.
  const firsts = days.flatMap((d, i) => (d.day.endsWith('-01') ? [i] : []))
  const months = firsts.map((i, n) => {
    const date = new Date(`${days[i].day}T00:00:00Z`)
    const withYear = date.getUTCMonth() === 0 || n === 0 || n === firsts.length - 1
    return { day: days[i].day, i, label: withYear ? `${MONTH.format(date)} ${date.getUTCFullYear()}` : MONTH.format(date) }
  })

  const toggle = () => setOpen(o => !o)

  return (
    <div className={styles.rule} data-open={open || undefined}>
      <div
        ref={scroller}
        className={styles.scroller}
        role="button"
        tabIndex={0}
        aria-expanded={open}
        aria-label={open ? 'Fold the year away' : 'Open the year of activity'}
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
          <div className={styles.ticks}>
            {days.map((d, i) => {
              const level = levels[i]
              return (
                <span
                  key={d.day}
                  className={styles.tick}
                  data-level={level}
                  style={level ? { background: ink(d) } : undefined}
                  title={level ? activityTitle(d) : undefined}
                />
              )
            })}
          </div>
          <div className={styles.dates}>
            {months.map(m => (
              <span key={m.day} className={styles.date} style={{ '--i': m.i } as React.CSSProperties}>
                {m.label}
              </span>
            ))}
          </div>
        </div>

        <div className={styles.fold}>
          <div
            className={styles.calendar}
            aria-hidden={!open}
            style={{ '--weeks': Math.ceil((days.length + offset) / 7) } as React.CSSProperties}
          >
            <div className={styles.months}>
              {months.map(m => (
                <span
                  key={m.day}
                  className={styles.month}
                  style={{ '--col': Math.floor((m.i + offset) / 7) } as React.CSSProperties}
                >
                  {m.label}
                </span>
              ))}
            </div>
            <div className={styles.grid}>
              {days.map((d, i) => (
                <span
                  key={d.day}
                  className={styles.cell}
                  data-level={levels[i]}
                  style={{
                    ...(i === 0 ? { gridRowStart: offset + 1 } : null),
                    ...(levels[i] ? { '--cell-ink': ink(d) } : null),
                  } as React.CSSProperties}
                  title={activityTitle(d)}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
