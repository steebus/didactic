import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readDistribution, NONE } from '@didactic/core/resolution'
import type { JevVerdict } from '@/lib/llm/jev'

/**
 * Accepting a proposed topic reads it against the map first. It was the
 * one way onto the map that asked nothing: a proposal was written as a
 * new topic however plainly it was one already there.
 */

const state = vi.hoisted(() => ({
  verdict: null as JevVerdict | null,
  writes: [] as Array<{ table: string; op: string; row: unknown }>,
}))

vi.mock('@/lib/auth', () => ({ ownerId: vi.fn(async () => 'u') }))
vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }))
vi.mock('@/lib/embedding', () => ({ embed: vi.fn(async () => [1, 0]) }))
vi.mock('@/lib/ingest', () => ({
  keyOf: (i: number) => `c${i + 1}`,
  judge: vi.fn(async () => (state.verdict ? new Map([['c1', state.verdict]]) : null)),
}))
vi.mock('@/lib/resolver', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/resolver')>()),
  fetchCandidates: vi.fn(async () => [{ id: 'bloom', title: 'Bloom Filters', summary: null, embedding: [0.6, 0.8] }]),
}))
vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: () => ({
    from: (table: string) => {
      const q: Record<string, unknown> = {}
      let op = 'select'
      let row: unknown
      q.select = () => q
      q.eq = () => q
      q.insert = (r: unknown) => ((op = 'insert'), (row = r), q)
      q.update = (r: unknown) => ((op = 'update'), (row = r), q)
      q.upsert = async (r: unknown) => (state.writes.push({ table, op: 'upsert', row: r }), { error: null })
      q.maybeSingle = async () => ({ data: table === 'conversations' ? { id: 'conv' } : null, error: null })
      q.single = async () => (state.writes.push({ table, op, row }), { data: { id: 'new-topic' }, error: null })
      q.then = (resolve: (v: unknown) => void) => (state.writes.push({ table, op, row }), resolve({ error: null }))
      return q
    },
  }),
}))

const { POST } = await import('@/app/api/ask/[id]/accept/route')
const accept = () =>
  POST(new Request('http://x/api/ask/conv/accept', { method: 'POST', body: JSON.stringify({ name: 'Bloom filter', summary: 'A probabilistic set.' }) }), {
    params: Promise.resolve({ id: 'conv' }),
  })
const verdict = (reading: JevVerdict['reading'], subjects: string[] = []): JevVerdict => ({ reading, subjects, probabilities: undefined })

beforeEach(() => {
  state.writes = []
  state.verdict = null
})

describe('accepting a proposed topic', () => {
  it('opens the topic already there, and writes nothing', async () => {
    state.verdict = verdict(readDistribution('bloom', { bloom: 0.96, [NONE]: 0.04 }))
    // guardScope is asked by judgeWithJev; here the reading arrives settled.
    expect(await (await accept()).json()).toEqual({ outcome: 'existing', topicId: 'bloom', title: 'Bloom Filters' })
    expect(state.writes.filter(w => w.op !== 'select')).toEqual([])
  })

  it('queues one the reading is unsure of, with what it was unsure about', async () => {
    state.verdict = verdict(readDistribution(NONE, { [NONE]: 0.45, bloom: 0.4 }))
    expect(await (await accept()).json()).toEqual({ outcome: 'queued', topicId: 'new-topic' })
    expect(state.writes).toContainEqual(expect.objectContaining({ table: 'topics', op: 'insert', row: expect.objectContaining({ state: 'pending' }) }))
    expect(state.writes).toContainEqual({ table: 'topics', op: 'update', row: { pending_reading: { against: 'bloom', because: 'unsure', probability: 0.4 } } })
    expect(state.writes.some(w => w.table === 'topic_subjects')).toBe(false)
  })

  it('adds a new one, filed where the reading placed it', async () => {
    state.verdict = verdict(readDistribution(NONE, { [NONE]: 0.9, bloom: 0.1 }), ['cs'])
    expect(await (await accept()).json()).toEqual({ outcome: 'added', topicId: 'new-topic', filed: 1 })
    expect(state.writes).toContainEqual(expect.objectContaining({ table: 'topics', op: 'insert', row: expect.objectContaining({ state: 'active' }) }))
    expect(state.writes).toContainEqual({ table: 'topic_subjects', op: 'upsert', row: [{ topic_id: 'new-topic', subject_id: 'cs', created_by: 'ai' }] })
  })
})
