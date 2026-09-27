import { describe, it, expect, vi } from 'vitest'
import { looseOf, phraseOf, readLiterature, stillShaped, RESHAPE_DAYS } from '@/lib/shape'

/**
 * How a topic is written about: the phrase, then its words, each read
 * alone where it lands in its subjects' literature and within its
 * subjects where it does not.
 */

/** A literature answering each search from a table: how many works,
 *  and which subfield most of them sit in. Anything unlisted is empty. */
function literature(table: Record<string, { works: number; subfield: string }>) {
  const asked: string[] = []
  const fetchImpl = vi.fn(async (url: string) => {
    const u = new URL(url)
    const expr = (u.searchParams.get('filter') ?? '').replace('title_and_abstract.search:', '')
    const by = u.searchParams.get('group_by')
    asked.push(expr)
    const hit = table[expr] ?? { works: 0, subfield: 'None' }
    const n = hit.works
    const groups =
      by === 'type'
        ? [{ key: 'types/software', key_display_name: 'software', count: Math.round(n * 0.1) }]
        : [
            { key: 'a', key_display_name: by === 'primary_topic.subfield.id' ? hit.subfield : 'Top topic', count: Math.round(n * 0.5) },
            { key: 'b', key_display_name: 'Other', count: Math.round(n * 0.25) },
            { key: 'unknown', key_display_name: 'unknown', count: Math.round(n * 0.25) },
          ]
    return new Response(JSON.stringify({ meta: { count: n }, group_by: n > 0 ? groups : [] }))
  })
  return { fetchImpl: fetchImpl as unknown as typeof fetch, asked }
}

describe('readLiterature', () => {
  it('reads a name alone where it lands where it does within its subjects, so its spread there counts', async () => {
    const { fetchImpl } = literature({
      '"web development"': { works: 8000, subfield: 'Information Systems' },
      '"javascript"': { works: 39000, subfield: 'Information Systems' },
      '"javascript" AND ("web development")': { works: 1000, subfield: 'Information Systems' },
    })
    const read = await readLiterature('javascript', ['Web Development'], 'k', fetchImpl)
    expect(read.context).toBeNull()
    expect(read.reading).toMatchObject({ works: 39000, topicShare: 0.667, subfieldShare: 0.667, softwareShare: 0.1 })
  })

  it('reads a word within its subjects where alone it belongs to another literature', async () => {
    // "photography" as a subject is History in the literature; that no
    // longer matters -- the word's own two searches are compared.
    const { fetchImpl } = literature({
      '"photography"': { works: 60000, subfield: 'History' },
      '"aperture"': { works: 300000, subfield: 'Aerospace Engineering' },
      '"aperture" AND ("photography")': { works: 11000, subfield: 'Computer Vision' },
    })
    const read = await readLiterature('aperture', ['Photography'], 'k', fetchImpl)
    expect(read.context).toBe('photography')
    expect(read.reading.works).toBe(11000)
  })

  it('reads a long name by its words where the phrase is not written', async () => {
    const { fetchImpl, asked } = literature({
      '"system design"': { works: 5000, subfield: 'Computer Networks' },
      'message queues asynchronous processing': { works: 296, subfield: 'Computer Networks' },
      'message queues asynchronous processing AND ("system design")': { works: 9, subfield: 'Computer Networks' },
    })
    const read = await readLiterature('message queues & asynchronous processing', ['System Design'], 'k', fetchImpl)
    expect(read.reading).toMatchObject({ works: 296, topicShare: 0.667 })
    expect(read.topTopic).toBe('Top topic')
    expect(read.context).toBeNull()
    expect(asked).toContain('"message queues & asynchronous processing"')
  })

  it('leaves a name unplaced rather than read from the wrong literature', async () => {
    const { fetchImpl } = literature({
      '"essays"': { works: 90000, subfield: 'Literature' },
      'personal reflection essay foundation': { works: 6900, subfield: 'Law' },
      'personal reflection essay foundation AND ("essays")': { works: 4, subfield: 'Literature' },
    })
    const read = await readLiterature('personal reflection as essay foundation', ['Essays'], 'k', fetchImpl)
    expect(read.reading).toEqual({ works: 6900, topicShare: 0, subfieldShare: 0, softwareShare: 0 })
    expect(read.topTopic).toBeNull()
  })

  it('reads an exact phrase alone, where too little is written within its subjects, only if one subfield holds it firmly', async () => {
    const firm = literature({
      '"react hooks"': { works: 70, subfield: 'Information Systems' },
      '"react hooks" AND ("web development")': { works: 5, subfield: 'Information Systems' },
    })
    expect((await readLiterature('react hooks', ['Web Development'], 'k', firm.fetchImpl)).reading.works).toBe(70)
  })

  it('trusts the exact phrase of a topic in no subject, and not its loosened words', async () => {
    const exact = literature({ '"bloom filter"': { works: 5600, subfield: 'Networks' } })
    expect((await readLiterature('bloom filter', [], 'k', exact.fetchImpl)).reading.works).toBe(5600)
    const loose = literature({ 'rate limiting backpressure': { works: 47, subfield: 'Fuel Cells' } })
    expect((await readLiterature('rate limiting & backpressure', [], 'k', loose.fetchImpl)).topTopic).toBeNull()
  })
})

describe('phraseOf, looseOf and stillShaped', () => {
  it('searches a topic by its name, without asides or quotes, and loosens it to its words', () => {
    expect(phraseOf('React Hooks (useState, useEffect)')).toBe('react hooks')
    expect(phraseOf('"Keynesianism": the idea')).toBe('keynesianism the idea')
    expect(looseOf('message queues & asynchronous processing')).toBe('message queues asynchronous processing')
    expect(looseOf('client-server architecture & networking basics')).toBe('client server architecture networking basics')
    expect(looseOf('keynesianism')).toBeNull()
  })

  it('reads a topic again once renamed, or once the reading is old', () => {
    const now = Date.parse('2026-09-28T00:00:00Z')
    const fresh = { phrase: 'bloom filters', probed_at: '2026-09-01T00:00:00Z' }
    expect(stillShaped(fresh, 'Bloom Filters', now)).toBe(true)
    expect(stillShaped(fresh, 'Bloom Filter Variants', now)).toBe(false)
    expect(stillShaped({ ...fresh, probed_at: new Date(now - (RESHAPE_DAYS + 1) * 86_400_000).toISOString() }, 'Bloom Filters', now)).toBe(false)
    expect(stillShaped(null, 'Bloom Filters', now)).toBe(false)
  })
})
