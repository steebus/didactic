import { describe, it, expect } from 'vitest'
import {
  bestHits,
  HIT_CLOSE,
  HIT_OPEN,
  saidFrom,
  sectionsLine,
  shelfMatches,
  shelfTerms,
  snippetParts,
  type ShelfHit,
} from '../src/shelf'

const summary = (resource_id: string, section: string | null, note = 'said') => ({
  kind: 'summary',
  section,
  note,
  resource_id,
})

describe('saidFrom', () => {
  it('holds the whole summary and counts the sections, per reading', () => {
    const said = saidFrom(
      [
        summary('a', null, 'The whole of it.'),
        summary('a', 'One'),
        summary('a', 'Two'),
        summary('b', 'Only a section'),
        { kind: 'mark', note: 'not a summary', resource_id: 'a' },
      ],
      'resource_id'
    )
    expect(said.get('a')).toEqual({ whole: 'The whole of it.', sections: 2 })
    expect(said.get('b')).toEqual({ whole: null, sections: 1 })
  })

  it('leaves out a reading with nothing said, and a summary with nothing in it', () => {
    const said = saidFrom([summary('a', null, '  '), { kind: 'mark', note: 'x', resource_id: 'c' }], 'resource_id')
    expect(said.size).toBe(0)
  })

  it('reads lessons by their own column', () => {
    const said = saidFrom([{ kind: 'summary', section: null, note: 'L', lesson_id: 'l' }], 'lesson_id')
    expect(said.get('l')?.whole).toBe('L')
  })
})

describe('sectionsLine', () => {
  it('says how many sections, and nothing for none', () => {
    expect(sectionsLine(1)).toBe('1 section said back')
    expect(sectionsLine(3)).toBe('3 sections said back')
    expect(sectionsLine(0)).toBe('')
  })
})

describe('shelfTerms', () => {
  it('lower-cases, splits and strips the punctuation around words', () => {
    expect(shelfTerms('  "Custody," Broker!  ')).toEqual(['custody', 'broker'])
  })
})

describe('shelfMatches', () => {
  const row = {
    title: 'Custody explained',
    url: 'https://example.com/custody',
    summary: 'How brokers hold assets.',
    kind: 'article',
    topics: [{ title: 'Settlement' }],
    said: { whole: 'The broker keeps a ledger in its name.', sections: 0 },
  }

  it('matches every word somewhere on the row, not all in one place', () => {
    expect(shelfMatches(row, 'custody settlement')).toBe(true)
    expect(shelfMatches(row, 'ledger')).toBe(true)
    expect(shelfMatches(row, 'custody photography')).toBe(false)
  })

  it('matches everything for an empty search', () => {
    expect(shelfMatches(row, '   ')).toBe(true)
  })
})

describe('bestHits', () => {
  it('keeps the reader’s own words over the text', () => {
    const hits: ShelfHit[] = [
      { resourceId: 'a', foundIn: 'text', snippet: 't' },
      { resourceId: 'a', foundIn: 'summary', snippet: 's' },
      { resourceId: 'a', foundIn: 'mark', snippet: 'm' },
      { resourceId: 'b', foundIn: 'text', snippet: 'only text' },
    ]
    const best = bestHits(hits)
    expect(best.get('a')?.foundIn).toBe('summary')
    expect(best.get('b')?.snippet).toBe('only text')
  })
})

describe('snippetParts', () => {
  it('parts a snippet into plain and matched runs', () => {
    expect(snippetParts(`the ${HIT_OPEN}broker${HIT_CLOSE} holds it`)).toEqual([
      { text: 'the ', hit: false },
      { text: 'broker', hit: true },
      { text: ' holds it', hit: false },
    ])
  })

  it('reads an unclosed marker as plain text rather than losing it', () => {
    expect(snippetParts(`a ${HIT_OPEN}b`)).toEqual([
      { text: 'a ', hit: false },
      { text: 'b', hit: false },
    ])
  })
})

describe('byTopic', () => {
  const row = (id: string, ...topics: string[]) => ({
    id,
    topics: topics.map(t => ({ id: t, title: t.toUpperCase() })),
  })

  it('stands each row once, under its first topic', async () => {
    const { byTopic } = await import('../src/shelf')
    const shelves = byTopic([row('a', 'dns', 'tcp'), row('b', 'tcp'), row('c', 'dns')])
    expect(shelves.map(s => [s.topic?.id, s.rows.map(r => r.id)])).toEqual([
      ['dns', ['a', 'c']],
      ['tcp', ['b']],
    ])
  })

  it('puts the fullest shelf first, ties by title, and the unfiled last', async () => {
    const { byTopic } = await import('../src/shelf')
    const shelves = byTopic([row('a'), row('b', 'zed'), row('c', 'abc'), row('d', 'zed')])
    expect(shelves.map(s => s.topic?.id ?? null)).toEqual(['zed', 'abc', null])
  })
})

describe('filedUnder', () => {
  it('finds a topic anywhere in the row, not only first', async () => {
    const { filedUnder } = await import('../src/shelf')
    const r = { topics: [{ id: 'dns' }, { id: 'tcp' }] }
    expect(filedUnder(r, 'tcp')).toBe(true)
    expect(filedUnder(r, 'tls')).toBe(false)
  })
})
