'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { impactLabel, type FigureEvent } from '@didactic/core/figureRecord'
import styles from './FigureRecord.module.css'

const DAY = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' })
const LONG = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

/**
 * The band's two figures, and the account behind them.
 *
 * The account used to be a block in the margin, which put the answer to
 * "why is this 45" a column and a screen away from the 45. It is now
 * where the question is asked: press either figure and the record
 * unrolls under the band.
 *
 * Not a modal, because this world has none (DESIGN.md, the composer).
 * Nothing is dimmed or trapped; Escape, a press elsewhere, or the same
 * figure again rolls it back up.
 */
export function FigureRecord({
  viability,
  condition,
  lastTended,
  record,
}: {
  viability: { figure: number; vague: boolean }
  condition: string
  lastTended: string | null
  record: FigureEvent[]
}) {
  const [open, setOpen] = useState(false)
  const [place, setPlace] = useState<{ top: number; left: number; width: number } | null>(null)
  const figuresRef = useRef<HTMLDivElement>(null)
  const slipRef = useRef<HTMLDivElement>(null)
  const openerRef = useRef<HTMLButtonElement | null>(null)

  /**
   * Under the band, starting at the figures, trimmed at the sheet's own
   * edges. Measured, as the composer's is: the band's height is its
   * title's, and changes with the width.
   */
  const measure = useCallback(() => {
    const band = document.querySelector('main > header')
    const sheet = document.querySelector('main')
    const figures = figuresRef.current
    if (!band || !sheet || !figures) return

    const gutter = 16
    const sheetBox = sheet.getBoundingClientRect()
    const width = Math.min(34 * 16, sheetBox.width - gutter * 2)
    const furthest = sheetBox.right - gutter - width
    const left = Math.max(sheetBox.left + gutter, Math.min(figures.getBoundingClientRect().left, furthest))

    // Below the band's mustard rule rather than over it: the rule is the
    // band's, and a slip laid across it cuts the band off from the sheet.
    const rule = band.nextElementSibling
    const ruleBox = rule?.getBoundingClientRect()
    const foot = ruleBox && ruleBox.height > 0 && ruleBox.height < 12
      ? ruleBox.bottom
      : band.getBoundingClientRect().bottom

    setPlace({
      top: foot + window.scrollY,
      left: left + window.scrollX,
      width,
    })
  }, [])

  useEffect(() => {
    if (!open) return
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [open, measure])

  useEffect(() => {
    if (!open) return
    const shut = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setOpen(false)
      openerRef.current?.focus()
    }
    // A press anywhere but the slip or the figures rolls it up. The
    // figures handle their own press, so a second press on one closes
    // rather than closing and reopening.
    const away = (e: PointerEvent) => {
      const target = e.target as Node
      if (slipRef.current?.contains(target) || figuresRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('keydown', shut)
    document.addEventListener('pointerdown', away)
    return () => {
      document.removeEventListener('keydown', shut)
      document.removeEventListener('pointerdown', away)
    }
  }, [open])

  const press = (e: React.MouseEvent<HTMLButtonElement>) => {
    openerRef.current = e.currentTarget
    setOpen(was => !was)
  }

  return (
    <>
      <div className={styles.figures} ref={figuresRef}>
        <button
          type="button"
          className={styles.figure}
          onClick={press}
          aria-expanded={open}
          aria-controls="figure-record"
        >
          <span className={styles.figureLabel}>Viability</span>
          <span className={styles.figureValue}>
            {viability.vague && <span className={styles.about}>about </span>}
            {viability.figure}
          </span>
        </button>
        <button
          type="button"
          className={styles.figure}
          onClick={press}
          aria-expanded={open}
          aria-controls="figure-record"
        >
          <span className={styles.figureLabel}>Condition</span>
          <span className={styles.figureValue}>{condition}</span>
        </button>
      </div>

      {open && place && createPortal(
        <div
          id="figure-record"
          ref={slipRef}
          className={styles.slip}
          role="region"
          aria-label="Why this figure"
          style={{ top: place.top, left: place.left, width: place.width }}
        >
          <h2 className={styles.title}>Why this figure</h2>
          <p className={styles.standing}>
            Viability {viability.vague ? 'about ' : ''}{viability.figure}
            {' · '}
            {condition}, {lastTended ? `last tended ${LONG.format(new Date(lastTended))}` : 'never tended'}.
          </p>

          {record.length === 0 ? (
            <p className={styles.empty}>
              Nothing recorded. The figure is the starting floor, not a measurement.
            </p>
          ) : (
            <>
              <ul className={styles.record}>
                {record.map(event => {
                  const label = impactLabel(event)
                  const tone =
                    event.kind === 'entry' || (event.delta === 0 && event.sureness !== 'held')
                      ? styles.impactNone
                      : event.sureness === 'held'
                        ? styles.impactHeld
                        : styles.impactUp
                  return (
                    <li key={event.id} className={styles.row}>
                      <span className={styles.reason}>{event.reason}</span>
                      <span className={`${styles.impact} ${tone}`}>{label}</span>
                      <span className={styles.date}>{DAY.format(new Date(event.created_at))}</span>
                    </li>
                  )
                })}
              </ul>
              <p className={styles.key}>
                Each figure is how many points of viability that event moved. The
                same kind of work is worth less the more of it there already is.
              </p>
            </>
          )}

          {viability.vague && (
            <p className={styles.caveat}>Not much to go on yet — this figure is a guess.</p>
          )}
        </div>,
        document.body
      )}
    </>
  )
}
