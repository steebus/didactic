import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Brief } from '@/lib/sowing'

/**
 * Laying out a bed that was sown but never planted.
 *
 * The pipeline itself is covered where it lives; what is checked here
 * is the part that is new -- that the second attempt is laid out from
 * what the first one already stored, that it refuses a bed with topics
 * already in it, and that it does not rewrite a reading the user has
 * been shown.
 */

const proposeMap = vi.fn()
const plantMap = vi.fn()

vi.mock('@/lib/sowing', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/sowing')>()),
  proposeMap,
  plantMap,
}))

vi.mock('@/lib/auth', () => ({ ownerId: async () => 'user-1' }))

// Dropping tags needs a request the test does not have.
vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }))

const state = {
  subject: { id: 'sub-1', user_id: 'user-1', title: 'Web application architecture' } as
    | { id: string; user_id: string; title: string }
    | null,
  topics: 0,
  sowing: null as Record<string, unknown> | null,
  updates: [] as Record<string, unknown>[],
}

vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: () => ({
    from(table: string) {
      const q = {
        select: () => q,
        eq: () => q,
        update: (patch: Record<string, unknown>) => {
          state.updates.push(patch)
          return q
        },
        single: async () => ({ data: table === 'subjects' ? state.subject : null, error: null }),
        maybeSingle: async () => ({ data: state.sowing, error: null }),
        // The membership count is awaited on the builder itself.
        then: (resolve: (v: unknown) => void) =>
          resolve({ count: state.topics, data: [], error: null }),
      }
      return q
    },
  }),
}))

const A_MAP = {
  topics: [{ name: 'Caching', summary: 'Where to hold what.', estimated_level: 2 }],
  raw: {},
  problem: null,
  diagnostic: 'stop_reason end_turn, 900 output tokens, 1 recorded, 1 usable',
}

const A_SOWING = {
  roots: 3,
  confident: 'REST APIs and Postgres',
  gaps: 'Message queues',
  depth: 'Enough to work in it',
  qualifiers: [
    { prompt: 'How do you approach caching?', level: 5, probes: 'layers', answer: 'Locally first.' },
  ],
  evidence: [{ resourceId: 'res-1', title: 'Designing Data-Intensive Applications', kind: 'book' }],
  assessment: null as Record<string, unknown> | null,
}

beforeEach(() => {
  proposeMap.mockReset().mockResolvedValue(A_MAP)
  plantMap.mockReset().mockResolvedValue({
    created: [{ id: 't1', title: 'Caching' }],
    linked: 1,
    warnings: [],
    dropped: [],
    problem: null,
  })
  state.subject = { id: 'sub-1', user_id: 'user-1', title: 'Web application architecture' }
  state.topics = 0
  state.sowing = { ...A_SOWING }
  state.updates = []
  process.env.ANTHROPIC_API_KEY = 'test-key'
})

const post = async (id = 'sub-1') => {
  const { POST } = await import('@/app/api/subjects/[id]/resow/route')
  return POST(new Request('http://localhost/api/subjects/sub-1/resow', { method: 'POST' }), {
    params: Promise.resolve({ id }),
  })
}

describe('laying out an empty bed again', () => {
  it('asks from the answers the first attempt stored', async () => {
    const res = await post()
    expect(res.status).toBe(200)

    const brief: Brief = proposeMap.mock.calls[0][0]
    expect(brief.subject).toBe('Web application architecture')
    expect(brief.roots).toBe(3)
    expect(brief.confident).toBe('REST APIs and Postgres')
    expect(brief.gaps).toBe('Message queues')
    expect(brief.depth).toBe('Enough to work in it')
    // The rubric the answers are marked against was stored with them,
    // and is worth nothing if it is dropped on the way back out.
    expect(brief.qualifiers[0].probes).toBe('layers')
    expect(brief.qualifiers[0].answer).toBe('Locally first.')
    expect(brief.evidence[0].resourceId).toBe('res-1')

    expect(await res.json()).toMatchObject({ topicsCreated: 1, linked: 1 })
  })

  it('refuses a bed that already has topics in it', async () => {
    state.topics = 4

    const res = await post()
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/already has topics/)
    expect(proposeMap).not.toHaveBeenCalled()
  })

  it('does not rewrite a reading the user has already been shown', async () => {
    state.sowing = { ...A_SOWING, assessment: { level: 3, note: 'Solid on the basics.' } }

    await post()

    expect(proposeMap.mock.calls[0][1].assess).toBe(false)
    expect(state.updates).toHaveLength(0)
  })

  it('asks for the reading when the first attempt never got one', async () => {
    proposeMap.mockResolvedValue({
      ...A_MAP,
      raw: { assessment: { level: 2, note: 'Thin on caching.', shown: ['REST'], missing: [] } },
    })

    await post()

    expect(proposeMap.mock.calls[0][1].assess).toBe(true)
    // Kept, so the margin can print it beside their own figure.
    expect(state.updates[0]).toMatchObject({ assessed_level: 2 })
  })

  it('lays out from the name alone when nothing was recorded', async () => {
    state.sowing = null

    const res = await post()
    expect(res.status).toBe(200)

    const brief: Brief = proposeMap.mock.calls[0][0]
    expect(brief.subject).toBe('Web application architecture')
    expect(brief.roots).toBeNull()
    expect(brief.qualifiers).toEqual([])
  })

  it('keeps the subject when the planting fails', async () => {
    plantMap.mockResolvedValue({
      created: [],
      linked: 0,
      warnings: [],
      dropped: [],
      problem: 'Nothing could be embedded, so no topic could be placed on the map.',
    })

    const res = await post()
    expect(res.status).toBe(502)
    expect((await res.json()).error).toMatch(/Nothing could be embedded/)
  })

  it('says what came back when the map cannot be read', async () => {
    proposeMap.mockResolvedValue({
      topics: [],
      raw: {},
      problem: 'empty',
      diagnostic: 'stop_reason end_turn, 12 output tokens, 0 recorded, 0 usable',
    })

    const res = await post()
    expect(res.status).toBe(502)
    expect((await res.json()).error).toMatch(/0 recorded, 0 usable/)
    expect(plantMap).not.toHaveBeenCalled()
  })

  it('answers 404 for a subject that is not there', async () => {
    state.subject = null

    const res = await post('nope')
    expect(res.status).toBe(404)
  })
})
