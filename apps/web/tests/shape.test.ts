import { describe, it, expect, vi } from 'vitest'
import { phraseOf, readLiterature, stillShaped, RESHAPE_DAYS } from '@/lib/shape'

/**
 * How a topic is written about: the phrase searched within its subjects
 * first, and alone where that leaves too little to go on.
 */

/** A literature that answers by how much the expression is narrowed. */
function literature(counts: { within: number; alone: number }) {
  const asked: string[] = []
  const fetchImpl = vi.fn(async (url: string) => {
    const u = new URL(url)
    const filter = u.searchParams.get('filter') ?? ''
    const by = u.searchParams.get('group_by')
    asked.push(`${by}:${filter}`)
    const n = filter.includes(' AND ') ? counts.within : counts.alone
    const groups =
      by === 'type'
        ? [{ key: 'types/software', key_display_name: 'software', count: Math.round(n * 0.3) }]
        : [
            { key: 'a', key_display_name: 'Top', count: Math.round(n * 0.4) },
            { key: 'b', key_display_name: 'Next', count: Math.round(n * 0.2) },
            { key: 'unknown', key_display_name: 'unknown', count: Math.round(n * 0.4) },
          ]
    return new Response(JSON.stringify({ meta: { count: n }, group_by: groups }))
  })
  return { fetchImpl: fetchImpl as unknown as typeof fetch, asked }
}

describe('readLiterature', () => {
  it('reads within the subjects where that is enough, counting shares among placed works', async () => {
    const { fetchImpl, asked } = literature({ within: 500, alone: 90_000 })
    const read = await readLiterature('aperture', ['Photography'], 'k', fetchImpl)
    expect(read.context).toBe('photography')
    expect(read.reading).toEqual({ works: 500, topicShare: 0.667, subfieldShare: 0.667, softwareShare: 0.3 })
    expect(asked.every(a => a.includes('"aperture" AND ("photography")'))).toBe(true)
  })

  it('reads alone where the subjects leave too little', async () => {
    const { fetchImpl } = literature({ within: 5, alone: 70 })
    const read = await readLiterature('react hooks', ['Web Development'], 'k', fetchImpl)
    expect(read.context).toBeNull()
    expect(read.reading.works).toBe(70)
  })

  it('reads alone a topic in no subject', async () => {
    const { fetchImpl, asked } = literature({ within: 0, alone: 40 })
    await readLiterature('bloom filter', [], 'k', fetchImpl)
    expect(asked.some(a => a.includes(' AND '))).toBe(false)
  })
})

describe('phraseOf and stillShaped', () => {
  it('searches a topic by its name, without asides or quotes', () => {
    expect(phraseOf('React Hooks (useState, useEffect)')).toBe('react hooks')
    expect(phraseOf('"Keynesianism": the idea')).toBe('keynesianism the idea')
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
