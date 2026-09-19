'use client'

import styles from './ListenButton.module.css'

/**
 * Play a lesson, and say how much of it there is to play.
 *
 * One control doing two jobs, because they are the same question asked
 * a moment apart: can I hear this, and how much of it can I hear yet.
 * A lesson takes minutes to voice and the reader who pressed it is
 * standing in front of a list of sixteen, so a control that only said
 * "queued" would leave them refreshing to find out.
 *
 * The ring is the generation, not the playback. Playback is the bar at
 * the foot of the sheet, which is the same everywhere and is where
 * position belongs; this circle answers "is it made yet" and stops
 * being interesting the moment it is full.
 *
 * Drawn as an SVG ring rather than a conic gradient so it has one
 * appearance in every browser and so the stroke can be the sheet's own
 * ink at the sheet's own width.
 */

/** The circle's geometry. Small enough to sit against a title. */
const SIZE = 22
const STROKE = 2
const R = (SIZE - STROKE) / 2
const CIRCUMFERENCE = 2 * Math.PI * R

export function ListenButton({
  state,
  done,
  total,
  playing,
  onPress,
  title,
}: {
  state: 'none' | 'queued' | 'voicing' | 'ready' | 'failed'
  /** Pieces made so far. */
  done: number
  /** Pieces there will be. Null before the worker has been told. */
  total: number | null
  /** Whether this lesson is the one playing right now. */
  playing: boolean
  onPress: () => void
  /** The lesson's name, for the label a screen reader reads. */
  title: string
}) {
  const made = total ? Math.min(1, done / total) : 0
  const working = state === 'queued' || state === 'voicing'

  const label = playing
    ? `Pause ${title}`
    : state === 'ready'
      ? `Listen to ${title}`
      : working
        ? `${title} is being read aloud${total ? `, ${done} of ${total} pieces` : ''}`
        : state === 'failed'
          ? `Try reading ${title} aloud again`
          : `Read ${title} aloud`

  return (
    <button
      type="button"
      className={styles.listen}
      data-state={state}
      data-playing={playing || undefined}
      onClick={onPress}
      aria-label={label}
      title={label}
    >
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden="true">
        {/* The rim: the circle the control always has. */}
        <circle
          className={styles.rim}
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          fill="none"
          strokeWidth={STROKE}
        />
        {/* What has been made of it. Starts at twelve o'clock and goes
            round clockwise, which is the direction anything filling
            goes. Hidden until there is something to say, so a lesson
            nobody has asked for is a plain circle. */}
        {working && total !== null && (
          <circle
            className={styles.made}
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            fill="none"
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={CIRCUMFERENCE * (1 - made)}
            transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
          />
        )}
        {/* Queued, with nothing made and nothing known: the ring turns
            rather than sitting empty, because "waiting" and "broken"
            look the same standing still. */}
        {working && total === null && (
          <circle
            className={styles.waiting}
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            fill="none"
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={`${CIRCUMFERENCE * 0.25} ${CIRCUMFERENCE}`}
          />
        )}
      </svg>

      {/* The glyph in the middle. Drawn rather than typed so it sits on
          the centre of the circle at any size, which a character in a
          font does not. */}
      <span className={styles.glyph} aria-hidden="true">
        {playing ? (
          <svg width="8" height="9" viewBox="0 0 8 9">
            <rect x="0" y="0" width="2.5" height="9" rx="0.5" />
            <rect x="5.5" y="0" width="2.5" height="9" rx="0.5" />
          </svg>
        ) : (
          <svg width="8" height="9" viewBox="0 0 8 9">
            {/* A triangle nudged right by a hair: an optically centred
                play mark sits off its own bounding box. */}
            <path d="M0.8 0.4 L7.6 4.5 L0.8 8.6 Z" />
          </svg>
        )}
      </span>
    </button>
  )
}
