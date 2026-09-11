import { describe, it, expect } from 'vitest'
import {
  SOURCE_SCHEME,
  sourceSlug,
  sourceRoster,
  resolveSource,
  citationsIn,
  type SourceLink,
} from '../src/sourceLinks'

const shelf: SourceLink[] = [
  { id: 'a1', title: 'Rules of Play', pageCount: 300 },
  { id: 'b2', title: 'The Elements of Typographic Style', pageCount: 220 },
  { id: 'c3', title: 'A Handbook', pageCount: null },
]

describe('SOURCE_SCHEME', () => {
  it('takes a name with a page', () => {
    const m = SOURCE_SCHEME.exec('source:rules-of-play#p112')
    expect(m?.[1]).toBe('rules-of-play')
    expect(m?.[2]).toBe('112')
  })

  it('takes a name without one', () => {
    const m = SOURCE_SCHEME.exec('source:rules-of-play')
    expect(m?.[1]).toBe('rules-of-play')
    expect(m?.[2]).toBeUndefined()
  })

  it('refuses anything that is not the scheme', () => {
    expect(SOURCE_SCHEME.exec('https://example.com')).toBeNull()
    expect(SOURCE_SCHEME.exec('lesson:settlement-and-custody')).toBeNull()
    expect(SOURCE_SCHEME.exec('source:')).toBeNull()
  })
})

describe('sourceSlug', () => {
  it('slugs a title the way a heading is slugged', () => {
    expect(sourceSlug('Rules of Play')).toBe('rules-of-play')
  })

  it('folds accents, so one document has one name', () => {
    expect(sourceSlug('Café Culture')).toBe(sourceSlug('Cafe Culture'))
  })
})

describe('sourceRoster', () => {
  it('names every document on the shelf', () => {
    const roster = sourceRoster(shelf)
    expect(roster.get('rules-of-play')?.id).toBe('a1')
    expect(roster.get('a-handbook')?.id).toBe('c3')
  })

  it('gives a shared name to the first given, because the caller ordered them', () => {
    const roster = sourceRoster([
      { id: 'first', title: 'A Handbook' },
      { id: 'second', title: 'A Handbook' },
    ])
    expect(roster.get('a-handbook')?.id).toBe('first')
  })
})

describe('resolveSource', () => {
  const roster = sourceRoster(shelf)

  it('points at the page', () => {
    expect(resolveSource(roster, 'rules-of-play', 112)).toEqual({
      href: '/source/a1?page=112',
      label: 'Rules of Play, page 112',
      page: 112,
    })
  })

  it('points at the whole document where there is no page', () => {
    expect(resolveSource(roster, 'rules-of-play', null)).toEqual({
      href: '/source/a1',
      label: 'Rules of Play',
      page: null,
    })
  })

  it('is null for a name nothing answers to', () => {
    expect(resolveSource(roster, 'a-book-nobody-filed', 1)).toBeNull()
  })

  it('refuses a page past the end, because that citation was invented', () => {
    expect(resolveSource(roster, 'rules-of-play', 900)).toBeNull()
    expect(resolveSource(roster, 'rules-of-play', 0)).toBeNull()
  })

  it('allows any page where the length is not known', () => {
    expect(resolveSource(roster, 'a-handbook', 900)?.page).toBe(900)
  })
})

describe('citationsIn', () => {
  it('finds every citation a body makes', () => {
    const body = [
      'The [classic statement](source:rules-of-play#p112) of it.',
      'And [another](source:a-handbook#p9), plus [the work itself](source:rules-of-play).',
    ].join('\n\n')

    expect(citationsIn(body)).toEqual([
      { slug: 'rules-of-play', page: 112 },
      { slug: 'a-handbook', page: 9 },
      { slug: 'rules-of-play', page: null },
    ])
  })

  it('ignores ordinary links', () => {
    expect(citationsIn('[a link](https://example.com) and [a lesson](lesson:custody)')).toEqual([])
  })

  it('finds nothing in a body that cites nothing', () => {
    expect(citationsIn('Just prose.')).toEqual([])
  })
})
