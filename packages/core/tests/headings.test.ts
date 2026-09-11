import { describe, it, expect } from 'vitest'
import {
  bodySize,
  findHeadings,
  outlineFromLines,
  HEADING_RATIO,
  MIN_HEADINGS,
  MIN_PER_LEVEL,
  type TypedLine,
} from '../src/headings'

/** A line of body text: long, and set in the body size. */
const body = (page: number, size = 7.1): TypedLine => ({
  page,
  size,
  font: 'serif',
  text: 'Essay writing is often seen as an academic exercise, something confined to the classroom.',
})

const head = (page: number, text: string, size = 9.8): TypedLine => ({
  page,
  size,
  font: 'sans-serif',
  text,
})

/** A document of chapters, each with a few paragraphs under it. */
const document = (titles: string[], size = 9.8): TypedLine[] =>
  titles.flatMap((title, i) => [head(i + 1, title, size), body(i + 1), body(i + 1), body(i + 1)])

describe('bodySize', () => {
  it('is the size most of the characters are set in', () => {
    expect(bodySize([body(1), body(1), head(1, 'A heading')])).toBe(7.1)
  })

  it('weighs by characters, not by lines', () => {
    // Forty short headings against a handful of long paragraphs. By
    // line count the headings win and the document decides its own
    // headings are the body, after which nothing is a heading.
    const lines = [
      ...Array.from({ length: 40 }, (_, i) => head(1, `H${i}`)),
      ...Array.from({ length: 8 }, () => body(1)),
    ]
    expect(bodySize(lines)).toBe(7.1)
  })

  it('is nought for a document with no text at all', () => {
    expect(bodySize([])).toBe(0)
  })
})

describe('findHeadings', () => {
  it('finds lines set larger than the body', () => {
    const found = findHeadings(document(['One', 'Two', 'Three']))
    expect(found.map(h => h.text)).toEqual(['One', 'Two', 'Three'])
  })

  it('ignores a line set smaller than the body', () => {
    // A byline, a page number, a share count. Smaller, not larger.
    const lines = [
      ...document(['One', 'Two', 'Three']),
      { page: 1, size: 4.1, font: 'sans-serif', text: 'OCT 26, 2025' },
    ]
    expect(findHeadings(lines).map(h => h.text)).not.toContain('OCT 26, 2025')
  })

  it('ignores a long line, however it is set', () => {
    const lines = [
      ...document(['One', 'Two', 'Three']),
      head(1, 'A'.repeat(200)),
    ]
    expect(findHeadings(lines).every(h => h.text.length < 200)).toBe(true)
  })

  it('ignores a line with no letters in it', () => {
    const lines = [...document(['One', 'Two', 'Three']), head(2, '1592,231')]
    expect(findHeadings(lines).map(h => h.text)).not.toContain('1592,231')
  })

  it('joins a heading that wrapped onto a second line', () => {
    // The failure this prevents: a chapter called "Framework" sitting
    // after one whose title stops mid-phrase.
    const lines = [
      head(1, 'One'),
      body(1),
      head(2, 'Structuring Your Essay: The Freedom Within'),
      head(2, 'Framework'),
      body(2),
      head(3, 'Three'),
      body(3),
    ]
    const found = findHeadings(lines)

    expect(found.map(h => h.text)).toEqual([
      'One',
      'Structuring Your Essay: The Freedom Within Framework',
      'Three',
    ])
  })

  it('keeps two headings apart when prose runs between them', () => {
    const lines = [
      head(1, 'One'),
      body(1),
      head(1, 'Two'),
      body(1),
      head(1, 'Three'),
      body(1),
    ]
    expect(findHeadings(lines).map(h => h.text)).toEqual(['One', 'Two', 'Three'])
  })

  it('drops a size used only once, because a level recurs', () => {
    // The document's own title is the largest thing in the file. Kept
    // as a level it swallows every real heading beneath it.
    const lines = [
      head(1, 'The Beginner’s Guide to Writing Personal Essays', 12),
      ...document(['One', 'Two', 'Three']),
    ]
    const found = findHeadings(lines)

    expect(found.map(h => h.text)).not.toContain(
      'The Beginner’s Guide to Writing Personal Essays'
    )
    expect(found.every(h => h.depth === 0)).toBe(true)
  })

  it('drops a second title further in, not only one on page one', () => {
    // Two articles stitched into one file, which is what an export
    // from a newsletter routinely is. The second title is larger than
    // any heading and sits in the middle.
    const lines = [
      head(1, 'First Article', 12),
      ...document(['One', 'Two', 'Three']),
      head(3, 'The Quiet Mourning of Growing Up', 11.2),
      body(3),
    ]
    const found = findHeadings(lines)

    expect(found.map(h => h.text)).toEqual(['One', 'Two', 'Three'])
  })

  it('ranks two recurring sizes as two levels', () => {
    const lines = [
      head(1, 'One', 9.8),
      body(1),
      head(1, 'Exercise 1', 8),
      body(1),
      head(2, 'Two', 9.8),
      body(2),
      head(2, 'Exercise 2', 8),
      body(2),
    ]
    const found = findHeadings(lines)

    expect(found.filter(h => h.depth === 0).map(h => h.text)).toEqual(['One', 'Two'])
    expect(found.filter(h => h.depth === 1).map(h => h.text)).toEqual([
      'Exercise 1',
      'Exercise 2',
    ])
  })

  it('goes no deeper than it is asked to', () => {
    const lines = [
      head(1, 'A', 12), head(2, 'A2', 12),
      head(1, 'B', 10), head(2, 'B2', 10),
      head(1, 'C', 9), head(2, 'C2', 9),
      body(1), body(2),
    ]
    expect(findHeadings(lines).every(h => h.depth <= 1)).toBe(true)
  })

  it('finds nothing in a document set entirely in one size', () => {
    // A real kind of document, and the honest answer is that it has no
    // structure rather than that every line is a chapter.
    expect(findHeadings([body(1), body(1), body(2), body(2)])).toEqual([])
  })

  it('finds nothing where there is too little to call a structure', () => {
    const lines = [head(1, 'One'), head(2, 'Two'), body(1), body(2)]
    expect(lines.filter(l => l.size > 7.1).length).toBeLessThan(MIN_HEADINGS)
    expect(findHeadings(lines)).toEqual([])
  })

  it('finds nothing in an empty document', () => {
    expect(findHeadings([])).toEqual([])
  })

  it('takes a sub-heading only a shade larger than the body', () => {
    // 8.0 against a 7.1 body is 1.13, which is an ordinary setting and
    // just inside the threshold. If this starts failing, the ratio has
    // been raised too far.
    expect(8 / 7.1).toBeGreaterThan(HEADING_RATIO)
    const lines = [...document(['One', 'Two', 'Three'], 8)]
    expect(findHeadings(lines).length).toBe(3)
  })

  it('needs a size twice before it is a level', () => {
    expect(MIN_PER_LEVEL).toBe(2)
  })
})

describe('outlineFromLines', () => {
  it('nests a sub-heading under the heading above it', () => {
    const lines = [
      head(1, 'One', 9.8), body(1),
      head(1, 'Exercise 1', 8), body(1),
      head(2, 'Two', 9.8), body(2),
      head(2, 'Exercise 2', 8), body(2),
    ]
    const outline = outlineFromLines(lines, 4)

    expect(outline.map(c => c.title)).toEqual(['One', 'Two'])
    expect(outline[0].children?.map(c => c.title)).toEqual(['Exercise 1'])
    expect(outline[1].children?.map(c => c.title)).toEqual(['Exercise 2'])
  })

  it('closes a chapter at the page before the next one starts', () => {
    const outline = outlineFromLines(document(['One', 'Two', 'Three']), 6)

    expect(outline[0].pageTo).toBe(1)
    expect(outline[1].pageTo).toBe(2)
    // The last runs to the end of the document.
    expect(outline[2].pageTo).toBe(6)
  })

  it('keeps a section inside its own chapter', () => {
    const lines = [
      head(1, 'One', 9.8), body(1),
      head(1, 'Exercise 1', 8), body(1),
      head(5, 'Two', 9.8), body(5),
      head(5, 'Exercise 2', 8), body(5),
    ]
    const outline = outlineFromLines(lines, 9)
    const section = outline[0].children?.[0]

    expect(section?.title).toBe('Exercise 1')
    expect(section?.pageTo).toBeLessThanOrEqual(outline[0].pageTo)
  })

  it('promotes a sub-heading that opens the document', () => {
    // Nowhere to nest it. Losing it would be a silent hole in the bed.
    const lines = [
      head(1, 'A small opener', 8), body(1),
      head(2, 'One', 9.8), body(2),
      head(2, 'Exercise 1', 8), body(2),
      head(3, 'Two', 9.8), body(3),
    ]
    const outline = outlineFromLines(lines, 4)

    expect(outline.map(c => c.title)).toContain('A small opener')
    // And the one that did have a chapter above it still nests.
    expect(outline.find(c => c.title === 'One')?.children?.map(k => k.title)).toEqual([
      'Exercise 1',
    ])
  })

  it('gives nothing back for a document with no headings', () => {
    expect(outlineFromLines([body(1), body(2)], 2)).toEqual([])
  })
})
