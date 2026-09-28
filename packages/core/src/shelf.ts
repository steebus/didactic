/**
 * The shelf: what the inbox prints about each thing on it beyond its
 * title, and how it is searched.
 *
 * Two jobs that meet in one row. What the reader has *said back* about a
 * resource -- their summary of the whole of it, and how many of its
 * sections they have put in their own words -- is printed under its
 * title, because it is the most valuable thing the shelf holds about it:
 * the reader's own account, not the app's. And the search reaches
 * everything the shelf holds, in two halves: what every row already
 * carries (title, address, the filing summary, topics, what was said
 * back) is matched here, as the reader types; what only the database
 * holds (the text itself, every mark and note, every section summary) is
 * searched there and comes back as hits, each saying where it matched.
 *
 * Both front ends print these rows, so both read this.
 */

import { sectionKey } from './summaries'

/** What the reader has said back about one reading. */
export interface Said {
  /** Their summary of the whole of it, or null if there is none. */
  whole: string | null
  /** How many of its sections they have summarised. */
  sections: number
}

/** The rows `saidFrom` reads: summaries, and anything else, which it
 *  ignores. */
export interface SaidRow {
  kind: string
  section?: string | null
  note: string | null
  resource_id?: string | null
  lesson_id?: string | null
}

/**
 * What was said back about each reading, by the reading's id.
 *
 * Read off the same rows the marks come in, so a sheet that already has
 * them asks the database nothing more. A reading with nothing said back
 * is absent rather than present and empty.
 */
export function saidFrom(rows: SaidRow[], by: 'resource_id' | 'lesson_id'): Map<string, Said> {
  const out = new Map<string, Said>()
  for (const row of rows) {
    if (row.kind !== 'summary') continue
    const id = row[by]
    if (!id || !row.note?.trim()) continue
    const held = out.get(id) ?? { whole: null, sections: 0 }
    if (sectionKey(row.section) === null) held.whole = row.note
    else held.sections++
    out.set(id, held)
  }
  return out
}

/**
 * The line that stands in for the summary where there is only sections.
 *
 * A reader who has said back three sections and not the whole has done
 * real work, and the shelf should not print nothing for it.
 */
export function sectionsLine(sections: number): string {
  if (sections <= 0) return ''
  return `${sections} ${sections === 1 ? 'section' : 'sections'} said back`
}

/* --------------------------------------------------------------- search */

/** The words of a search, lower-cased, quotes and punctuation taken off. */
export function shelfTerms(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .map(t => t.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
    .filter(Boolean)
}

/** What a row carries that the reader can search for as they type. */
export interface ShelfFields {
  title: string
  url: string | null
  summary: string | null
  kind: string
  topics: Array<{ title: string }>
  said?: Said | null
}

/**
 * Whether a row answers a search, from what it already carries.
 *
 * Every word has to be found somewhere on the row, but not all in one
 * place: "custody broker" finds an article titled *Custody* filed under
 * *Brokerage*. That is how the search box at the head of the Marked
 * sheet reads a query too (websearch), so the two agree about what a
 * query of several words means.
 */
export function shelfMatches(row: ShelfFields, query: string): boolean {
  const terms = shelfTerms(query)
  if (terms.length === 0) return true
  const haystack = [
    row.title,
    row.url ?? '',
    row.summary ?? '',
    row.kind,
    ...row.topics.map(t => t.title),
    row.said?.whole ?? '',
  ]
    .join('\n')
    .toLowerCase()
  return terms.every(term => haystack.includes(term))
}

/** Where a search found something the row itself does not carry. */
export type FoundIn = 'summary' | 'mark' | 'note' | 'text'

/** One place a search matched, as the server answers it. */
export interface ShelfHit {
  resourceId: string
  foundIn: FoundIn
  /** The words around the match, with each matched word between
   *  `HIT_OPEN` and `HIT_CLOSE`. */
  snippet: string
}

export const FOUND_IN_LABEL: Record<FoundIn, string> = {
  summary: 'In your summary',
  mark: 'In a passage you marked',
  note: 'In a note',
  text: 'In the text',
}

/**
 * Which matches say the most, first.
 *
 * The reader's own words before the text's: finding a search in
 * something they wrote about a resource says more about why they are
 * looking than finding it somewhere in eight thousand words of it.
 */
const WEIGHT: Record<FoundIn, number> = { summary: 0, note: 1, mark: 2, text: 3 }

/** The one hit worth printing under each row: the most telling. */
export function bestHits(hits: ShelfHit[]): Map<string, ShelfHit> {
  const out = new Map<string, ShelfHit>()
  for (const hit of hits) {
    const held = out.get(hit.resourceId)
    if (!held || WEIGHT[hit.foundIn] < WEIGHT[held.foundIn]) out.set(hit.resourceId, hit)
  }
  return out
}

/** How the server marks a matched word inside a snippet. Characters no
 *  article is going to contain, so a snippet can be split on them. */
export const HIT_OPEN = '⟦'
export const HIT_CLOSE = '⟧'

/** A snippet, as runs of plain and matched text, for either front end
 *  to set however it sets emphasis. */
export function snippetParts(snippet: string): Array<{ text: string; hit: boolean }> {
  const parts: Array<{ text: string; hit: boolean }> = []
  let rest = snippet.replace(/\s+/g, ' ').trim()
  while (rest) {
    const open = rest.indexOf(HIT_OPEN)
    if (open === -1) {
      parts.push({ text: rest, hit: false })
      break
    }
    if (open > 0) parts.push({ text: rest.slice(0, open), hit: false })
    const close = rest.indexOf(HIT_CLOSE, open + 1)
    if (close === -1) {
      parts.push({ text: rest.slice(open + 1), hit: false })
      break
    }
    parts.push({ text: rest.slice(open + 1, close), hit: true })
    rest = rest.slice(close + 1)
  }
  return parts.filter(p => p.text)
}

/** One topic's shelf in a grouped view: the topic, or null for what is
 *  filed against none, and its rows in the order they were given. */
export interface TopicShelf<R> {
  topic: { id: string; title: string } | null
  rows: R[]
}

/**
 * Rows grouped by what each is most about.
 *
 * A resource is filed against as many topics as it touches -- two dozen,
 * for a broad one -- so it stands once, under its first topic, which the
 * shelf lists most relevant first. The fullest shelf comes first, ties
 * by title; what is filed against nothing comes last, since it is the
 * shelf that most needs attention and the least like the others.
 */
export function byTopic<R extends { topics: Array<{ id: string; title: string }> }>(
  rows: R[]
): TopicShelf<R>[] {
  const shelves = new Map<string, TopicShelf<R>>()
  const loose: R[] = []
  for (const row of rows) {
    const topic = row.topics[0]
    if (!topic) {
      loose.push(row)
      continue
    }
    const shelf = shelves.get(topic.id)
    if (shelf) shelf.rows.push(row)
    else shelves.set(topic.id, { topic: { id: topic.id, title: topic.title }, rows: [row] })
  }
  const grouped = [...shelves.values()].sort(
    (a, b) => b.rows.length - a.rows.length || a.topic!.title.localeCompare(b.topic!.title)
  )
  return loose.length ? [...grouped, { topic: null, rows: loose }] : grouped
}

/** Whether a row is filed against a topic, anywhere in its list. */
export function filedUnder(row: { topics: Array<{ id: string }> }, topicId: string): boolean {
  return row.topics.some(t => t.id === topicId)
}
