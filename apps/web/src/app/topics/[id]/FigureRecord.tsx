'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { didactic } from '@didactic/api'
import { impactLabel, type FigureEvent } from '@didactic/core/figureRecord'
import {
  contributionLine,
  COST_LINE,
  effortFigure,
  effortSentence,
  sayHours,
  spanLine,
  startLine,
  TARGET_LABEL,
  TARGET_LEVELS,
  targetLine,
  type TopicEffort,
} from '@didactic/core/grain'
import styles from './FigureRecord.module.css'

const api = didactic()

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
  effort,
  topicId,
}: {
  viability: { figure: number; vague: boolean }
  condition: string
  lastTended: string | null
  record: FigureEvent[]
  /** How far the reader is from their target (`core/grain`). Absent on
   *  a topic still waiting in the queue. */
  effort?: TopicEffort | null
  topicId?: string
}) {
  /** Which account is unrolled: the figure's record, or the effort. */
  const [open, setOpen] = useState<null | 'record' | 'effort'>(null)
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
    if (open === null) return
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [open, measure])

  useEffect(() => {
    if (open === null) return
    const shut = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setOpen(null)
      openerRef.current?.focus()
    }
    // A press anywhere but the slip or the figures rolls it up. The
    // figures handle their own press, so a second press on one closes
    // rather than closing and reopening.
    const away = (e: PointerEvent) => {
      const target = e.target as Node
      if (slipRef.current?.contains(target) || figuresRef.current?.contains(target)) return
      setOpen(null)
    }
    document.addEventListener('keydown', shut)
    document.addEventListener('pointerdown', away)
    return () => {
      document.removeEventListener('keydown', shut)
      document.removeEventListener('pointerdown', away)
    }
  }, [open])

  const press = (which: 'record' | 'effort', e: React.MouseEvent<HTMLButtonElement>) => {
    openerRef.current = e.currentTarget
    setOpen(was => (was === which ? null : which))
  }

  return (
    <>
      <div className={styles.figures} ref={figuresRef}>
        <button
          type="button"
          className={styles.figure}
          onClick={e => press('record', e)}
          aria-expanded={open === 'record'}
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
          onClick={e => press('record', e)}
          aria-expanded={open === 'record'}
          aria-controls="figure-record"
        >
          <span className={styles.figureLabel}>Condition</span>
          <span className={styles.figureValue}>{condition}</span>
        </button>
        {effort && (
          <button
            type="button"
            className={styles.figure}
            onClick={e => press('effort', e)}
            aria-expanded={open === 'effort'}
            aria-controls="figure-record"
          >
            <span className={styles.figureLabel}>To target</span>
            <span className={`${styles.figureValue} ${effort.about ? styles.guess : ''}`}>
              {effort.about && effort.lessons > 0 && <span className={styles.about}>about </span>}
              {effortFigure(effort)}
            </span>
          </button>
        )}
      </div>

      {open && place && createPortal(
        <div
          id="figure-record"
          ref={slipRef}
          className={styles.slip}
          role="region"
          aria-label={open === 'effort' ? 'What it would take' : 'Why this figure'}
          style={{ top: place.top, left: place.left, width: place.width }}
        >
          {open === 'effort' && effort ? (
            <EffortAccount effort={effort} topicId={topicId} />
          ) : (
          <>
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
          </>
          )}
        </div>,
        document.body
      )}
    </>
  )
}

/**
 * What it would take to get this topic where the reader wants it, and
 * why the app thinks so: the target and where it came from, where the
 * reader starts, the topic's own size term by term, and its varieties.
 * The target is set here, because this is where its effect is read.
 */
function EffortAccount({ effort, topicId }: { effort: TopicEffort; topicId?: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const span = spanLine(effort)
  const own = effort.target.from === 'topic' ? effort.target.level : null

  async function aim(target: number | null) {
    if (!topicId) return
    setBusy(true)
    setProblem(null)
    const { ok, error } = await api.topics.patch(topicId, { target_depth: target })
    setBusy(false)
    if (!ok) {
      setProblem(error ?? 'Could not set that.')
      return
    }
    router.refresh()
  }

  return (
    <>
      <h2 className={styles.title}>What it would take</h2>
      <p className={styles.standing}>{effortSentence(effort)}</p>

      <ul className={styles.terms}>
        <li>{targetLine(effort.target)}</li>
        <li>{startLine(effort, effort.target.subject?.title)}</li>
        <li>
          Its own size: {effort.about ? 'about ' : ''}{sayHours(effort.inherent.hours)} to take it from nothing to 3.
          <ul className={styles.contributions}>
            {effort.inherent.contributions.map(c => (
              <li key={c.signal}>{contributionLine(c)}</li>
            ))}
          </ul>
        </li>
        {span && <li>{span}</li>}
      </ul>

      {topicId && (
        <div className={styles.aim}>
          <span className={styles.aimLabel}>Take it to</span>
          <div className={styles.levels} role="group" aria-label="Target depth for this topic">
            {TARGET_LEVELS.map(level => (
              <button
                key={level}
                type="button"
                className={styles.level}
                aria-pressed={own === level}
                disabled={busy}
                onClick={() => aim(level)}
              >
                {level} · {TARGET_LABEL[level]}
              </button>
            ))}
            {own !== null && (
              <button type="button" className={styles.level} disabled={busy} onClick={() => aim(null)}>
                Follow its subjects
              </button>
            )}
          </div>
          {problem && <p className={styles.problem}>{problem}</p>}
        </div>
      )}

      <p className={styles.key}>{COST_LINE}</p>
      {effort.about && (
        <p className={styles.caveat}>
          Nothing has checked this yet: it is estimated from how deep the topic&rsquo;s prerequisites run and how much
          has been written about it, and could be half or twice as much.
        </p>
      )}
    </>
  )
}
