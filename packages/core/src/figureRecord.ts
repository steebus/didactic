import { unroundedAbility, vagueFigure, viabilityPoints } from './scoring'
import type { Exposure } from './types'

/**
 * Why a topic's figure is what it is, one event at a time, with what
 * each one did to it.
 *
 * A topic's ability is a pure function of its exposure log, and that is
 * what makes this honest rather than a story: replay the log oldest
 * first, and the figure after each event minus the figure before it is
 * exactly what that event moved. Nothing here is weighted a second
 * time or estimated -- it is `computeAbility` run on every prefix.
 *
 * It also says why the same event can be worth different amounts on two
 * topics. The curve has diminishing returns, so the first close read
 * moves a figure by a dozen points and the tenth by one, and printing
 * that is the only way anyone would know.
 *
 * The replay asks for the figure before it is rounded to the tenth the
 * column holds. It has to. A tenth of ability is two and a half points
 * of viability, which is more than a marked passage or a right answer
 * is ever worth -- so read off the stored figure, every one of them
 * came out as a flat nought, and a read came out as whichever of +2 or
 * +3 the rounding happened to land on rather than as what it did. The
 * small things are small, not nothing, and the record now says which.
 *
 * Shared, because the phone prints the same record.
 */

/** One line of the record. */
export interface FigureEvent {
  /** The exposure's id, or `entry:<id>` for a diary entry that moved
   *  nothing on this topic. */
  id: string
  kind: 'exposure' | 'entry'
  /** What happened, in the words the log was written with. */
  reason: string
  depth: string | null
  created_at: string
  /** Viability points this moved, to the hundredth. A marked passage is
   *  worth a few hundredths; the first close read is worth ten points. */
  delta: number
  /** The figure after it, to the hundredth. The band prints this
   *  rounded, so a sheet reading 77 stands behind 77.43 here. */
  after: number
  /**
   * Whether this changed how sure the figure is. `held` is a figure
   * that became a guess -- a struggle does that, and so does the first
   * thing ever recorded, which is not much to go on -- and `lifted` is
   * one that stopped being one.
   */
  sureness: 'held' | 'lifted' | null
}

/** A diary entry filed under or naming this topic. */
export interface FiledEntry {
  id: string
  note: string
  created_at: string
}

/** How much of an entry the record quotes. */
const ENTRY_QUOTE = 90

/** Points, to the hundredth. Every figure in the record passes through
 *  here, so the deltas telescope onto the standings exactly rather than
 *  drifting apart by a float's worth each line. */
const points = (ability: number) => Math.round(viabilityPoints(ability) * 100) / 100

type Logged = Pick<Exposure, 'id' | 'reason' | 'depth' | 'created_at'> &
  Partial<Pick<Exposure, 'source' | 'source_id'>>

/**
 * The record, newest first.
 *
 * An entry is included only where nothing it wrote is in this topic's
 * log. One that was read and recorded shows up as its exposure, with
 * the writer's own words as the reason; one that was not -- read as
 * naming the topic in passing, or never read at all -- is still a thing
 * the reader did here and expects to find, and says plainly that it
 * moved nothing.
 */
export function figureRecord(exposures: Logged[], entries: FiledEntry[] = []): FigureEvent[] {
  const ordered = [...exposures].sort(
    (a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)
  )

  const events: FigureEvent[] = []
  let before = unroundedAbility([])

  ordered.forEach((exposure, index) => {
    const after = unroundedAbility(ordered.slice(0, index + 1) as Exposure[])
    const wasVague = vagueFigure(before.confidence)
    const isVague = vagueFigure(after.confidence)

    events.push({
      id: exposure.id,
      kind: 'exposure',
      reason: exposure.reason,
      depth: exposure.depth,
      created_at: exposure.created_at,
      delta: Math.round((points(after.ability) - points(before.ability)) * 100) / 100,
      after: points(after.ability),
      // Before anything is recorded the figure is the floor and not a
      // measurement at all, so the first event cannot "hold" it: it is
      // the first reading, however little it says.
      sureness:
        index > 0 && !wasVague && isVague ? 'held'
          : wasVague && !isVague ? 'lifted'
            : null,
    })

    before = after
  })

  const recorded = new Set(
    exposures.filter(e => e.source === 'diary' && e.source_id).map(e => e.source_id as string)
  )

  for (const entry of entries) {
    if (recorded.has(entry.id)) continue
    const standing = events
      .filter(e => e.created_at <= entry.created_at)
      .at(-1)?.after ?? points(unroundedAbility([]).ability)
    events.push({
      id: `entry:${entry.id}`,
      kind: 'entry',
      reason: `diary: "${quote(entry.note)}"`,
      depth: null,
      created_at: entry.created_at,
      delta: 0,
      after: standing,
      sureness: null,
    })
  }

  return events.sort(
    (a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id)
  )
}

/** The front of an entry, on one line, cut at a word. */
function quote(note: string): string {
  const flat = note.replace(/\s+/g, ' ').trim()
  if (flat.length <= ENTRY_QUOTE) return flat
  const cut = flat.slice(0, ENTRY_QUOTE)
  const atWord = cut.slice(0, Math.max(cut.lastIndexOf(' '), ENTRY_QUOTE * 0.6))
  return `${atWord.trimEnd()}…`
}

/**
 * What a line of the record prints for its impact.
 *
 * Signed, so a nought reads as a nought rather than as a missing figure,
 * and in words where the number is not the news: a struggle moves no
 * points but makes the figure a guess, and that is the thing it did.
 */
export function impactLabel(event: Pick<FigureEvent, 'delta' | 'sureness' | 'kind'>): string {
  if (event.kind === 'entry') return 'moved nothing'
  if (event.sureness === 'held' && event.delta === 0) return 'made it a guess'
  const moved = event.delta > 0 ? `+${figure(event.delta)}`
    : event.delta < 0 ? `−${figure(-event.delta)}`
      : '±0'
  if (event.sureness === 'held') return `${moved}, made it a guess`
  if (event.sureness === 'lifted') return `${moved}, no longer a guess`
  return moved
}

/**
 * A delta at the precision that says what it was.
 *
 * Whole points for the things worth whole points, and hundredths for
 * the things that are not -- a marked passage is worth about four
 * hundredths of a point late in a log, and rounding that to the nearest
 * point is how it came to read as nothing. Two decimals is enough for
 * the smallest thing there is: nothing under a hundredth can be earned,
 * because past a total weight of ten the curve is at its ceiling and
 * further reading is worth nought exactly, which is a different claim
 * and prints as one.
 */
function figure(points: number): string {
  return points >= 1 ? points.toFixed(1) : points.toFixed(2)
}
