/**
 * How large a reader has the reading set, on this device.
 *
 * A lesson's or a resource's body -- its words, its pictures and its
 * blocks together -- is drawn at one of a few fixed sizes, stepped up
 * and down from the desk. The rest of the sheet, the banners and the
 * furniture, stay as they are: this is the size of the page being read,
 * not of the catalogue around it.
 *
 * Fixed steps rather than a free figure, so two presses of plus and two
 * of minus come back to where they started, and so the smallest and
 * largest are decisions rather than wherever a finger stopped. Below
 * 0.85 the body falls under the size the catalogue sets its labels at
 * and stops reading as the body; above 1.4 the measure holds too few
 * words a line to read at -- on a phone, four or five.
 *
 * Kept on the device, not the account: the right size for a phone held
 * at arm's length is the wrong one for a desk monitor.
 */

/** The sizes the reading can be set at, smallest first. 1 is as set. */
export const READING_SIZES = [0.85, 0.925, 1, 1.1, 1.2, 1.3, 1.4] as const

/** Where the size is kept on the device. */
export const READING_SIZE_KEY = 'didactic-reading-size'

/** The step nearest a kept or unknown figure; 1 for anything unreadable. */
export function readingSize(kept: unknown): number {
  // `Number('')` is nought, which would snap to the smallest step.
  const n = typeof kept === 'string' ? (kept.trim() ? Number(kept) : NaN) : kept
  if (typeof n !== 'number' || !Number.isFinite(n)) return 1
  return READING_SIZES.reduce((best, size) =>
    Math.abs(size - n) < Math.abs(best - n) ? size : best
  )
}

/** One step larger (`1`) or smaller (`-1`), held at the ends. */
export function stepReadingSize(size: number, way: 1 | -1): number {
  const at = READING_SIZES.indexOf(readingSize(size) as (typeof READING_SIZES)[number])
  const next = Math.min(READING_SIZES.length - 1, Math.max(0, at + way))
  return READING_SIZES[next]
}

/** Whether a step that way is left to take. */
export function canStepReadingSize(size: number, way: 1 | -1): boolean {
  return stepReadingSize(size, way) !== readingSize(size)
}
