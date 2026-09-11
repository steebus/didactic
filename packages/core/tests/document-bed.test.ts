import { describe, it, expect } from 'vitest'
import {
  flattenChapters,
  bedEdgesFromOutline,
  printOutline,
  MAX_TOPICS,
} from '../src/documentBed'
import type { OutlineEntry } from '../src/passages'

const handbook: OutlineEntry[] = [
  {
    title: 'Openings',
    pageFrom: 2,
    pageTo: 20,
    children: [
      { title: 'First moves', pageFrom: 4, pageTo: 12 },
      { title: 'Traps', pageFrom: 13, pageTo: 20 },
    ],
  },
  { title: 'Middles', pageFrom: 21, pageTo: 60 },
  { title: 'Endings', pageFrom: 61, pageTo: 90 },
]

describe('flattenChapters', () => {
  it('runs in reading order, chapters and their sections', () => {
    expect(flattenChapters(handbook).map(c => c.title)).toEqual([
      'Openings',
      'First moves',
      'Traps',
      'Middles',
      'Endings',
    ])
  })

  it('remembers what each entry sits under', () => {
    const flat = flattenChapters(handbook)

    expect(flat.find(c => c.title === 'First moves')).toMatchObject({
      depth: 1,
      parent: 'Openings',
    })
    expect(flat.find(c => c.title === 'Middles')).toMatchObject({ depth: 0, parent: null })
  })

  it('orders by page, not by how the document listed them', () => {
    const jumbled: OutlineEntry[] = [
      { title: 'Later', pageFrom: 40, pageTo: 60 },
      { title: 'Earlier', pageFrom: 1, pageTo: 39 },
    ]
    expect(flattenChapters(jumbled).map(c => c.title)).toEqual(['Earlier', 'Later'])
  })

  it('stops at a chapter and its sections, however deep the document goes', () => {
    const deep: OutlineEntry[] = [
      {
        title: 'One',
        pageFrom: 1,
        pageTo: 50,
        children: [
          {
            title: 'One point one',
            pageFrom: 2,
            pageTo: 20,
            children: [{ title: 'One point one point one', pageFrom: 3, pageTo: 9 }],
          },
        ],
      },
    ]
    const flat = flattenChapters(deep)

    expect(flat.map(c => c.title)).toEqual(['One', 'One point one'])
    expect(flat.every(c => c.depth <= 1)).toBe(true)
  })

  it('falls back to the chapters alone rather than sowing half a book', () => {
    // A reference work with more bookmarked sections than anyone can
    // read as a bed. Taking the first sixty in order would sow the
    // first third of it and call that the subject.
    const huge: OutlineEntry[] = Array.from({ length: 40 }, (_, i) => ({
      title: `Chapter ${i}`,
      pageFrom: i * 10 + 1,
      pageTo: i * 10 + 10,
      children: [
        { title: `Chapter ${i}, part a`, pageFrom: i * 10 + 2, pageTo: i * 10 + 5 },
        { title: `Chapter ${i}, part b`, pageFrom: i * 10 + 6, pageTo: i * 10 + 10 },
      ],
    }))

    const flat = flattenChapters(huge)

    expect(flat.length).toBeLessThanOrEqual(MAX_TOPICS)
    expect(flat.every(c => c.depth === 0)).toBe(true)
    // The last chapter survives, which is the whole point of dropping
    // the sections rather than truncating the list.
    expect(flat.map(c => c.title)).toContain('Chapter 39')
  })

  it('drops an entry with no title rather than sowing a blank topic', () => {
    const flat = flattenChapters([
      { title: '   ', pageFrom: 1, pageTo: 4 },
      { title: 'Real', pageFrom: 5, pageTo: 9 },
    ])
    expect(flat.map(c => c.title)).toEqual(['Real'])
  })
})

describe('bedEdgesFromOutline', () => {
  const flat = flattenChapters(handbook)
  const named = new Map([
    ['Openings', 't-open'],
    ['First moves', 't-first'],
    ['Traps', 't-traps'],
    ['Middles', 't-middle'],
    ['Endings', 't-end'],
  ])

  it('nests a section under its chapter', () => {
    const edges = bedEdgesFromOutline(flat, named)

    expect(edges).toContainEqual({
      from: 't-open',
      to: 't-first',
      kind: 'specialises',
      weight: 0.8,
    })
  })

  it('says one chapter comes before the next', () => {
    const edges = bedEdgesFromOutline(flat, named).filter(e => e.kind === 'prereq')

    expect(edges).toContainEqual({
      from: 't-open',
      to: 't-middle',
      kind: 'prereq',
      weight: 0.4,
    })
    expect(edges).toContainEqual({
      from: 't-middle',
      to: 't-end',
      kind: 'prereq',
      weight: 0.4,
    })
  })

  it('orders sections against each other, not against another chapter', () => {
    const edges = bedEdgesFromOutline(flat, named).filter(e => e.kind === 'prereq')

    expect(edges).toContainEqual({
      from: 't-first',
      to: 't-traps',
      kind: 'prereq',
      weight: 0.4,
    })
    // A section never leads into the next chapter: they are not siblings.
    expect(edges).not.toContainEqual(
      expect.objectContaining({ from: 't-traps', to: 't-middle' })
    )
  })

  it('claims the nesting harder than the order, because it is the surer claim', () => {
    const edges = bedEdgesFromOutline(flat, named)
    const nesting = edges.find(e => e.kind === 'specialises')!
    const order = edges.find(e => e.kind === 'prereq')!

    expect(nesting.weight).toBeGreaterThan(order.weight)
  })

  it('draws nothing from a chapter the resolver could not place', () => {
    const partial = new Map([
      ['Openings', 't-open'],
      ['Endings', 't-end'],
    ])
    const edges = bedEdgesFromOutline(flat, partial)

    for (const edge of edges) {
      expect(['t-open', 't-end']).toContain(edge.from)
      expect(['t-open', 't-end']).toContain(edge.to)
    }
  })

  it('never draws an edge from a topic to itself', () => {
    // Two chapters that resolved onto one topic, which is ordinary:
    // "Introduction" and "Getting started" are often the same concept.
    const collapsed = new Map([
      ['Openings', 't-same'],
      ['First moves', 't-same'],
      ['Traps', 't-same'],
      ['Middles', 't-same'],
      ['Endings', 't-same'],
    ])
    expect(bedEdgesFromOutline(flat, collapsed)).toEqual([])
  })
})

describe('printOutline', () => {
  it('indents sections under chapters and gives each its pages', () => {
    const printed = printOutline(flattenChapters(handbook))

    expect(printed).toContain('- Openings (pp. 2-20)')
    expect(printed).toContain('  - First moves (pp. 4-12)')
  })

  it('prints a one-page entry as one page', () => {
    const printed = printOutline(
      flattenChapters([{ title: 'A note', pageFrom: 7, pageTo: 7 }])
    )
    expect(printed).toBe('- A note (p. 7)')
  })
})
