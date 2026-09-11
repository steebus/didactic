import { describe, it, expect } from 'vitest'
import {
  paragraphs,
  splitLongParagraph,
  tail,
  headingAt,
  cutPassages,
  closeOutline,
  pagesThisRound,
  MAX_WORDS,
  OVERLAP_WORDS,
  type PageText,
  type OutlineEntry,
} from '../src/passages'

/** A page of n words of ordinary prose, in paragraphs of 50. */
const page = (n: number, word = 'word'): string => {
  const paras: string[] = []
  for (let i = 0; i < n; i += 50) {
    paras.push(Array.from({ length: Math.min(50, n - i) }, () => word).join(' '))
  }
  return paras.join('\n\n')
}

const wordsIn = (s: string) => s.trim().split(/\s+/).length

describe('paragraphs', () => {
  it('splits on blank lines', () => {
    expect(paragraphs('one\n\ntwo\n\n\nthree')).toEqual(['one', 'two', 'three'])
  })

  it('gives a page with no blank lines back as one paragraph', () => {
    expect(paragraphs('a single unbroken run of text')).toEqual([
      'a single unbroken run of text',
    ])
  })

  it('drops empty pages rather than returning blanks', () => {
    expect(paragraphs('   \n\n  \n')).toEqual([])
  })
})

describe('splitLongParagraph', () => {
  it('leaves a paragraph under the ceiling alone', () => {
    const text = page(100)
    expect(splitLongParagraph(text)).toEqual([text])
  })

  it('cuts an over-long paragraph on sentence ends', () => {
    const sentence = `${Array.from({ length: 100 }, () => 'word').join(' ')}. `
    const pieces = splitLongParagraph(sentence.repeat(8))

    expect(pieces.length).toBeGreaterThan(1)
    for (const piece of pieces) expect(wordsIn(piece)).toBeLessThanOrEqual(MAX_WORDS)
    // Nothing is dropped on the floor.
    expect(pieces.join(' ').replace(/\s+/g, ' ')).toContain('word word')
  })

  it('cuts a single stopless sentence on words rather than running on', () => {
    const pieces = splitLongParagraph(Array.from({ length: 1200 }, () => 'word').join(' '))

    expect(pieces.length).toBeGreaterThan(1)
    for (const piece of pieces) expect(wordsIn(piece)).toBeLessThanOrEqual(MAX_WORDS)
  })
})

describe('tail', () => {
  it('gives back the last words', () => {
    expect(tail('a b c d e', 2)).toBe('d e')
  })

  it('gives back everything when there is less than asked for', () => {
    expect(tail('a b', 10)).toBe('a b')
  })
})

describe('headingAt', () => {
  const outline: OutlineEntry[] = [
    {
      title: 'One',
      pageFrom: 1,
      pageTo: 20,
      children: [{ title: 'One, part two', pageFrom: 10, pageTo: 20 }],
    },
    { title: 'Two', pageFrom: 21, pageTo: 40 },
  ]

  it('finds the chapter a page sits in', () => {
    expect(headingAt(outline, 25)).toBe('Two')
  })

  it('prefers the deepest entry, because the section says more', () => {
    expect(headingAt(outline, 12)).toBe('One, part two')
    expect(headingAt(outline, 5)).toBe('One')
  })

  it('is null where the outline does not reach', () => {
    expect(headingAt(outline, 99)).toBeNull()
    expect(headingAt([], 1)).toBeNull()
  })
})

describe('cutPassages', () => {
  it('numbers from the ordinal it is given, so a round can resume', () => {
    const pages: PageText[] = [{ page: 41, text: page(900) }]
    const cut = cutPassages(pages, { startOrdinal: 17 })

    expect(cut[0].ordinal).toBe(17)
    expect(cut.map(p => p.ordinal)).toEqual(cut.map((_, i) => 17 + i))
  })

  it('records the page a passage started on, not the index in the round', () => {
    const pages: PageText[] = [
      { page: 100, text: page(400) },
      { page: 101, text: page(400) },
    ]
    const cut = cutPassages(pages)

    expect(cut[0].pageFrom).toBe(100)
    for (const p of cut) {
      expect(p.pageFrom).toBeGreaterThanOrEqual(100)
      expect(p.pageTo).toBeLessThanOrEqual(101)
      expect(p.pageTo).toBeGreaterThanOrEqual(p.pageFrom)
    }
  })

  it('keeps every passage under the ceiling', () => {
    const cut = cutPassages([{ page: 1, text: page(3000) }])

    expect(cut.length).toBeGreaterThan(1)
    for (const p of cut) expect(wordsIn(p.content)).toBeLessThanOrEqual(MAX_WORDS + OVERLAP_WORDS)
  })

  it('carries a tail across the seam so a cut cannot hide a sentence', () => {
    const first = Array.from({ length: 300 }, (_, i) => `alpha${i}`).join(' ')
    const second = Array.from({ length: 300 }, (_, i) => `beta${i}`).join(' ')
    const cut = cutPassages([{ page: 1, text: `${first}\n\n${second}` }])

    expect(cut.length).toBeGreaterThan(1)
    // The second passage opens with the end of the first.
    expect(cut[1].content).toContain('alpha299')
  })

  it('does not emit a passage that is only the carried overlap', () => {
    const cut = cutPassages([{ page: 1, text: page(300) }])
    const last = cut[cut.length - 1]

    expect(wordsIn(last.content)).toBeGreaterThan(OVERLAP_WORDS)
  })

  it('attaches the heading the page falls under', () => {
    const outline: OutlineEntry[] = [{ title: 'Openings', pageFrom: 1, pageTo: 5 }]
    const cut = cutPassages([{ page: 2, text: page(400) }], { outline })

    expect(cut[0].heading).toBe('Openings')
  })

  it('gives nothing back for empty pages', () => {
    expect(cutPassages([{ page: 1, text: '   ' }])).toEqual([])
    expect(cutPassages([])).toEqual([])
  })
})

describe('pagesThisRound', () => {
  it('never attempts nothing, however little time is left', () => {
    expect(pagesThisRound({ remaining: 400, msLeft: 10, msPerPage: 5000 })).toBe(1)
  })

  it('never attempts more than is left of the document', () => {
    expect(pagesThisRound({ remaining: 3, msLeft: 60_000, msPerPage: 10 })).toBe(3)
  })

  it('takes a small bite before anything has been measured', () => {
    const n = pagesThisRound({ remaining: 1000, msLeft: 30_000, msPerPage: null })

    expect(n).toBeGreaterThan(1)
    expect(n).toBeLessThan(60)
  })

  it('takes more of a light document than a dense one', () => {
    const light = pagesThisRound({ remaining: 1000, msLeft: 30_000, msPerPage: 100 })
    const dense = pagesThisRound({ remaining: 1000, msLeft: 30_000, msPerPage: 2000 })

    expect(light).toBeGreaterThan(dense)
  })
})

describe('closeOutline', () => {
  it('ends each entry at the page before the next one starts', () => {
    const closed = closeOutline(
      [
        { title: 'One', pageFrom: 2 },
        { title: 'Two', pageFrom: 9 },
      ],
      20
    )

    expect(closed[0].pageTo).toBe(8)
    // The last runs to the end of what contains it.
    expect(closed[1].pageTo).toBe(20)
  })

  it('never ends an entry before it starts', () => {
    // Two headings on the same page, which a chapter and its first
    // section routinely produce.
    const closed = closeOutline(
      [
        { title: 'One', pageFrom: 4 },
        { title: 'One, part two', pageFrom: 4 },
      ],
      10
    )

    for (const entry of closed) expect(entry.pageTo).toBeGreaterThanOrEqual(entry.pageFrom)
  })

  it('sorts entries a document listed out of order', () => {
    const closed = closeOutline(
      [
        { title: 'Later', pageFrom: 9 },
        { title: 'Earlier', pageFrom: 2 },
      ],
      12
    )

    expect(closed.map(c => c.title)).toEqual(['Earlier', 'Later'])
  })

  it('keeps children that were closed already', () => {
    const closed = closeOutline(
      [{ title: 'One', pageFrom: 1, children: [{ title: 'A', pageFrom: 2, pageTo: 4 }] }],
      10
    )

    expect(closed[0].children?.[0].title).toBe('A')
  })
})
