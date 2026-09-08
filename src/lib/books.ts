/**
 * Books, from Open Library.
 *
 * Chosen because it needs no key, no account and no attribution
 * contract, which is the whole requirement: this is one field on one
 * form, and typing the title by hand has to keep working when the
 * service is down. Everything here degrades to that.
 */

export interface BookMatch {
  /** Open Library work key, e.g. "/works/OL16551230W". */
  key: string
  title: string
  authors: string[]
  year: number | null
  editions: number
  /** What the book is about, as Open Library files it. Used as the text
   *  the ingester reads, since the app never holds a book's contents. */
  subjects: string[]
  /** How the book is filed: "Title — Author". */
  label: string
}

interface RawDoc {
  key?: unknown
  title?: unknown
  author_name?: unknown
  first_publish_year?: unknown
  edition_count?: unknown
  subject?: unknown
}

const strings = (v: unknown, cap: number): string[] =>
  Array.isArray(v)
    ? v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
        .map(x => x.trim())
        .slice(0, cap)
    : []

/**
 * Turn a search response into something the form can print.
 *
 * Open Library returns a work per edition cluster, so a well-known book
 * comes back three or four times with the same title and author. They
 * are folded together and the one with the most editions wins, because
 * that is the one whose record is best filled in.
 */
export function normaliseBooks(payload: unknown, limit = 8): BookMatch[] {
  const docs = (payload as { docs?: unknown })?.docs
  if (!Array.isArray(docs)) return []

  const best = new Map<string, BookMatch>()

  for (const raw of docs as RawDoc[]) {
    const title = typeof raw?.title === 'string' ? raw.title.trim() : ''
    const key = typeof raw?.key === 'string' ? raw.key : ''
    if (!title || !key) continue

    const authors = strings(raw.author_name, 3)
    const match: BookMatch = {
      key,
      title,
      authors,
      year: Number.isFinite(raw.first_publish_year) ? Number(raw.first_publish_year) : null,
      editions: Number.isFinite(raw.edition_count) ? Number(raw.edition_count) : 0,
      // Enough for the ingester to work out what the book is about, and
      // not so many that the tail of the list is noise.
      subjects: strings(raw.subject, 12),
      label: authors.length ? `${title} — ${authors[0]}` : title,
    }

    const fingerprint = `${title.toLowerCase()}|${(authors[0] ?? '').toLowerCase()}`
    const held = best.get(fingerprint)
    if (!held || match.editions > held.editions) best.set(fingerprint, match)
  }

  // Ordered by how many editions a work has, which is the closest
  // thing Open Library gives to "is this the actual book". A search for
  // a well-known title otherwise returns study guides and summaries
  // above the book they summarise, purely on text relevance. Ties keep
  // the order Open Library gave them.
  return [...best.values()]
    .map((book, i) => ({ book, i }))
    .sort((a, b) => b.book.editions - a.book.editions || a.i - b.i)
    .map(({ book }) => book)
    .slice(0, limit)
}

/**
 * What gets filed as the resource's text. The app does not hold a book,
 * so what it can honestly record is what the book is about — which is
 * enough for ingestion to place it on the map.
 */
export function bookNote(book: BookMatch): string {
  const parts = [
    book.authors.length ? `${book.title}, by ${book.authors.join(', ')}` : book.title,
    book.year ? `First published ${book.year}.` : '',
    book.subjects.length ? `Subjects: ${book.subjects.join(', ')}.` : '',
  ]
  return parts.filter(Boolean).join(' ')
}
