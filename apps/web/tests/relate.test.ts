import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Drawing a bed's connections after the fact.
 *
 * The pass itself is the sowing's, and is tested where it lives. What
 * is checked here is the part that is new: that a bed with stored
 * embeddings can be read back into something the search can measure,
 * that a bed too small or too bare to relate is told so rather than
 * sent to the model, and that losing the rest of the map costs the
 * outward connections rather than the request.
 */

const drawConnections = vi.fn()
const neighboursOfBed = vi.fn()

vi.mock('@/lib/sowing', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/sowing')>()),
  drawConnections,
  neighboursOfBed,
}))

vi.mock('@/lib/auth', () => ({ ownerId: async () => 'user-1' }))
vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }))

const state = {
  subject: { id: 'sub-1', user_id: 'user-1' } as { id: string; user_id: string } | null,
  memberships: [{ topic_id: 't1' }, { topic_id: 't2' }] as Array<{ topic_id: string }>,
  topics: [] as Array<Record<string, unknown>>,
}

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: () => ({
    from(table: string) {
      const q = {
        select: () => q,
        eq: () => q,
        in: () => q,
        single: async () => ({ data: table === 'subjects' ? state.subject : null, error: null }),
        then: (resolve: (v: unknown) => void) =>
          resolve({
            data: table === 'topic_subjects' ? state.memberships : state.topics,
            error: null,
          }),
      }
      return q
    },
  }),
}))

/** A stored embedding, as PostgREST hands a pgvector column back. */
const VECTOR = JSON.stringify([0.1, 0.2, 0.3])

beforeEach(() => {
  drawConnections.mockReset().mockResolvedValue(7)
  neighboursOfBed.mockReset().mockResolvedValue([{ id: 'other-1', title: 'Indexing' }])
  state.subject = { id: 'sub-1', user_id: 'user-1' }
  state.memberships = [{ topic_id: 't1' }, { topic_id: 't2' }]
  state.topics = [
    { id: 't1', title: 'Caching', embedding: VECTOR },
    { id: 't2', title: 'CDNs', embedding: VECTOR },
  ]
  process.env.ANTHROPIC_API_KEY = 'test-key'
})

const post = async (id = 'sub-1') => {
  const { POST } = await import('@/app/api/subjects/[id]/relate/route')
  return POST(new Request('http://localhost/api/subjects/sub-1/relate', { method: 'POST' }), {
    params: Promise.resolve({ id }),
  })
}

describe('drawing a bed’s connections', () => {
  it('relates the whole bed, and says how much was new', async () => {
    const res = await post()

    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ drawn: 7, considered: 2, warnings: [] })

    const [, userId, topics, neighbours] = drawConnections.mock.calls[0]
    expect(userId).toBe('user-1')
    expect(topics).toEqual([
      { id: 't1', title: 'Caching' },
      { id: 't2', title: 'CDNs' },
    ])
    expect(neighbours).toEqual([{ id: 'other-1', title: 'Indexing' }])
  })

  it('parses the embeddings PostgREST hands back as strings', async () => {
    await post()

    // Characters would score every neighbour at nothing, which is the
    // same fault the resolver had.
    const [, bed] = neighboursOfBed.mock.calls[0]
    expect(bed[0].embedding).toEqual([0.1, 0.2, 0.3])
  })

  it('refuses a bed with nothing to connect', async () => {
    state.memberships = [{ topic_id: 't1' }]

    const res = await post()
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/needs two ends/)
    expect(drawConnections).not.toHaveBeenCalled()
  })

  it('names the embedding function when the topics carry no vectors', async () => {
    state.topics = [
      { id: 't1', title: 'Caching', embedding: null },
      { id: 't2', title: 'CDNs', embedding: null },
    ]

    const res = await post()
    expect(res.status).toBe(502)
    expect((await res.json()).error).toMatch(/embedding function/)
    expect(drawConnections).not.toHaveBeenCalled()
  })

  it('relates the bed to itself when the rest of the map cannot be searched', async () => {
    neighboursOfBed.mockRejectedValue(new Error('match_topics timed out'))

    const res = await post()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(drawConnections.mock.calls[0][3]).toEqual([])
    expect(body.warnings[0]).toMatch(/related only to itself/)
  })

  it('answers 404 for a subject that is not there', async () => {
    state.subject = null

    const res = await post('nope')
    expect(res.status).toBe(404)
  })
})
