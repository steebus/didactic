/**
 * A document cut into passages.
 *
 * A passage is the unit a lesson cites and the unit a reader is shown
 * when they press a citation, which is what decides the size: big
 * enough to make a point on its own, small enough that being sent to it
 * answers a question rather than starting a reading session. It is also
 * the unit that gets an embedding, so a passage spanning three
 * unrelated arguments retrieves badly for all three.
 *
 * The cut is made on paragraphs, never mid-sentence, and every passage
 * carries the pages it came off. That page number is the whole point of
 * this module: a citation that cannot say where it came from is not a
 * citation, it is a claim. Everything here is arithmetic over plain
 * text, so the awkward cases -- a paragraph longer than the ceiling, a
 * page of nothing, a document with no blank lines in it at all -- are
 * written down as tests rather than discovered in a book.
 */

/** A page as the parser hands it over. */
export interface PageText {
  /** One-based, as the reader would count it and as a citation prints
   *  it. Not the index in the array: a round starts part way in. */
  page: number
  text: string
}

/** A chapter as the document declares it, or as the model read it. */
export interface OutlineEntry {
  title: string
  pageFrom: number
  pageTo: number
  children?: OutlineEntry[]
}

/** One cut piece, ready to be embedded and stored. */
export interface Passage {
  ordinal: number
  pageFrom: number
  pageTo: number
  /** The chapter or section it fell under, where the outline knows. */
  heading: string | null
  content: string
}

/**
 * What a passage is aiming at, in words.
 *
 * Three hundred is about a page of a paperback and comfortably inside
 * what the embedding model reads without truncating. The ceiling is
 * half as much again rather than double: a passage is allowed to run
 * on to finish a paragraph, not to swallow the next argument.
 */
export const TARGET_WORDS = 300
export const MAX_WORDS = 450

/**
 * How much of the previous passage the next one repeats.
 *
 * Retrieval on a cut boundary is the failure this prevents: the
 * sentence that names the concept ends one passage and the sentence
 * that explains it starts the next, so neither retrieves for the
 * question. Enough to carry a sentence or two across the seam, not
 * enough that two neighbours come back as near-duplicates.
 */
export const OVERLAP_WORDS = 40

const words = (s: string) => (s.trim() ? s.trim().split(/\s+/) : [])

/**
 * Split a page into paragraphs.
 *
 * A blank line is the signal, which is what a PDF text layer gives for
 * a paragraph break most of the time. Where it gives nothing -- a page
 * extracted as one unbroken run, which happens -- the whole page comes
 * back as a single paragraph and the ceiling below deals with it.
 */
export function paragraphs(text: string): string[] {
  return text
    .split(/\n\s*\n+/)
    .map(p => p.replace(/[ \t]+\n/g, '\n').trim())
    .filter(Boolean)
}

/**
 * Break a paragraph that is on its own too long to be a passage.
 *
 * On sentence ends, greedily, so the pieces still read. A "sentence"
 * here is deliberately crude: anything ending in a stop, question or
 * exclamation followed by a space. It over-splits on "Fig. 3" and
 * under-splits on a line of code, and both are survivable -- this only
 * runs on a paragraph already over the ceiling, where any cut is better
 * than a passage nothing can retrieve.
 */
export function splitLongParagraph(text: string, max = MAX_WORDS): string[] {
  if (words(text).length <= max) return [text]

  const sentences = text.match(/[^.!?]+(?:[.!?]+(?:\s|$)|$)/g) ?? [text]
  const out: string[] = []
  let held: string[] = []

  for (const sentence of sentences) {
    const next = [...held, sentence]
    if (words(next.join('')).length > max && held.length > 0) {
      out.push(held.join('').trim())
      held = [sentence]
    } else {
      held = next
    }
  }
  if (held.length) out.push(held.join('').trim())

  // A single sentence over the ceiling with no stop in it at all: cut
  // on words rather than hand back something unbounded.
  return out.flatMap(piece => {
    const w = words(piece)
    if (w.length <= max) return [piece]
    const chunks: string[] = []
    for (let i = 0; i < w.length; i += max) chunks.push(w.slice(i, i + max).join(' '))
    return chunks
  })
}

/** The last few words of a passage, to open the next one with. */
export function tail(text: string, count = OVERLAP_WORDS): string {
  const w = words(text)
  return w.length <= count ? text : w.slice(-count).join(' ')
}

/**
 * Which chapter a page falls in.
 *
 * The deepest entry that contains the page, so a section wins over the
 * chapter it sits in -- the more specific heading is the more useful
 * one on a citation. Null where the outline does not reach, which is
 * ordinary: front matter, appendices, and any document whose structure
 * could not be read at all.
 */
export function headingAt(outline: OutlineEntry[], page: number): string | null {
  let found: string | null = null

  const walk = (entries: OutlineEntry[]) => {
    for (const entry of entries) {
      if (page >= entry.pageFrom && page <= entry.pageTo) {
        found = entry.title
        if (entry.children?.length) walk(entry.children)
        return
      }
    }
  }
  walk(outline)

  return found
}

/**
 * Give every entry in an outline an end page.
 *
 * A bookmark, a contents line and a heading all say where something
 * starts and none of them says where it stops, so an entry runs until
 * the next one at its own level begins. The last runs to the end of
 * whatever contains it -- the document, or the parent chapter for a
 * section.
 *
 * Here rather than beside the parser because all three ways of finding
 * an outline need it and none of them needs a PDF to do it.
 */
export function closeOutline<
  T extends { title: string; pageFrom: number; children?: OutlineEntry[] },
>(entries: T[], endsAt: number): OutlineEntry[] {
  const sorted = [...entries].sort((a, b) => a.pageFrom - b.pageFrom)

  return sorted.map((entry, i) => {
    const next = sorted[i + 1]
    // One before the next sibling starts, or the end of the parent.
    // Never before its own start, which a document with two entries on
    // one page would otherwise produce.
    const pageTo = next ? Math.max(entry.pageFrom, next.pageFrom - 1) : endsAt
    return {
      title: entry.title,
      pageFrom: entry.pageFrom,
      pageTo,
      ...(entry.children?.length ? { children: entry.children } : {}),
    }
  })
}

/**
 * Cut pages into passages.
 *
 * `startOrdinal` is what makes this resumable. A long document is read
 * in rounds -- the platform will not hold a function open long enough
 * to do a book in one -- and each round cuts the pages it managed and
 * numbers them on from where the last one stopped. So this never sees
 * the whole document and must not assume it does: it takes the pages it
 * is given and the number to start counting at.
 *
 * A passage never spans a page it has no text from, and `pageFrom` is
 * the page its first word came off. That is what a citation prints, so
 * it has to be the page the reader would actually find the words on.
 */
export function cutPassages(
  pages: PageText[],
  { outline = [], startOrdinal = 0 }: { outline?: OutlineEntry[]; startOrdinal?: number } = {}
): Passage[] {
  const out: Passage[] = []

  let held: string[] = []
  let heldWords = 0
  let pageFrom = 0
  let pageTo = 0
  let ordinal = startOrdinal

  const flush = () => {
    const content = held.join('\n\n').trim()
    if (!content) return

    out.push({
      ordinal: ordinal++,
      pageFrom,
      pageTo,
      heading: headingAt(outline, pageFrom),
      content,
    })

    // Open the next passage with the tail of this one, so a cut
    // boundary does not hide the sentence that explains the last one.
    const carried = tail(content)
    held = carried ? [carried] : []
    heldWords = words(carried).length
    pageFrom = pageTo
  }

  for (const { page, text } of pages) {
    for (const paragraph of paragraphs(text)) {
      for (const piece of splitLongParagraph(paragraph)) {
        const count = words(piece).length
        if (count === 0) continue

        // Starting a passage: it begins on this page, whatever the
        // overlap carried in from the last one.
        if (heldWords === 0 || held.length === 0) pageFrom = page
        // A carried tail belongs to the previous page, but the passage
        // it opens is about to be mostly this one.
        else if (held.length === 1 && heldWords <= OVERLAP_WORDS) pageFrom = page

        if (heldWords > 0 && heldWords + count > MAX_WORDS) {
          flush()
          pageFrom = page
        }

        held.push(piece)
        heldWords += count
        pageTo = page

        if (heldWords >= TARGET_WORDS) {
          flush()
          pageTo = page
        }
      }
    }
  }

  // Whatever is left, unless it is only the overlap from the last
  // flush -- that is not a passage, it is a repeat of one.
  const remaining = held.join('\n\n').trim()
  if (remaining && words(remaining).length > OVERLAP_WORDS) flush()

  return out
}

/**
 * How many pages a round should attempt.
 *
 * The budget is what is left of the function's minute, and the cost per
 * page is measured from the pages already done rather than guessed --
 * a page of a novel and a page of a manual are not the same work, and
 * the only honest estimate is this document's own rate. Before anything
 * has been measured it takes a small bite, because being wrong about a
 * dense book is expensive and being wrong about a light one costs one
 * extra round.
 *
 * Never zero: a round that attempts nothing is a job that never
 * finishes, and one page at a time still terminates.
 */
export function pagesThisRound({
  remaining,
  msLeft,
  msPerPage,
}: {
  remaining: number
  msLeft: number
  msPerPage: number | null
}): number {
  const rate = msPerPage && msPerPage > 0 ? msPerPage : 900
  const affordable = Math.floor(msLeft / rate)
  return Math.max(1, Math.min(remaining, affordable))
}
