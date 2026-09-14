/**
 * The learning journey, in the order it happened.
 *
 * The Marked sheet used to be a flat list of kept passages. It is now
 * one stream holding two kinds of thing -- passages kept while reading,
 * and diary entries written about a week -- and what makes that
 * readable is the date: a run of things from one day, under the day
 * they happened on, rather than a hundred rows with a timestamp each.
 *
 * Pure, and here rather than in the sheet, because the phone prints the
 * same stream and a date that groups differently on two platforms is
 * two different histories of the same learning.
 */

import type { Highlight } from './types'

/** One day's worth, in the order they were written. */
export interface Day<T> {
  /** `YYYY-MM-DD`, which sorts as a string and is what the key is. */
  date: string
  entries: T[]
}

/**
 * Group by the day each thing happened, newest day first.
 *
 * The rows arrive newest-first from the database and stay that way
 * inside each day: a timeline read downward is a walk backwards, and a
 * day whose items ran the other way would be a small reversal in the
 * middle of a large one.
 *
 * Local days, not UTC. Something written at eleven at night belongs to
 * the day the writer remembers writing it, and a UTC boundary would
 * file a third of one person's evenings under tomorrow.
 */
export function byDay<T extends { created_at: string }>(rows: T[]): Day<T>[] {
  const days: Day<T>[] = []
  let current: Day<T> | null = null

  for (const row of rows) {
    const date = dayOf(row.created_at)
    if (!current || current.date !== date) {
      current = { date, entries: [] }
      days.push(current)
    }
    current.entries.push(row)
  }

  return days
}

/** The local calendar day a timestamp falls on, as `YYYY-MM-DD`. */
export function dayOf(timestamp: string): string {
  const at = new Date(timestamp)
  if (Number.isNaN(at.getTime())) return 'unknown'
  const month = `${at.getMonth() + 1}`.padStart(2, '0')
  const day = `${at.getDate()}`.padStart(2, '0')
  return `${at.getFullYear()}-${month}-${day}`
}

/**
 * How a day is printed at the head of its run.
 *
 * Today and yesterday are named rather than dated: those are the two
 * a reader locates by memory rather than by number, and "14 September"
 * for something written an hour ago reads as history.
 *
 * The year is printed only when it is not the current one. A timeline
 * of one person's learning is mostly this year, and stamping 2026 on
 * every heading is a column of noise that says nothing.
 */
export function dayName(date: string, now: Date = new Date()): string {
  if (date === 'unknown') return 'Undated'

  const [year, month, day] = date.split('-').map(Number)
  if (!year || !month || !day) return 'Undated'

  if (date === dayOf(now.toISOString())) return 'Today'

  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  if (date === dayOf(yesterday.toISOString())) return 'Yesterday'

  const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ]
  const named = `${day} ${MONTHS[month - 1]}`
  return year === now.getFullYear() ? named : `${named} ${year}`
}

/**
 * What one row in the stream is, in a word.
 *
 * Three kinds and not two: a mark with no passage is a note on the
 * lesson as a whole, which is neither a quotation nor a diary entry,
 * and the sheet has always said so in its own words rather than
 * printing an empty rule where a quote would be.
 */
export type Strand = 'entry' | 'passage' | 'note'

export function strandOf(row: Pick<Highlight, 'kind' | 'quote'>): Strand {
  if (row.kind === 'diary') return 'entry'
  return row.quote ? 'passage' : 'note'
}

/**
 * How much of an entry is printed before it is opened.
 *
 * An entry is a page about a week and a mark is a sentence, and left
 * whole in one stream a single long entry pushes a month of marks off
 * the screen. So an entry is clipped to its opening and opened in
 * place.
 *
 * Measured in characters rather than lines because the sheet cannot
 * know what will wrap where, and it is a clip rather than a summary:
 * what is shown is the entry's own first words, not a description of
 * them.
 */
export const ENTRY_CLIP = 240

/** Whether an entry is long enough to be worth opening. */
export function clips(note: string | null): boolean {
  return (note ?? '').length > ENTRY_CLIP
}
