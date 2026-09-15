import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/llm/diary', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/llm/diary')>()),
  readEntry: vi.fn(),
}))
vi.mock('@/lib/scoring', () => ({
  recomputeAbilities: vi.fn().mockResolvedValue(undefined),
  recomputeAbility: vi.fn().mockResolvedValue(undefined),
}))

/**
 * A client that answers each table with what the case says, whatever
 * chain of filters is put in front of it.
 */
function mockDb(tables: {
  entry: Record<string, unknown>
  tags?: Array<{ topic_id: string; topic: { id: string; title: string } }>
  home?: { id: string; title: string } | null
}) {
  const inserted: unknown[] = []
  const chain = (table: string) => {
    const answer = () =>
      table === 'highlights' ? tables.entry
        : table === 'topics' ? tables.home ?? null
          : table === 'highlight_tags' ? tables.tags ?? []
            : null
    const api: Record<string, unknown> = {
      select: () => api,
      eq: () => api,
      not: () => api,
      delete: () => api,
      maybeSingle: async () => ({ data: answer() }),
      insert: async (rows: unknown[]) => {
        inserted.push(...rows)
        return { error: null }
      },
      then: (resolve: (v: unknown) => void) => resolve({ data: answer(), error: null }),
    }
    return api
  }
  return { from: chain, inserted }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('reading an entry back', () => {
  it('reads it against the topic it was written from, which it need not name', async () => {
    // The production case: written on a topic's own sheet, about that
    // topic, naming nothing -- so it was indexed as naming nothing, read
    // against nothing, and never reached the figure beside it.
    const { readEntry } = await import('@/lib/llm/diary')
    vi.mocked(readEntry).mockResolvedValue([
      { topicId: 'perf', verdict: 'applied', because: 'shipped the lazy loading' },
    ])
    const db = mockDb({
      entry: { id: 'd1', note: 'Shipped the lazy loading today.', kind: 'diary', user_id: 'u1', topic_id: 'perf' },
      home: { id: 'perf', title: 'Web Performance Optimization' },
    })

    const { readBack } = await import('@/lib/diary')
    const { recorded } = await readBack(db as never, 'u1', 'd1')

    expect(readEntry).toHaveBeenCalledWith('Shipped the lazy loading today.', [
      { id: 'perf', title: 'Web Performance Optimization', writtenFrom: true },
    ])
    expect(recorded).toBe(1)
    expect(db.inserted[0]).toMatchObject({ topic_id: 'perf', source: 'diary', depth: 'applied' })
  })

  it('does not ask twice about a topic the entry both names and was written from', async () => {
    const { readEntry } = await import('@/lib/llm/diary')
    vi.mocked(readEntry).mockResolvedValue([])
    const db = mockDb({
      entry: { id: 'd1', note: 'x', kind: 'diary', user_id: 'u1', topic_id: 'perf' },
      tags: [{ topic_id: 'perf', topic: { id: 'perf', title: 'Web Performance Optimization' } }],
      home: { id: 'perf', title: 'Web Performance Optimization' },
    })

    const { readBack } = await import('@/lib/diary')
    await readBack(db as never, 'u1', 'd1')

    expect(vi.mocked(readEntry).mock.calls[0][1]).toEqual([
      { id: 'perf', title: 'Web Performance Optimization' },
    ])
  })

  it('still reads nothing for an entry filed nowhere that names nothing', async () => {
    const { readEntry } = await import('@/lib/llm/diary')
    const db = mockDb({
      entry: { id: 'd1', note: 'x', kind: 'diary', user_id: 'u1', topic_id: null },
    })

    const { readBack } = await import('@/lib/diary')
    expect(await readBack(db as never, 'u1', 'd1')).toEqual({ recorded: 0 })
    expect(readEntry).not.toHaveBeenCalled()
  })
})
