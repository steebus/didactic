/**
 * Finding a document's structure in the way it is set.
 *
 * The last of three ways to learn what a document's parts are, and the
 * one that works on the documents the other two cannot touch. Bookmarks
 * are exact but plenty of files have none. A contents page is nearly as
 * good but only a book prints one. What almost everything has, down to
 * an article exported from a newsletter, is headings -- and on the page
 * a heading is obvious: it is set larger than the words around it, and
 * usually in a different face.
 *
 * That "set larger than the words around it" is the whole method. It
 * needs no model call, costs nothing, and does not guess: the sizes are
 * facts about the file. What it cannot do is read a document that gives
 * its headings no typographic distinction at all, which is a real kind
 * of document and is reported as having no structure rather than having
 * one invented for it.
 *
 * Everything here is arithmetic over lines, so a two-line heading, a
 * document whose title is the biggest thing on page one, and a file
 * where every line is the same size are all written down as tests.
 */

import { closeOutline, type OutlineEntry } from './passages'

/** A line as a parser hands it over, with enough of its typography to
 *  tell a heading from a paragraph. */
export interface TypedLine {
  page: number
  text: string
  size: number
  font: string
}

/**
 * How much larger than the body text a line must be set to count.
 *
 * Twelve per cent. Measured against real documents: body at 7.1pt with
 * headings at 9.8 and sub-headings at 8.0 is an ordinary arrangement,
 * and the sub-heading is only 1.13 times the body. Much above this and
 * the smaller of two heading levels is read as prose; much below it and
 * an emphasised word inside a paragraph starts a chapter.
 */
export const HEADING_RATIO = 1.12

/** Past this a line is a sentence that happens to be set large, not a
 *  heading. Headings are short; that is most of what makes them work. */
export const HEADING_MAX_CHARS = 120

/** Fewer than this and there is no structure worth calling one. A
 *  single large line is a title, and two is a title and a sign-off. */
export const MIN_HEADINGS = 3

/**
 * How many times a size must be used before it counts as a level.
 *
 * Twice. A heading level recurs by definition -- that is the whole of
 * what makes it one -- and a size used exactly once is a title. The
 * document's own on page one, and, in a file that turns out to be two
 * articles stitched together, the second one's further in. Both are set
 * larger than any real heading, so kept as levels they swallow
 * everything: the bed becomes one topic with the whole document nested
 * inside it.
 */
export const MIN_PER_LEVEL = 2

/** Sizes are compared after rounding, because one logical size comes
 *  off a page as 9.8 and 9.799999. */
const bucket = (size: number) => Math.round(size * 10) / 10

/**
 * The size the document's body text is set in.
 *
 * Weighted by how much text is set in it, not by how many lines: a
 * document with forty short headings and thirty long paragraphs would
 * otherwise decide its headings were the body. The body of a document
 * is, by a wide margin, most of its characters.
 */
export function bodySize(lines: TypedLine[]): number {
  const weight = new Map<number, number>()

  for (const line of lines) {
    const size = bucket(line.size)
    if (size <= 0) continue
    weight.set(size, (weight.get(size) ?? 0) + line.text.length)
  }

  let heaviest = 0
  let most = 0
  for (const [size, chars] of weight) {
    if (chars > most) {
      most = chars
      heaviest = size
    }
  }

  return heaviest
}

/**
 * A line that has been judged a heading, with its rank among them.
 *
 * Named for the document rather than called `Heading`, because a
 * heading in `sections` is a heading inside a lesson body and the two
 * are different things that would otherwise collide in the barrel.
 */
export interface DocumentHeading {
  page: number
  text: string
  size: number
  /** 0 for the largest heading size kept, 1 for the next. */
  depth: number
}

/**
 * The headings of a document, in reading order.
 *
 * Three judgements, in order.
 *
 * A line is a candidate if it is set meaningfully larger than the body
 * and is short enough to be a heading rather than a sentence.
 *
 * Consecutive candidates at the same size on the same page are one
 * heading that wrapped. This matters more than it sounds: a heading
 * that runs to two lines is common, and treated as two headings it
 * produces a chapter called "Framework" sitting after a chapter whose
 * title stops mid-phrase.
 *
 * The sizes that survive are then ranked, largest first, and the ones
 * used more than once become the levels. A size used exactly once is a
 * title rather than a level, and is dropped: it is the largest thing in
 * the file, so kept it would make the whole document one chapter with
 * everything else nested inside it.
 */
export function findHeadings(lines: TypedLine[], { maxLevels = 2 } = {}): DocumentHeading[] {
  const body = bodySize(lines)
  if (body <= 0) return []

  const floor = body * HEADING_RATIO

  const candidates = lines.filter(
    line =>
      bucket(line.size) >= bucket(floor) &&
      line.text.length <= HEADING_MAX_CHARS &&
      // A line of digits and punctuation is a page number or a figure
      // caption's number, however it is set.
      /[a-z]/i.test(line.text)
  )

  // Join a heading that wrapped.
  //
  // Walked by index against the candidate list, not against what has
  // been built so far: the test is whether these two were consecutive
  // candidates in the document, and a line that had prose between it
  // and the last heading is a new heading however it is set.
  const joined: TypedLine[] = []
  let previousWasCandidate = false

  for (let i = 0; i < candidates.length; i++) {
    const line = candidates[i]
    const last = joined[joined.length - 1]
    const runsOn =
      previousWasCandidate &&
      last &&
      last.page === line.page &&
      bucket(last.size) === bucket(line.size) &&
      last.text.length + line.text.length <= HEADING_MAX_CHARS

    if (runsOn) {
      last.text = `${last.text} ${line.text}`.replace(/\s+/g, ' ')
    } else {
      joined.push({ ...line })
    }

    // Were these two lines next to each other on the page, with nothing
    // between them? They were if the next candidate is the very next
    // line of the document.
    const next = candidates[i + 1]
    previousWasCandidate = next !== undefined && lines.indexOf(next) === lines.indexOf(line) + 1
  }

  // Which sizes are levels, and which are one-offs.
  //
  // A level recurs -- that is what makes it a level. A size used once
  // is a title: the document's own on page one, and, in a file that
  // turns out to be two articles stitched together, the second one's
  // further in. Kept as levels they take over: the title is the largest
  // thing in the file, so every real heading ends up nested inside it
  // and the bed becomes one topic with everything hidden underneath.
  const used = new Map<number, number>()
  for (const line of joined) {
    const size = bucket(line.size)
    used.set(size, (used.get(size) ?? 0) + 1)
  }

  const levels = [...used.entries()]
    .filter(([, count]) => count >= MIN_PER_LEVEL)
    .map(([size]) => size)
    .sort((a, b) => b - a)
    .slice(0, maxLevels)

  if (levels.length === 0) return []

  const depthOf = new Map(levels.map((size, i) => [size, i]))

  const headings = joined.flatMap(line => {
    const depth = depthOf.get(bucket(line.size))
    if (depth === undefined) return []
    return [{ page: line.page, text: line.text, size: bucket(line.size), depth }]
  })

  return headings.length >= MIN_HEADINGS ? headings : []
}

/**
 * The headings assembled into an outline.
 *
 * A heading one level down belongs to the last one above it. A document
 * that opens with a sub-heading before any chapter has nowhere to put
 * it, so it is promoted rather than dropped -- losing a section because
 * its author started small would be a silent hole in the middle of a
 * bed.
 */
export function outlineFromLines(
  lines: TypedLine[],
  pageCount: number,
  options?: { maxLevels?: number }
): OutlineEntry[] {
  const headings = findHeadings(lines, options)
  if (headings.length === 0) return []

  const chapters: Array<{ title: string; pageFrom: number; kids: OutlineEntry[] }> = []

  for (const heading of headings) {
    if (heading.depth === 0 || chapters.length === 0) {
      chapters.push({ title: heading.text, pageFrom: heading.page, kids: [] })
    } else {
      chapters[chapters.length - 1].kids.push({
        title: heading.text,
        pageFrom: heading.page,
        // Filled in below, once the chapter's own end is known.
        pageTo: heading.page,
      })
    }
  }

  return closeOutline(
    chapters.map((chapter, i) => ({
      title: chapter.title,
      pageFrom: chapter.pageFrom,
      children: closeOutline(
        chapter.kids,
        // A section runs to the end of its chapter, which is the page
        // before the next chapter starts.
        chapters[i + 1] ? Math.max(chapter.pageFrom, chapters[i + 1].pageFrom - 1) : pageCount
      ),
    })),
    pageCount
  )
}
