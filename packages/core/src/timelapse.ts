/**
 * When each thing on the bed appears, when the bed is played back.
 *
 * Real time is the shape: a week with nothing sown is a pause, a busy
 * afternoon is a flurry. But the whole of a profile has to fit in
 * something a person will watch, and a sowing that makes forty topics in
 * one second would pop them in as a single frame, so two things bend it:
 * the span is scaled to `duration`, and no two births come nearer than a
 * step, which is how a burst is staggered rather than dropped in at once.
 */

export interface Birth {
  id: string
  /** When it was made, in ms since the epoch. */
  at: number
}

export interface Timeline {
  /** Playback ms at which each id appears. */
  at: Map<string, number>
  /** Playback ms of the last birth. */
  end: number
}

/** Fewest and most ms between two births in a burst, unless told. */
const STEP_MIN = 25
const STEP_MAX = 120

export function timeline(
  births: readonly Birth[],
  duration: number,
  steps: { min?: number; max?: number } = {}
): Timeline {
  const sorted = [...births].sort((a, b) => a.at - b.at || a.id.localeCompare(b.id))
  const at = new Map<string, number>()
  if (sorted.length === 0) return { at, end: 0 }

  const span = sorted[sorted.length - 1].at - sorted[0].at
  const scale = span > 0 ? duration / span : 0
  const step = Math.min(steps.max ?? STEP_MAX, Math.max(steps.min ?? STEP_MIN, duration / sorted.length))

  let t = 0
  sorted.forEach((b, i) => {
    t = i === 0 ? 0 : Math.max(t + step, (b.at - sorted[0].at) * scale)
    at.set(b.id, t)
  })
  return { at, end: t }
}

/** `Date.parse`, with the unparseable and the missing counted as unknown. */
export function when(iso: string | null | undefined): number | null {
  const ms = iso ? Date.parse(iso) : NaN
  return Number.isFinite(ms) ? ms : null
}
