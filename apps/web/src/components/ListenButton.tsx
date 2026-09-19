'use client'

import {
  listenLabel,
  listenOffer,
  voicingProgress,
  LISTEN_NOTE,
  type VoicingStanding,
} from '@didactic/core/voicing'
import styles from './ListenButton.module.css'

/**
 * Play a lesson, and say how much of it there is to play.
 *
 * One control doing three jobs, because they are the same question
 * asked at three moments: can I hear this, is it coming, how much of it
 * is here yet. A lesson takes minutes to voice and the reader who
 * pressed it is standing in front of a list of sixteen, so a control
 * that only said "queued" would leave them refreshing to find out.
 *
 * What it is offering at any moment is decided in `core/voicing` rather
 * than here, so the phone's route can draw the same circle from the
 * same rule. This file is the drawing and nothing else.
 *
 * The ring is the generation, not the playback. Playback is the bar at
 * the foot of the sheet, which is the same everywhere and is where
 * position belongs; this circle answers "is it made yet" and stops
 * changing the moment it is full.
 *
 * The states have to be told apart across a room, because the whole
 * point is reading a route of sixteen at a glance:
 *
 *   make     a broken rim, faint -- an outline of a thing, not a thing
 *   waiting  a quarter of the rim in mustard, turning
 *   making   the rim filling in green, clockwise from noon
 *   play     the rim closed, in green, at full strength
 *   pause    the same closed ring, with the pause bars in it
 *   again    the rim closed in terracotta
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
  standing,
  playing,
  onPress,
  title,
}: {
  /** Where this lesson stands as a recording. Absent for a lesson
   *  nobody has asked about yet, which reads as no recording. */
  standing: VoicingStanding | undefined
  /** Whether this lesson is the one playing right now. */
  playing: boolean
  onPress: () => void
  /** The lesson's name, for the label a screen reader reads. */
  title: string
}) {
  const offer = listenOffer(standing, playing)
  const made = voicingProgress(standing)
  const label = listenLabel(offer, title, standing)

  // Still being made: either of the two states where the recording is
  // coming but is not all here.
  const underway = offer === 'making' || offer === 'waiting'
  // The arc is drawn where there is a figure worth drawing. Once the
  // ring is closed -- ready, playing, failed -- the rim carries the
  // state in its own colour, and a second full circle over it would
  // only fight with it.
  const arc = underway && made !== null && made > 0

  return (
    <button
      type="button"
      className={styles.listen}
      data-offer={offer}
      onClick={onPress}
      aria-label={label}
      title={`${label}\n${LISTEN_NOTE[offer]}`}
    >
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden="true">
        {/* The rim: the circle the control always has. Whether it is
            drawn broken or whole is the first thing about it that can
            be read, and it is the one that matters -- a broken rim is
            an offer, a closed one is a recording. */}
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
            goes. */}
        {arc && (
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
        {/* Underway, with nothing to draw yet: either nothing has been
            said, or the worker has not counted the pieces, so there is
            no share to fill. The ring turns rather than sitting empty,
            because "waiting" and "broken" look the same standing
            still. */}
        {underway && !arc && (
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
        ) : offer === 'again' ? (
          // A failure is not an offer to play: pressing it asks for the
          // reading again, and the mark says so rather than leaving a
          // play triangle that would play nothing.
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor">
            <path
              d="M8.4 5a3.4 3.4 0 1 1-1-2.4"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
            <path d="M8.6 0.9 V3.2 H6.3" strokeWidth="1.6" strokeLinejoin="round" />
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
