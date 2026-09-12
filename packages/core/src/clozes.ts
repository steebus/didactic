/**
 * Clozes: the one sentence with a word taken out of it.
 *
 * A lesson is read once. What it left behind is the thing worth
 * knowing, and the only honest way to find out whether it is still
 * there is to ask. A cloze is the smallest possible asking: a passage
 * the lesson actually wrote, with the load-bearing words removed.
 *
 * What is stored is the passage verbatim and where the blank falls in
 * it, for the same reason a mark stores its words rather than an offset
 * into the body (`020_highlights.sql`): a lesson body is written on
 * demand and regenerable, so an offset into the prose points at nothing
 * the next time the lesson is asked for. The passage survives, which is
 * also what lets the reader see, in the reading, which sentences are
 * being tended.
 *
 * This module is the shapes and the wording. The scheduling is
 * `./fsrs`; the two are kept apart because the scheduler is fitted
 * arithmetic that should be testable without a cloze anywhere near it.
 */

import type { CardState, Memory, Rating } from './fsrs'
import { AGAIN, EASY, GOOD } from './fsrs'

/**
 * A concept a lesson taught, and the tracker opened against it.
 *
 * Two to four per worked lesson. The concept is the unit the reader
 * thinks in -- "ability is separate from exposure" -- and the clozes
 * under it are two or more different ways of asking whether they still
 * hold it, so a concept is not passed on the strength of having
 * memorised one sentence's phrasing.
 */
export interface ClozeConcept {
  id: string
  lesson_id: string
  topic_id: string | null
  name: string
  /** What the lesson said about it, in a sentence. Shown on the card. */
  gist: string | null
  position: number
  created_at: string
}

/** How a cloze came to exist. The schema's own `created_by_kind`, less
 *  `skeleton`: nothing seeds a cloze, it is read off a lesson or made
 *  by the reader over a passage they chose. */
export type ClozeAuthor = 'ai' | 'user'

/** A cloze row, with its scheduling state on it. */
export interface Cloze {
  id: string
  concept_id: string | null
  lesson_id: string
  topic_id: string | null
  /** The passage as it read in the lesson, blank included in full. */
  text: string
  /** Enough of what came before to tell two identical passages apart. */
  prefix: string | null
  /** The words taken out: `text.slice(blank_start, blank_end)`. */
  blank: string
  blank_start: number
  blank_end: number
  /** A nudge shown on request, never by default. Usually null. */
  hint: string | null
  created_by: ClozeAuthor

  /* --- the scheduler's state, flattened onto the row --- */
  stability: number | null
  difficulty: number | null
  state: CardState
  reps: number
  lapses: number
  due: string
  last_reviewed_at: string | null

  created_at: string
  updated_at: string
}

/** A cloze with enough around it to be answered away from its lesson. */
export interface ClozeCard extends Cloze {
  concept: { id: string; name: string; gist: string | null } | null
  lesson: { id: string; title: string } | null
  topic: { id: string; title: string } | null
}

/** What is waiting, for a tally in a nav and a notice in a corner. */
export interface ClozeCount {
  /** Clozes due now or overdue. The figure the Tend link prints. */
  due: number
  /** Every cloze the reader holds, due or not. */
  total: number
  /** The earliest due instant among those not yet due. Null if none. */
  next: string | null
}

/** Read the scheduler's state off a row. */
export function memoryOf(cloze: Cloze): Memory {
  return {
    stability: cloze.stability,
    difficulty: cloze.difficulty,
    state: cloze.state,
    reps: cloze.reps,
    lapses: cloze.lapses,
    due: cloze.due,
    lastReviewedAt: cloze.last_reviewed_at,
  }
}

/** Write it back, in the column names the table uses. */
export function memoryColumns(memory: Memory) {
  return {
    stability: memory.stability,
    difficulty: memory.difficulty,
    state: memory.state,
    reps: memory.reps,
    lapses: memory.lapses,
    due: memory.due,
    last_reviewed_at: memory.lastReviewedAt,
  }
}

/** Whether this one is wanted now. Overdue counts, which is the point. */
export const isDue = (cloze: Pick<Cloze, 'due'>, now: Date = new Date()) =>
  new Date(cloze.due).getTime() <= now.getTime()

/**
 * The three answers the Tend sheet offers.
 *
 * FSRS is fitted on four rungs and understands all four; a reader
 * standing over a garden fork does not want to weigh *hard* against
 * *good* on a one-line cloze. So the sheet offers the three that mean
 * something different to a person -- it was gone, it was there, it was
 * obvious -- and hands the scheduler 1, 3 and 4. The second rung is
 * still a rung the arithmetic knows; nothing here narrows it.
 */
export const TENDING = [
  {
    rating: AGAIN,
    label: 'Gone',
    note: 'Could not bring it back.',
  },
  {
    rating: GOOD,
    label: 'Got it',
    note: 'Came back with a little work.',
  },
  {
    rating: EASY,
    label: 'Easy',
    note: 'Came back at once.',
  },
] as const satisfies ReadonlyArray<{ rating: Rating; label: string; note: string }>

/** What a blank is drawn as when the card is face up. */
export const BLANK_MARK = '————'

/** The passage in three pieces, so a card can draw the blank itself. */
export interface ClozeFace {
  before: string
  blank: string
  after: string
}

/**
 * Split a cloze at its blank.
 *
 * Defensive about the offsets, because they are numbers in a database
 * and the passage beside them can be edited: an offset that no longer
 * lands inside the text falls back to looking the blank up by its
 * words, and a blank that is not in the text at all gives a face with
 * nothing hidden rather than a card that throws.
 */
export function clozeFace(cloze: Pick<Cloze, 'text' | 'blank' | 'blank_start' | 'blank_end'>): ClozeFace {
  const { text, blank } = cloze
  const sound =
    cloze.blank_start >= 0 &&
    cloze.blank_end <= text.length &&
    cloze.blank_start < cloze.blank_end &&
    text.slice(cloze.blank_start, cloze.blank_end) === blank

  const start = sound ? cloze.blank_start : text.indexOf(blank)
  if (start === -1 || !blank) return { before: text, blank: '', after: '' }

  return {
    before: text.slice(0, start),
    blank: text.slice(start, start + blank.length),
    after: text.slice(start + blank.length),
  }
}

/** The card face as one string, for a title, a list row or a test. */
export function maskCloze(
  cloze: Pick<Cloze, 'text' | 'blank' | 'blank_start' | 'blank_end'>,
  mark: string = BLANK_MARK
): string {
  const { before, blank, after } = clozeFace(cloze)
  return blank ? `${before}${mark}${after}` : before
}

/** What can be wrong with a cloze, said as a sentence or null. */
export function clozeProblem(text: string, blank: string, at?: number): string | null {
  const passage = text.trim()
  if (passage.length < 12) return 'A cloze needs a whole sentence to stand in.'
  if (passage.length > 400) return 'That passage is too long to answer in one go.'
  if (!blank.trim()) return 'Choose the words to take out.'
  if (blank.trim().length > passage.length / 2) {
    return 'That leaves too little of the sentence to go on.'
  }
  const start = at !== undefined && text.slice(at, at + blank.length) === blank
    ? at
    : text.indexOf(blank)
  if (start === -1) return 'Those words are not in the passage.'
  return null
}

/**
 * Where a blank sits in a passage.
 *
 * Used when the reader makes one by hand: they select a sentence and
 * then some words inside it, and this turns the second into offsets
 * into the first. `from` is a hint -- the offset the selection itself
 * reported -- which settles the case of a word that appears twice in
 * the same sentence.
 */
export function locateBlank(text: string, blank: string, from?: number): { start: number; end: number } | null {
  if (!blank) return null
  if (from !== undefined && text.slice(from, from + blank.length) === blank) {
    return { start: from, end: from + blank.length }
  }
  const start = text.indexOf(blank)
  return start === -1 ? null : { start, end: start + blank.length }
}

/**
 * What is waiting, in a sentence.
 *
 * One wording, read by the nav tally's title, the notice in the corner
 * and the head of the Tend sheet, so the three cannot come to disagree
 * about what the same number means.
 */
export function tendPhrase(due: number): string {
  if (due === 0) return 'Nothing is due'
  return `${due} ${due === 1 ? 'cloze is' : 'clozes are'} due`
}

/** How a concept's clozes are holding up, for the head of the sheet. */
export function conceptStanding(clozes: Cloze[], now: Date = new Date()): {
  due: number
  held: number
  fresh: number
} {
  let due = 0
  let held = 0
  let fresh = 0
  for (const cloze of clozes) {
    if (cloze.state === 'new') fresh++
    else if ((cloze.stability ?? 0) >= 21) held++
    if (isDue(cloze, now)) due++
  }
  return { due, held, fresh }
}
