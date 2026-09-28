/**
 * A year of the reader's activity, one day at a time.
 *
 * The database counts what happened on each day, per subject and kind
 * (`activity_days`, 064); this weighs those counts, picks the subject a
 * day is coloured by, and says how full a day was against the reader's
 * own. Here rather than in the sheet because the phone draws the same
 * strip, and a day that weighs differently on two platforms is two
 * records of one year.
 */

import { ACTIVITY } from './config'

export type ActivityKind = keyof typeof ACTIVITY.WEIGHT

/** One row of `activity_days`: how many of a kind, on a day, in a subject. */
export interface ActivityCount {
  /** `YYYY-MM-DD`, already cut in `ACTIVITY.TZ`. */
  day: string
  /** Null for work on a topic filed nowhere. */
  subjectId: string | null
  kind: ActivityKind
  n: number
}

export interface ActivityDay {
  day: string
  score: number
  /** The subject with the most weighted work, or null for none. */
  subjectId: string | null
  counts: Partial<Record<ActivityKind, number>>
}

const DAY_MS = 86_400_000

/** Every day in the span, oldest first, ending on `today`. */
export function activityDays(rows: readonly ActivityCount[], today: string): ActivityDay[] {
  // Dates as UTC midnights: no clock change can add or lose a day.
  const end = Date.parse(`${today}T00:00:00Z`)
  const days: ActivityDay[] = []
  const index = new Map<string, number>()
  for (let i = ACTIVITY.DAYS - 1; i >= 0; i--) {
    const day = new Date(end - i * DAY_MS).toISOString().slice(0, 10)
    index.set(day, days.length)
    days.push({ day, score: 0, subjectId: null, counts: {} })
  }

  const bySubject = new Map<number, Map<string, number>>()
  for (const r of rows) {
    const i = index.get(r.day)
    if (i === undefined) continue
    const d = days[i]
    const weight = ACTIVITY.WEIGHT[r.kind] * r.n
    d.score += weight
    d.counts[r.kind] = (d.counts[r.kind] ?? 0) + r.n
    if (r.subjectId === null) continue
    const subjects = bySubject.get(i) ?? new Map<string, number>()
    subjects.set(r.subjectId, (subjects.get(r.subjectId) ?? 0) + weight)
    bySubject.set(i, subjects)
  }

  for (const [i, subjects] of bySubject) {
    let best: [string, number] | null = null
    for (const entry of subjects) {
      if (!best || entry[1] > best[1] || (entry[1] === best[1] && entry[0] < best[0])) best = entry
    }
    days[i].subjectId = best![0]
  }
  return days
}

/**
 * How full a day was, 0 to 4, against the reader's own active days:
 * where its score ranks among them, in quarters. A steady reader and a
 * weekend one both get a strip that uses its whole range.
 */
export function activityLevel(score: number, scores: readonly number[]): 0 | 1 | 2 | 3 | 4 {
  if (score <= 0) return 0
  const active = scores.filter(s => s > 0)
  const atOrBelow = active.filter(s => s <= score).length
  return Math.max(1, Math.min(4, Math.ceil((atOrBelow / active.length) * 4))) as 1 | 2 | 3 | 4
}

const NOUN: Record<ActivityKind, [string, string]> = {
  lesson: ['lesson', 'lessons'],
  read: ['read', 'reads'],
  mark: ['mark', 'marks'],
  answer: ['answer', 'answers'],
  card: ['card', 'cards'],
  added: ['to the inbox', 'to the inbox'],
}

const DATE = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' })

/** `12 March · 1 lesson, 3 marks`, heaviest kind first. */
export function activityTitle(d: ActivityDay): string {
  const date = DATE.format(Date.parse(`${d.day}T00:00:00Z`))
  const parts = (Object.keys(ACTIVITY.WEIGHT) as ActivityKind[])
    .filter(k => d.counts[k])
    .map(k => `${d.counts[k]} ${NOUN[k][d.counts[k] === 1 ? 0 : 1]}`)
  return `${date} · ${parts.length ? parts.join(', ') : 'nothing'}`
}

const MONTH = new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: 'UTC' })

export interface CalendarLayout {
  /** One per day, in the same order: 1-based grid column and row. */
  cells: Array<{ col: number; row: number }>
  /** A label at each month's first column. The year rides on January,
   *  on the first month shown and on the last, so whatever slice of the
   *  year is in view the year is never far off. */
  months: Array<{ day: string; i: number; col: number; label: string }>
  cols: number
}

/**
 * Where each day sits in the opened calendar: a weekday to a row,
 * Monday first, a week to a column, and one empty column between
 * months so each month reads as its own block. A week that straddles
 * two months is split between them.
 */
export function calendarLayout(days: readonly ActivityDay[]): CalendarLayout {
  const cells: CalendarLayout['cells'] = []
  const firsts: Array<{ day: string; i: number; col: number; date: Date }> = []
  let col = 1
  days.forEach((d, i) => {
    const date = new Date(`${d.day}T00:00:00Z`)
    const row = ((date.getUTCDay() + 6) % 7) + 1
    const first = date.getUTCDate() === 1
    if (i > 0) {
      if (first) col += 2
      else if (row === 1) col += 1
    }
    if (first || i === 0) firsts.push({ day: d.day, i, col, date })
    cells.push({ col, row })
  })

  // The span's opening days are only labelled if they are a month's first.
  const labelled = firsts.filter(f => f.date.getUTCDate() === 1)
  const months = labelled.map((f, n) => {
    const withYear = f.date.getUTCMonth() === 0 || n === 0 || n === labelled.length - 1
    const month = MONTH.format(f.date)
    return { day: f.day, i: f.i, col: f.col, label: withYear ? `${month} ${f.date.getUTCFullYear()}` : month }
  })
  return { cells, months, cols: col }
}
