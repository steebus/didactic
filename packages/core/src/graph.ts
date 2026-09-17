/**
 * How the bed is drawn, as numbers rather than as rendering.
 *
 * The web draws this with Sigma on a WebGL canvas and the phone will
 * draw it with Skia, so no drawing code can be shared -- but the
 * encoding must be, or the two beds disagree about what a seed means.
 * Size is ability, fill is freshness, and the label goes faint when a
 * topic goes dormant.
 */

/** The paper the bed sits on; every fade mixes toward it. */
export const PAPER: readonly [number, number, number] = [239, 231, 214]

/** A seed's radius from how well the topic is held. */
export function nodeSize(ability: number): number {
  return 5 + ability * 2.4
}

/** An edge's weight from the strength of the relation. */
export function edgeSize(weight: number): number {
  return 0.9 + weight * 1.4
}

/**
 * How strongly a seed's own plate ink shows: warm topics are saturated,
 * cold ones sit back into the bed rather than disappearing.
 */
export function nodeFade(freshness: number): number {
  return 0.3 + freshness * 0.7
}

/** The same for a subject's hull, which fades by membership strength. */
export function hullFade(strength: number): number {
  return 0.35 + strength * 0.65
}

/**
 * Mix a colour toward the paper by the given amount.
 *
 * Accepts hex or the `rgb()` strings it returns, since a hover fades a
 * colour that freshness has already faded.
 */
export function fade(colour: string, amount: number): string {
  const rgb = colour.startsWith('#')
    ? [
        (parseInt(colour.slice(1), 16) >> 16) & 255,
        (parseInt(colour.slice(1), 16) >> 8) & 255,
        parseInt(colour.slice(1), 16) & 255,
      ]
    : (colour.match(/\d+/g) ?? ['0', '0', '0']).slice(0, 3).map(Number)

  const mixed = rgb.map((c, i) => Math.round(PAPER[i] + (c - PAPER[i]) * amount))
  return `rgb(${mixed.join(',')})`
}

/** Label ink: a dormant seed's name is set faint, by the same 0.25. */
export const LABEL_INK = '#241d16'
export const LABEL_INK_DORMANT = '#8a7d68'

export function labelInk(freshness: number): string {
  return freshness < 0.25 ? LABEL_INK_DORMANT : LABEL_INK
}

/**
 * What each kind of edge is called where one is named to a reader,
 * written from the end the edge points away from.
 *
 * An edge has a direction and the two nesting kinds mean opposite
 * things at its two ends: `specialises` runs general to narrower, so
 * the far end is the variety, and `prereq` runs earlier to later, so
 * the far end is what follows. Read as a caption on the far topic's
 * name with "this" left implied -- "Memoisation, sow after".
 */
const LABEL_ONWARD: Record<string, string> = {
  prereq: 'sow after',
  related: 'grows with',
  specialises: 'variety of',
  alternative: 'instead of',
}

/**
 * The same four relations read from the other end.
 *
 * The sideways kinds say the same thing whichever way round they are
 * read; the two nesting kinds invert. This exists because the topic
 * sheet used one table for both directions and so told a reader to sow
 * first the topic that in fact comes after.
 */
const LABEL_BACK: Record<string, string> = {
  prereq: 'sow first',
  related: 'grows with',
  specialises: 'broader than',
  alternative: 'instead of',
}

/** What a neighbour is called on a topic's own sheet. `incoming` is an
 *  edge that points at that topic, which puts the neighbour at the end
 *  the label is written from. */
export function edgeKindLabel(kind: string, incoming: boolean): string {
  const table = incoming ? LABEL_BACK : LABEL_ONWARD
  return table[kind] ?? kind
}

/** One topic near another, as the sheet lists it. */
export interface Neighbour {
  id: string
  title: string
  kind: string
  incoming: boolean
}

/**
 * How definite a claim each kind makes, most definite first. Ties are
 * broken toward the edge that points at the topic being read, so a pair
 * that wrote `related` at each other settles on one row rather than on
 * whichever came back first.
 */
const RELATION_RANK: Record<string, number> = {
  prereq: 0,
  specialises: 1,
  alternative: 2,
  related: 3,
}

/**
 * The topics near this one, one row each, most definite relation first.
 *
 * The edge table holds a row per claim, and one pair of topics can make
 * several about each other: React is both what to sow first and the
 * broader thing a topic is a variety of, and a `related` written from
 * each end is two rows saying one thing once. A row per edge printed
 * the same name three and four times over with a different caption
 * each, which reads as a fault in the list rather than as three claims.
 *
 * So a neighbour appears once, under the most definite thing there is
 * to say about it: what to sow before or after beats what is a variety
 * of what, which beats the two sideways kinds -- and `related`, which
 * any two topics in a bed can always be said to be, loses to
 * everything. The rest of the claims are still on the bed, which is the
 * view that exists for showing every edge at once.
 */
export function nearbyTopics(edges: readonly Neighbour[]): Neighbour[] {
  const rank = (e: Neighbour) => RELATION_RANK[e.kind] ?? RELATION_RANK.related

  const ordered = [...edges].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      Number(b.incoming) - Number(a.incoming) ||
      a.title.localeCompare(b.title) ||
      a.id.localeCompare(b.id)
  )

  const seen = new Set<string>()
  const nearest: Neighbour[] = []
  for (const edge of ordered) {
    if (seen.has(edge.id)) continue
    seen.add(edge.id)
    nearest.push(edge)
  }
  return nearest
}
