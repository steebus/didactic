import { computeAbility, vagueFigure, viabilityFigure } from './scoring'
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
  /** Viability points this moved, as the sheet prints the figure. */
  delta: number
  /** The figure after it, as printed. */
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
  let before = computeAbility([])

  ordered.forEach((exposure, index) => {
    const after = computeAbility(ordered.slice(0, index + 1) as Exposure[])
    const wasVague = vagueFigure(before.confidence)
    const isVague = vagueFigure(after.confidence)

    events.push({
      id: exposure.id,
      kind: 'exposure',
      reason: exposure.reason,
      depth: exposure.depth,
      created_at: exposure.created_at,
      delta: viabilityFigure(after.ability) - viabilityFigure(before.ability),
      after: viabilityFigure(after.ability),
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
      .at(-1)?.after ?? viabilityFigure(computeAbility([]).ability)
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
  const points = event.delta > 0 ? `+${event.delta}` : event.delta < 0 ? `−${-event.delta}` : '±0'
  if (event.sureness === 'held') return `${points}, made it a guess`
  if (event.sureness === 'lifted') return `${points}, no longer a guess`
  return points
}
