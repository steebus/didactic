/**
 * Ordering what an `@` could mean.
 *
 * The database finds the candidates; this decides what the reader
 * sees first, and it is a rule about typing rather than about data.
 * Someone who has typed "set" is reaching for "Settlement", not for
 * "Asset offsetting" -- what starts with what they wrote comes before
 * what merely contains it, and a shorter title beats a longer one at
 * the same rank because it is the more exact answer.
 *
 * Topics before lessons at equal rank: a topic is the coarser thing
 * and the one a note is more often about, and a lesson can always be
 * reached by typing more of it.
 */

export type MentionKind = 'topic' | 'lesson'

export interface Suggestion {
  kind: MentionKind
  id: string
  title: string
}

/** How many are offered. A menu longer than this is a search result. */
export const MENTION_SUGGESTIONS = 8

/** 0 is an exact title, then a prefix, then a word start, then
 *  anywhere in the title. Everything else is not an answer. */
export function mentionRank(query: string, title: string): number {
  const q = query.trim().toLowerCase()
  const t = title.toLowerCase()
  if (!q) return 3
  if (t === q) return 0
  if (t.startsWith(q)) return 1
  // A word start, which is how a reader thinks about a multi-word
  // title: "cust" should reach "Brokerage custody".
  if (new RegExp(`\\b${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(t)) return 2
  return t.includes(q) ? 3 : 4
}

export function rankMentions(
  query: string,
  topics: Suggestion[],
  lessons: Suggestion[],
  ceiling = MENTION_SUGGESTIONS
): Suggestion[] {
  return [...topics, ...lessons]
    .map(s => ({ s, rank: mentionRank(query, s.title) }))
    // A candidate the database matched on something other than the
    // title -- or on a wildcard the reader did not mean -- is not an
    // answer to what was typed.
    .filter(({ rank }) => rank < 4)
    .sort((a, b) =>
      a.rank - b.rank ||
      Number(a.s.kind === 'lesson') - Number(b.s.kind === 'lesson') ||
      a.s.title.length - b.s.title.length ||
      a.s.title.localeCompare(b.s.title)
    )
    .slice(0, ceiling)
    .map(({ s }) => s)
}
