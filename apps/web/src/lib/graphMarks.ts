/**
 * Marks, as the bed draws them.
 *
 * A mark is the one thing on the map with no title. It is a passage
 * and a thought about it, and both are sentences -- so it has to be
 * named by what it says, short enough to sit under a node without
 * covering the bed it is standing in.
 */

/**
 * How many marks the bed will carry.
 *
 * Every other layer is bounded by how much work the reader has done:
 * there are as many lessons as were drafted and as many resources as
 * were filed. Marks are bounded by how much they read, and a reader
 * who marks freely has thousands. Past a point they stop being a
 * layer over the bed and become the bed, so the newest are drawn and
 * the rest are on the marked sheet, where they are searchable.
 */
export const MARKS_ON_THE_BED = 500

/** As long as a label can be before it is covering the planting. */
export const LABEL_CEILING = 60

/**
 * What a mark is called on the bed.
 *
 * The note first: it is the reader's own words about the passage, and
 * what they wrote is a better name than what they marked. The passage
 * where there is no note. Markup comes off -- a label is text, and
 * `**this**` printed under a node is two asterisks nobody meant.
 */
export function markLabel(note: string | null, quote: string | null): string {
  const said = plain(note ?? '') || plain(quote ?? '')
  if (!said) return 'A mark'
  if (said.length <= LABEL_CEILING) return said

  // Cut at a word rather than mid-syllable, and only where there is a
  // word to cut at: a single long token is simply trimmed.
  const cut = said.slice(0, LABEL_CEILING)
  const lastSpace = cut.lastIndexOf(' ')
  return `${(lastSpace > LABEL_CEILING / 2 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`
}

/** A note as it reads, rather than as it is stored. */
function plain(markdown: string): string {
  return markdown
    // A tag is a link to a topic or a lesson; on the bed the thing it
    // names is a node of its own with an edge drawn to it, so the
    // label only needs the words.
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/~~(.*?)~~/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}[-*+]\s+/gm, '')
    .replace(/\\([\\`*_[\]#>+-])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}
