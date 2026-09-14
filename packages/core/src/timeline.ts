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

/**
 * How much of a mark is printed before it is opened.
 *
 * Shorter than an entry's clip, because a mark is one sentence and the
 * point of the summary is that a month of them can be read down in one
 * pass. A passage longer than this is a paragraph someone kept, and the
 * timeline shows its opening rather than swallowing the screen with it.
 */
export const MARK_CLIP = 150

/** What a row in the stream is called at its head. */
export const STRAND_LABEL: Record<Strand, string> = {
  entry: 'Entry',
  passage: 'Passage',
  note: 'Note',
}

type Row = Pick<Highlight, 'kind' | 'quote' | 'note'>

/**
 * The one line a row shows before it is opened.
 *
 * Its own words, clipped -- never a description of them. The timeline
 * is a record of what was read and what was thought about it, and a
 * generated précis of someone's own sentence would be the app talking
 * over them. The ellipsis is written into the text rather than drawn
 * with a fade, because a fade over newsprint is a gradient this world
 * does not use.
 *
 * A passage leads with the passage even when there is a note under it:
 * the quote is what was kept, and it is what the reader will recognise
 * the row by a month later.
 */
export function gist(row: Row): string {
  const source = strandOf(row) === 'passage' ? row.quote : row.note
  const text = (source ?? '').trim()
  const clip = row.kind === 'diary' ? ENTRY_CLIP : MARK_CLIP

  if (text.length === 0) return ''
  if (text.length <= clip) return text
  return `${text.slice(0, clip).trimEnd()}…`
}

/**
 * Whether there is anything under the gist worth opening for.
 *
 * A row with nothing more is never given a control that does nothing: a
 * toggle that opens onto the same sentence teaches the reader that the
 * toggles are not worth pressing, which costs more than the tidiness of
 * having one on every row.
 */
export function opens(row: Row): boolean {
  const strand = strandOf(row)
  if (strand === 'entry') return clips(row.note)
  // A note under a passage is the other half of the mark, and the
  // collapsed line leads with the passage -- so there is always
  // something under it.
  if (strand === 'passage') {
    return (row.quote ?? '').trim().length > MARK_CLIP || Boolean(row.note?.trim())
  }
  return (row.note ?? '').trim().length > MARK_CLIP
}

/**
 * What a run of rows holds, in the two words that mean different things.
 *
 * A mark is a sentence and an entry is a page about a week. One total
 * over both hides which, at the head of the sheet and over a day's run
 * alike — and which is the whole reason the two are on one stream.
 */
export function tallyOf(rows: Array<Pick<Highlight, 'kind'>>): string {
  const entries = rows.filter(r => r.kind === 'diary').length
  const marks = rows.length - entries

  return [
    marks > 0 ? `${marks} ${marks === 1 ? 'mark' : 'marks'}` : '',
    entries > 0 ? `${entries} ${entries === 1 ? 'entry' : 'entries'}` : '',
  ].filter(Boolean).join(' · ')
}
