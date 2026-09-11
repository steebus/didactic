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

/** What each kind of edge is called where one is named to a reader. */
export const EDGE_KIND_LABEL: Record<string, string> = {
  prereq: 'sow first',
  related: 'grows with',
  specialises: 'variety of',
  alternative: 'instead of',
}
