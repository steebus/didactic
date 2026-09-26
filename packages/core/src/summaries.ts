/**
 * Saying back what was read, in the reader's own words.
 *
 * A summary is a mark of kind `summary` (053): no passage, a note, and
 * which part of the reading it says back -- a section, named by its
 * heading, or the whole thing when `section` is null. The reading is
 * a lesson or a resource read in the app; the rules here do not care
 * which, and neither front end should have to decide them twice.
 *
 * One summary per section. Writing another replaces the last: the
 * point is the reader's current account of the section, not a history
 * of drafts, and a list with three summaries of the same heading would
 * be a list nobody could read down.
 */

import type { ExposureDepth, Highlight } from './types'

/** Long enough for a real paragraph about a long section; short enough
 *  that pasting the section itself back in is refused. */
export const SUMMARY_LIMIT = 4000

/** Below this a summary is a word, not an account of anything. */
export const SUMMARY_FLOOR = 3

/** What the whole-reading summary is called wherever it is listed. */
export const WHOLE = 'The whole thing'

/** The fields a summary is matched and ordered by. */
export type SummaryLike = Pick<Highlight, 'id' | 'note' | 'created_at'> & {
  section?: string | null
  section_at?: number | null
}

/**
 * Why a summary cannot be kept, in a sentence, or null when it can.
 *
 * Shared so the phone refuses exactly what the web refuses, and the
 * route refuses both: a summary one client accepts and the server
 * rejects is a draft lost on the way.
 */
export function summaryProblem(text: string): string | null {
  const said = text.trim()
  if (!said) return 'Write something first — even one sentence is worth keeping.'
  if (said.length < SUMMARY_FLOOR) return 'That is too short to be a summary.'
  if (said.length > SUMMARY_LIMIT) {
    return `Summaries are kept under ${SUMMARY_LIMIT.toLocaleString('en-GB')} characters — say it more briefly.`
  }
  return null
}

/**
 * The section a heading names, as it is stored.
 *
 * Trimmed and with its runs of space collapsed, so a heading read off
 * the markdown and the same heading read off the page are one key. An
 * empty heading is no section at all -- the whole-reading summary --
 * rather than a section called nothing.
 */
export function sectionKey(heading: string | null | undefined): string | null {
  const key = (heading ?? '').replace(/\s+/g, ' ').trim()
  return key || null
}

/** The summary standing against one section, or against the whole
 *  reading when `section` is null. */
export function summaryOf<T extends SummaryLike>(
  summaries: T[],
  section: string | null
): T | undefined {
  const key = sectionKey(section)
  return summaries.find(s => sectionKey(s.section) === key)
}

/**
 * Summaries in the order the reading runs.
 *
 * Sections by where their heading sits; a section whose position was
 * never recorded after the ones that were, by when it was written; and
 * the whole-reading summary last, because that is where it is written
 * -- at the end, once there is a whole to say back.
 */
export function inSectionOrder<T extends SummaryLike>(summaries: T[]): T[] {
  const whole = summaries.filter(s => sectionKey(s.section) === null)
  const sections = summaries.filter(s => sectionKey(s.section) !== null)

  // A position never recorded sorts after every one that was.
  const at = (s: T) =>
    typeof s.section_at === 'number' ? s.section_at : Number.MAX_SAFE_INTEGER
  sections.sort((a, b) => at(a) - at(b) || a.created_at.localeCompare(b.created_at))

  return [...sections, ...whole]
}

/** What a summary is of, in the words a list prints above it. */
export function summaryLabel(section: string | null | undefined): string {
  return sectionKey(section) ?? WHOLE
}

/**
 * How much of a reading has been said back, as a line.
 *
 * Only sections that are still headings in it count toward the first
 * figure: a summary of a section the lesson no longer has -- it was
 * written again -- is kept, but it is not progress through this text.
 */
export function summaryTally(
  summaries: SummaryLike[],
  headings: string[]
): { said: number; of: number; whole: boolean } {
  const keys = new Set(headings.map(sectionKey).filter((k): k is string => k !== null))
  const said = new Set(
    summaries
      .map(s => sectionKey(s.section))
      .filter((k): k is string => k !== null && keys.has(k))
  )
  return {
    said: said.size,
    of: keys.size,
    whole: summaries.some(s => sectionKey(s.section) === null),
  }
}

/**
 * The opening of a summary, for a line under a title.
 *
 * The reader's own first words, clipped at a word -- never a précis of
 * them, for the reason `timeline.gist` gives.
 */
export function summaryGist(note: string | null | undefined, clip = 180): string {
  const text = (note ?? '').replace(/\s+/g, ' ').trim()
  if (text.length <= clip) return text
  const cut = text.slice(0, clip)
  const space = cut.lastIndexOf(' ')
  return `${(space > clip * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`
}

/**
 * What a summary is worth to the map.
 *
 * The whole of a reading, said back in the reader's own words, counts
 * as much as working with it: `applied`, the one depth that lifts a
 * topic past the consumption ceiling. Writing an account of a thing
 * that someone who has not read it could follow is doing something
 * with it, not only having read it -- which is exactly the distinction
 * the ceiling exists to draw.
 *
 * A section said back is a light mark, as a note is. Each one is real,
 * but a lesson with twelve headings would otherwise earn twelve times
 * what working through it earns, and the figure would stop meaning
 * anything. The sections are how a reader gets to a whole they can say
 * back; the whole is what is rewarded.
 */
export function summaryDepth(section: string | null | undefined): ExposureDepth {
  return sectionKey(section) === null ? 'applied' : 'marked'
}

/** Said under the field at the foot, so the reward is not a secret. */
export const WHOLE_SUMMARY_NOTE =
  'Saying the whole of it back counts as much as working with it.'
