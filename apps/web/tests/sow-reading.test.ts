import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * A new subject read against the topics the map already holds.
 *
 * Sowing used to decide reuse on the cosine alone, which cannot tell a
 * rename from a neighbour: "Postgres" against "PostgreSQL" sits below
 * the link bar, so a second subject grew a second topic beside the
 * first. What is checked here is that the reading ingestion asks now
 * decides for sowing too, that the cosine still stands when there is no
 * reading, and that the reading is never let near the minute's end.
 */

const embed = vi.fn()
const fetchCandidates = vi.fn()
const judge = vi.fn()

vi.mock('@/lib/embedding', () => ({ embed }))
vi.mock('@/lib/resolver', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/resolver')>()),
  fetchCandidates,
}))
vi.mock('@/lib/ingest', () => ({ keyOf: (i: number) => `c${i + 1}`, judge }))
vi.mock('@/lib/scoring', () => ({ recomputeAbilities: vi.fn(async () => undefined) }))
vi.mock('@/lib/llm/edges', () => ({ proposeEdges: vi.fn(async () => []) }))

const state = {
  inserted: [] as Array<Record<string, unknown>>,
  upserts: [] as Array<{ table: string; rows: Array<Record<string, unknown>> }>,
}

function fakeDb() {
  return {
    from(table: string) {
      let inserted: Array<Record<string, unknown>> | null = null
      const answer = () => {
        if (table === 'topics' && inserted) {
          return { data: inserted.map((row, i) => ({ id: `new-${i}`, title: row.title })), error: null }
        }
        return { data: [], error: null }
      }
      const q: Record<string, unknown> = {}
      Object.assign(q, {
        select: () => q,
        eq: () => q,
        in: () => q,
        insert: (rows: Array<Record<string, unknown>>) => {
          inserted = rows
          if (table === 'topics') state.inserted = rows
          return q
        },
        upsert: (rows: Array<Record<string, unknown>>) => {
          state.upserts.push({ table, rows })
          return q
        },
        single: async () => answer(),
        maybeSingle: async () => answer(),
        then: (resolve: (v: unknown) => void) => resolve(answer()),
      })
      return q
    },
  }
}

const SUBJECT = { id: 'sub-2', user_id: 'user-1', title: 'Back-end development' }

const MAP = [
  { name: 'Postgres', summary: 'The database.', estimated_level: 2 },
  { name: 'Message queues', summary: 'Work handed off.', estimated_level: 3 },
]

const brief = {
  subject: SUBJECT.title,
  roots: 0,
  confident: '',
  gaps: '',
  depth: '',
  qualifiers: [],
  evidence: [],
  sources: [],
}

// Postgres against PostgreSQL at about 0.85: under RESOLVER_AMBIGUOUS,
// so the cosine alone creates it. Message queues is far from both.
const VECTORS: Record<string, number[]> = {
  Postgres: [1, 0, 0],
  'Message queues': [0, 0, 1],
}
const POSTGRESQL = { id: 'old-pg', title: 'PostgreSQL', summary: null, embedding: [0.85, 0.527, 0] }

const plant = async (left = 60_000) => {
  const { plantMap } = await import('@/lib/sowing')
  return plantMap(fakeDb() as never, SUBJECT, MAP, brief as never, Date.now() + left)
}

const linked = () =>
  state.upserts
    .filter(u => u.table === 'topic_subjects' && u.rows.some(r => r.created_by === 'ai'))
    .flatMap(u => u.rows.map(r => r.topic_id))

beforeEach(() => {
  state.inserted = []
  state.upserts = []
  embed.mockReset().mockImplementation(async (name: string) => VECTORS[name])
  fetchCandidates.mockReset().mockImplementation(async (_db: unknown, vector: number[]) =>
    vector[0] > 0 ? [POSTGRESQL] : []
  )
  judge.mockReset().mockResolvedValue(null)
})

describe('sowing reads its proposals against the map', () => {
  it('reuses a topic the reading calls the same, where the cosine would not', async () => {
    judge.mockResolvedValue(
      new Map([
        ['c1', { reading: { action: 'link', topicId: 'old-pg', probability: 0.93, margin: 0.9, because: 'sure' }, subjects: [] }],
        ['c2', { reading: { action: 'create', probability: 0.97, margin: 0.95, because: 'sure' }, subjects: [] }],
      ])
    )

    const planting = await plant()

    expect(linked()).toEqual(['old-pg'])
    expect(state.inserted.map(t => t.title)).toEqual(['Message queues'])
    expect(planting.linked).toBe(1)
  })

  it('queues what the reading is unsure of, keeping the pair it was unsure about', async () => {
    judge.mockResolvedValue(
      new Map([
        ['c1', { reading: { action: 'pending', nearestId: 'old-pg', probability: 0.6, margin: 0.3, because: 'unsure' }, subjects: [] }],
      ])
    )

    await plant()

    const postgres = state.inserted.find(t => t.title === 'Postgres')!
    expect(postgres.state).toBe('pending')
    expect(postgres.pending_reading).toEqual({ against: 'old-pg', because: 'unsure', probability: 0.6 })
  })

  it('lets the cosine decide when there is no reading', async () => {
    const planting = await plant()

    expect(linked()).toEqual([])
    expect(state.inserted.map(t => [t.title, t.state])).toEqual([
      ['Postgres', 'active'],
      ['Message queues', 'active'],
    ])
    expect(planting.problem).toBeNull()
  })

  it('does not start the reading with too little of the minute left, and says so', async () => {
    const planting = await plant(5_000)

    expect(judge).not.toHaveBeenCalled()
    expect(planting.warnings.some(w => /by name alone/.test(w))).toBe(true)
  })

  it('asks nothing of an empty map', async () => {
    fetchCandidates.mockResolvedValue([])

    await plant()

    expect(judge).not.toHaveBeenCalled()
  })
})
