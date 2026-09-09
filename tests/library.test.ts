import { describe, it, expect, vi } from 'vitest'
import { getLibrary } from '@/lib/library'

/**
 * A stub that answers the three queries getLibrary makes, in whatever
 * order they resolve. Only the shape matters here: the question under
 * test is which rows are called the same thing.
 */
function stubDb(resources: Array<Record<string, unknown>>) {
  return {
    from(table: string) {
      const rows =
        table === 'resources' ? resources : table === 'resource_topics' ? [] : []
      const result = Promise.resolve({ data: rows })
      const chain = {
        select: () => chain,
        eq: () => chain,
        order: () => result,
        then: result.then.bind(result),
      }
      return chain
    },
  } as never
}

const book = (id: string, title: string) => ({
  id,
  title,
  kind: 'book',
  status: 'consumed',
  url: null,
  summary: null,
  added_at: '2026-01-01T00:00:00Z',
})

describe('near-duplicate resources', () => {
  it('calls the same book entered twice the same thing', async () => {
    // The real pair from the library: typed by hand once, looked up
    // later, differing in case, dash and punctuation.
    const rows = await getLibrary(
      stubDb([
        book('a', 'The Little Book of Common Sense Investing - John C Bogle'),
        book('b', 'The little book of common sense investing — John C. Bogle'),
      ])
    )
    expect(rows[0].sameAs.map(s => s.id)).toEqual(['b'])
    expect(rows[1].sameAs.map(s => s.id)).toEqual(['a'])
  })

  it('leaves two different books alone', async () => {
    const rows = await getLibrary(
      stubDb([
        book('a', 'The Little Book of Common Sense Investing - John C Bogle'),
        book('b', 'The Intelligent Investor - Benjamin Graham'),
      ])
    )
    expect(rows[0].sameAs).toEqual([])
    expect(rows[1].sameAs).toEqual([])
  })

  it('matches across a missing subtitle', async () => {
    const rows = await getLibrary(
      stubDb([
        book('a', 'Designing Data-Intensive Applications'),
        book('b', 'Designing Data Intensive Applications — Martin Kleppmann'),
      ])
    )
    expect(rows[0].sameAs).toHaveLength(1)
  })

  it('does not match two books by one author on the author alone', async () => {
    // The failure worth guarding: an author's name is shared by
    // everything they wrote, and merging those would be destructive.
    const rows = await getLibrary(
      stubDb([
        book('a', 'The Intelligent Investor - Benjamin Graham'),
        book('b', 'Security Analysis - Benjamin Graham'),
      ])
    )
    expect(rows[0].sameAs).toEqual([])
  })

  it('flags nothing when the library holds one thing', async () => {
    const rows = await getLibrary(stubDb([book('a', 'Anything at all')]))
    expect(rows[0].sameAs).toEqual([])
  })
})
