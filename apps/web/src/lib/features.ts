/**
 * Features that can be taken back out without a code change.
 *
 * Each is on or off by its default here, and an environment variable
 * overrides it on the deploy: `FEATURE_<NAME>=off` (or `0`, `false`)
 * turns one off, `on` (or `1`, `true`) turns one on. Read at call time
 * rather than at import, so flipping the variable on Vercel and
 * redeploying is the whole of pulling one -- and so a test can set it.
 *
 * Server-side only. What a flag changes is how a lesson is written, and
 * a lesson is written once, on the web; the phone reads what it made.
 */

import { canDraw } from '@/lib/llm/drawing'

const DEFAULTS = {
  /**
   * Lesson pictures drawn for the lesson, by OpenAI's image model, as a
   * hand-inked natural-history plate in the catalogue's own palette --
   * where Commons has nothing that shows it and no block draws it
   * better. See `lib/drawings.ts`. Needs the AI Gateway or
   * `OPENAI_API_KEY` as well: on with neither is off.
   */
  drawnPictures: true,
} as const

export type Feature = keyof typeof DEFAULTS

const ENV: Record<Feature, string> = {
  drawnPictures: 'FEATURE_DRAWN_PICTURES',
}

export function featureOn(name: Feature): boolean {
  const raw = process.env[ENV[name]]?.trim().toLowerCase()
  if (raw && ['off', '0', 'false', 'no'].includes(raw)) return false
  if (raw && ['on', '1', 'true', 'yes'].includes(raw)) return true
  return DEFAULTS[name]
}

/** Drawing is on only where it can actually happen: the gateway, or an
 *  OpenAI key of our own (`llm/drawing.canDraw`). */
export function drawingOn(): boolean {
  return featureOn('drawnPictures') && canDraw()
}
