import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { readOutline, readPages, extractFromPdf } from '@/lib/extract/pdf'
import { cutPassages } from '@didactic/core/passages'

/**
 * Read against real PDFs rather than a mocked parser.
 *
 * The whole risk in this module is what a parser does with an actual
 * file -- whether a bookmark resolves to the page it claims, whether a
 * range comes back numbered the way the reader counts. A fake that
 * returns what we hoped for tests nothing.
 *
 * Both fixtures are built by `fixtures/make-pdf.mjs`, by hand, so they
 * are not produced by the library under test.
 */
const handbook = readFileSync(join(__dirname, 'fixtures/handbook.pdf'))
const unbookmarked = readFileSync(join(__dirname, 'fixtures/unbookmarked.pdf'))

describe('readOutline', () => {
  it('reads a document own bookmarks, resolved to real pages', async () => {
    const outline = await readOutline({ buffer: handbook })

    expect(outline.source).toBe('bookmarks')
    expect(outline.pageCount).toBe(5)
    expect(outline.chapters.map(c => [c.title, c.pageFrom])).toEqual([
      ['Openings', 2],
      ['Middles', 3],
      ['Endings', 5],
    ])
  })

  it('keeps the nesting, because a section is the better heading', async () => {
    const { chapters } = await readOutline({ buffer: handbook })
    const middles = chapters.find(c => c.title === 'Middles')

    expect(middles?.children?.map(c => c.title)).toEqual(['Middles, continued'])
    expect(middles?.children?.[0].pageFrom).toBe(4)
  })

  it('closes each chapter at the page before the next one starts', async () => {
    const { chapters } = await readOutline({ buffer: handbook })

    expect(chapters.find(c => c.title === 'Openings')?.pageTo).toBe(2)
    expect(chapters.find(c => c.title === 'Middles')?.pageTo).toBe(4)
    // The last runs to the end of the document.
    expect(chapters.find(c => c.title === 'Endings')?.pageTo).toBe(5)
  })

  it('says so plainly when a document carries no bookmarks', async () => {
    const outline = await readOutline({ buffer: unbookmarked })

    expect(outline.source).toBe('none')
    expect(outline.chapters).toEqual([])
    expect(outline.pageCount).toBe(3)
  })
})

describe('readPages', () => {
  it('numbers pages as the reader counts them, not as the round indexes them', async () => {
    const { pages, total } = await readPages({ buffer: handbook }, { from: 2, to: 3 })

    expect(total).toBe(5)
    expect(pages.map(p => p.page)).toEqual([2, 3])
    expect(pages[0].text).toContain('Openings')
    expect(pages[1].text).toContain('Middles')
  })

  it('reads the whole document when no range is given', async () => {
    const { pages } = await readPages({ buffer: handbook })
    expect(pages.map(p => p.page)).toEqual([1, 2, 3, 4, 5])
  })

  it('gives a later round exactly the pages it asked for', async () => {
    const { pages } = await readPages({ buffer: handbook }, { from: 5, to: 5 })

    expect(pages.map(p => p.page)).toEqual([5])
    expect(pages[0].text).toContain('ending sentence')
  })
})

describe('extractFromPdf', () => {
  it('still answers with the whole text, as the ingester has always had it', async () => {
    const { text } = await extractFromPdf(handbook)

    expect(text).toContain('Openings')
    expect(text).toContain('ending sentence 0')
  })
})

describe('reading a document in rounds', () => {
  it('loses nothing at the seam between two rounds', async () => {
    const { chapters } = await readOutline({ buffer: handbook })

    const whole = await readPages({ buffer: handbook })
    const inOne = cutPassages(whole.pages, { outline: chapters })

    // Two rounds, the second carrying on from the first's ordinal.
    const first = await readPages({ buffer: handbook }, { from: 1, to: 3 })
    const cutA = cutPassages(first.pages, { outline: chapters })
    const second = await readPages({ buffer: handbook }, { from: 4, to: 5 })
    const cutB = cutPassages(second.pages, { outline: chapters, startOrdinal: cutA.length })

    const inRounds = [...cutA, ...cutB]

    // The packing differs, and is allowed to: a round that ends at page
    // 3 closes its last passage there, where reading straight through
    // would have carried on into page 4. So the counts need not match.
    //
    // What must hold is that nothing is lost. A word that falls in the
    // seam between two rounds is a word no lesson can ever cite and no
    // reader can ever be sent to, and it would go unnoticed forever --
    // the document would simply be quietly missing a paragraph.
    const sourceWords = whole.pages.flatMap(p => p.text.split(/\s+/)).filter(Boolean)
    const carried = inRounds.map(p => p.content).join(' ')
    for (const word of new Set(sourceWords)) expect(carried).toContain(word)

    // Ordinals run unbroken, because that is what the next round
    // resumes from and what `unique (resource_id, ordinal)` rests on.
    expect(inRounds.map(p => p.ordinal)).toEqual(inRounds.map((_, i) => i))

    const pagesCovered = new Set(inRounds.flatMap(p => [p.pageFrom, p.pageTo]))
    for (const page of [2, 3, 4, 5]) expect(pagesCovered.has(page)).toBe(true)

    // And reading it straight through loses nothing either.
    const wholeCarried = inOne.map(p => p.content).join(' ')
    for (const word of new Set(sourceWords)) expect(wholeCarried).toContain(word)
  })

  it('files passages under the chapter they fall in', async () => {
    const { chapters } = await readOutline({ buffer: handbook })
    const { pages } = await readPages({ buffer: handbook }, { from: 5, to: 5 })
    const cut = cutPassages(pages, { outline: chapters })

    expect(cut.length).toBeGreaterThan(0)
    expect(cut[0].heading).toBe('Endings')
  })

  it('gives every passage a page a citation could print', async () => {
    const { pages } = await readPages({ buffer: handbook })
    const cut = cutPassages(pages)

    for (const passage of cut) {
      expect(passage.pageFrom).toBeGreaterThanOrEqual(1)
      expect(passage.pageTo).toBeLessThanOrEqual(5)
      expect(passage.pageTo).toBeGreaterThanOrEqual(passage.pageFrom)
    }
  })
})
