'use client'

import {
  WAVE_BAR,
  WAVE_BARS,
  WAVE_HEIGHT,
  WAVE_LOW,
  WAVE_RADIUS,
  WAVE_SWING_MS,
  WAVE_WIDTH,
} from '@didactic/core/waveform'
import styles from './WaveMark.module.css'

/**
 * Five bars that move while a voice is running, and hold a silhouette
 * when it is not.
 *
 * One component for both places the player needs it: beside the clock
 * on the bar, and in the middle of the disc the bar folds down to,
 * which wore a chevron up until now. Two copies of this would be two
 * marks that drift, and the geometry is in `core/waveform` for the
 * same reason a step further out -- the phone draws these bars too.
 *
 * Every bar is drawn at the box's full height and squashed to where it
 * belongs. Scaling rather than setting `height` and `y`, because a
 * transform is composited and the other two are layout: this runs in
 * the corner of the sheet for twelve minutes at a stretch, and a mark
 * that reflowed five rects sixteen times a second would be the most
 * expensive thing on the page by a wide margin.
 *
 * The motion is one swing out and back on an `alternate`, with each
 * bar handed a *negative* delay so it begins partway through rather
 * than waiting its turn: the row is already in motion on the first
 * frame, which is what stops it reading as five things starting.
 */
export function WaveMark({ playing }: { playing: boolean }) {
  return (
    <svg
      className={styles.wave}
      viewBox={`0 0 ${WAVE_WIDTH} ${WAVE_HEIGHT}`}
      data-playing={playing || undefined}
      // Drawn, never read: everywhere this stands, the control around
      // it already carries the name and the state in words.
      aria-hidden="true"
      focusable="false"
      fill="currentColor"
      style={{
        ['--swing' as string]: `${WAVE_SWING_MS}ms`,
        ['--low' as string]: WAVE_LOW,
      }}
    >
      {WAVE_BARS.map(bar => (
        <rect
          key={bar.x}
          className={styles.bar}
          x={bar.x}
          y={0}
          width={WAVE_BAR}
          height={WAVE_HEIGHT}
          rx={WAVE_RADIUS}
          style={{
            ['--rest' as string]: bar.rest,
            ['--delay' as string]: bar.delay,
          }}
        />
      ))}
    </svg>
  )
}
