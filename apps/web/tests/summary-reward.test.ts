import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * What saying a reading back is worth.
 *
 * The whole of it counts as working with it -- an `applied` exposure on
 * every topic it counts toward -- and only once, however many times the
 * summary is removed and written again. A section is a light mark.
 */
vi.mock('@/lib/scoring', () => ({ recomputeAbility: vi.fn().mockResolvedValue({ ability: 3 }) }))
vi.mock('@/lib/highlights', () => ({ fileTags: vi.fn().mockResolvedValue([]) }))

const { writeSummary } = await import('@/lib/summaries')

/** A small in-memory table store answering the calls these paths make. */
function fakeDb(seed: Record<string, Array<Record<string, unknown>>>) {
  const tables: Record<string, Array<Record<string, unknown>>> = { exposures: [], highlights: [], ...seed }
  let n = 0

  const from = (table: string) => {
    const rows = () => (tables[table] ??= [])
    const filters: Array<(r: Record<string, unknown>) => boolean> = []
    let op: 'select' | 'insert' | 'update' = 'select'
    let payload: Record<string, unknown> = {}

    const run = () => {
      if (op === 'insert') {
        const row = { id: `id${++n}`, ...payload }
        rows().push(row)
        return { data: row, error: null }
      }
      const hit = rows().filter(r => filters.every(f => f(r)))
      if (op === 'update') hit.forEach(r => Object.assign(r, payload))
      return { data: hit, error: null }
    }

    const q: Record<string, unknown> = {
      select: () => q,
      eq: (k: string, v: unknown) => (filters.push(r => r[k] === v), q),
      is: (k: string, v: unknown) => (filters.push(r => (r[k] ?? null) === v), q),
      order: () => q,
      limit: () => q,
      insert: (row: Record<string, unknown>) => ((op = 'insert'), (payload = row), q),
      update: (row: Record<string, unknown>) => ((op = 'update'), (payload = row), q),
      maybeSingle: async () => {
        const { data } = run()
        return { data: Array.isArray(data) ? (data[0] ?? null) : data, error: null }
      },
      single: async () => {
        const { data } = run()
        return { data: Array.isArray(data) ? data[0] : data, error: null }
      },
      then: (resolve: (v: unknown) => void) => resolve(run()),
    }
    return q
  }

  return { db: { from } as unknown as SupabaseClient, tables }
}

let store: ReturnType<typeof fakeDb>

beforeEach(() => {
  store = fakeDb({
    resources: [{ id: 'r', title: 'On custody', user_id: 'u' }],
    resource_topics: [
      { resource_id: 'r', topic_id: 'custody', relevance: 0.9 },
      { resource_id: 'r', topic_id: 'settlement', relevance: 0.5 },
    ],
    lessons: [{ id: 'l', title: 'Custody', topic_id: 'custody', user_id: 'u' }],
  })
})

const whole = (where: { lessonId: string } | { resourceId: string }, note = 'The broker holds it for me.') =>
  writeSummary(store.db, { userId: 'u', where, section: null, sectionAt: null, note })

describe('the whole said back', () => {
  it('counts as working with it, on the lesson’s topic', async () => {
    await whole({ lessonId: 'l' })
    expect(store.tables.exposures).toEqual([
      expect.objectContaining({ topic_id: 'custody', depth: 'applied', source: 'summary', source_id: 'l' }),
    ])
  })

  it('counts on every topic a resource is filed under, as marking it worked does', async () => {
    await whole({ resourceId: 'r' })
    expect(store.tables.exposures.map(e => [e.topic_id, e.depth])).toEqual([
      ['custody', 'applied'],
      ['settlement', 'applied'],
    ])
  })

  it('is earned once, through a rewrite and through removing it and writing another', async () => {
    await whole({ lessonId: 'l' })
    await whole({ lessonId: 'l' }, 'Rewritten, better.')
    store.tables.highlights.length = 0
    await whole({ lessonId: 'l' }, 'Written again from scratch.')
    expect(store.tables.exposures).toHaveLength(1)
  })
})

describe('a section said back', () => {
  it('is a light mark, once', async () => {
    const section = { userId: 'u', where: { lessonId: 'l' }, section: 'Who holds it', sectionAt: 0 }
    await writeSummary(store.db, { ...section, note: 'The broker does.' })
    await writeSummary(store.db, { ...section, note: 'The broker, in its name.' })
    expect(store.tables.exposures).toEqual([
      expect.objectContaining({ topic_id: 'custody', depth: 'marked', source: 'highlight' }),
    ])
  })
})
