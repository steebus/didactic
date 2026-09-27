import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { readDistribution, NONE, type KeptReading } from '@didactic/core/resolution'
import type { JevVerdict } from '@/lib/llm/jev'

/**
 * The adjudication queue, asking about the pair the reading chose.
 *
 * It used to find the other side itself, as the nearest title, which in
 * this embedding model put "Hash Functions" against "JavaScript". The
 * reading is kept on the topic it queued (059), the queue asks about
 * that pair, and anything queued on its name alone is read again.
 */

const judged = vi.hoisted(() => ({ verdicts: null as Map<string, JevVerdict> | null }))

vi.mock('@/lib/ingest', () => ({
  keyOf: (index: number) => `c${index + 1}`,
  judge: vi.fn(async () => judged.verdicts),
}))
vi.mock('@/lib/resolver', () => ({
  fetchCandidates: vi.fn(async () => [{ id: 'js', title: 'JavaScript', summary: null, embedding: [0, 1] }]),
}))
vi.mock('@/lib/evidence', async () => {
  const empty = { subjects: [], resources: 0, sources: [], lessons: 0, marks: 0, exposures: 0 }
  return { EMPTY_EVIDENCE: empty, gatherEvidence: vi.fn(async () => new Map()) }
})
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: vi.fn() }))

const { rereadPending } = await import('@/lib/pendingReading')
const { readPendingTopics } = await import('@/lib/pending')

/** A small fake: `topics` rows answer selects by id or by state, and
 *  every write is recorded. `match_topics` answers the nearest title. */
function fakeDb(rows: Array<Record<string, unknown>>, nearest: Record<string, unknown> | null = null) {
  const updates: Array<{ id: unknown; row: Record<string, unknown> }> = []
  const filed: Array<Record<string, unknown>> = []
  const from = (table: string) => {
    const where: Record<string, unknown> = {}
    let writing: Record<string, unknown> | null = null
    const q: Record<string, unknown> = {}
    const matching = () =>
      rows.filter(r =>
        Object.entries(where).every(([k, v]) =>
          k === 'user_id' ||
          (v && typeof v === 'object' && 'in' in v ? (v as { in: unknown[] }).in.includes(r[k]) : r[k] === v)
        )
      )
    q.select = () => q
    q.order = () => q
    q.in = (k: string, v: unknown[]) => {
      where[k] = { in: v }
      return q
    }
    q.eq = (k: string, v: unknown) => {
      where[k] = v
      return q
    }
    q.update = (row: Record<string, unknown>) => {
      writing = row
      return q
    }
    q.upsert = async (rowsIn: Array<Record<string, unknown>>) => {
      filed.push(...rowsIn)
      return { error: null }
    }
    q.maybeSingle = async () => ({ data: matching()[0] ?? null, error: null })
    q.then = (resolve: (v: unknown) => void) => {
      if (writing) {
        updates.push({ id: where.id, row: writing })
        return resolve({ error: null })
      }
      return resolve({ data: table === 'topics' ? matching() : [], error: null })
    }
    return q
  }
  const rpc = async () => ({ data: nearest ? [nearest] : [], error: null })
  return { db: { from, rpc } as unknown as SupabaseClient, updates, filed }
}

const verdict = (reading: JevVerdict['reading'], subjects: string[] = []): JevVerdict => ({
  reading,
  subjects,
  probabilities: undefined,
})

beforeEach(() => {
  judged.verdicts = null
})

describe('rereadPending', () => {
  const queued = (id: string, title: string, pending_reading: KeptReading | null = null) => ({
    id,
    title,
    summary: null,
    state: 'pending',
    embedding: '[1,0]',
    pending_reading,
  })

  it('takes out what is its own topic, files it where the reading placed it, and asks the rest against the reading’s choice', async () => {
    judged.verdicts = new Map([
      ['c1', verdict(readDistribution(NONE, { [NONE]: 0.9, js: 0.1 }), ['s-cs'])],
      ['c2', verdict(readDistribution(NONE, { [NONE]: 0.45, js: 0.4 }))],
    ])
    const { db, updates, filed } = fakeDb([queued('hash', 'Hash Functions'), queued('set', 'Set Membership Testing')])

    expect(await rereadPending(db, 'u')).toEqual({ released: 1, read: 1, warning: null })
    expect(updates).toContainEqual({ id: 'hash', row: { state: 'active', pending_reading: expect.objectContaining({ against: null }) } })
    expect(updates).toContainEqual({ id: 'set', row: { pending_reading: { against: 'js', because: 'unsure', probability: 0.4 } } })
    expect(filed).toEqual([{ topic_id: 'hash', subject_id: 's-cs', created_by: 'ai' }])
  })

  it('never merges, even on a reading sure they are one thing', async () => {
    judged.verdicts = new Map([['c1', verdict(readDistribution('js', { js: 0.97, [NONE]: 0.03 }))]])
    const { db, updates } = fakeDb([queued('hash', 'Hash Functions')])
    await rereadPending(db, 'u')
    expect(updates).toEqual([{ id: 'hash', row: { pending_reading: { against: 'js', because: 'sure', probability: 0.97 } } }])
  })

  it('leaves alone what has a reading already, and says why when the reading fails', async () => {
    const { db, updates } = fakeDb([
      queued('set', 'Set', { against: 'js', because: 'unsure', probability: 0.4 }),
      queued('hash', 'Hash'),
      { id: 'js', title: 'JavaScript', state: 'active' },
    ])
    const answer = await rereadPending(db, 'u')
    const { judge } = await import('@/lib/ingest')
    const asked = vi.mocked(judge).mock.lastCall?.[1].searched.map(s => s.concept.name)
    expect(asked).toEqual(['Hash'])
    expect(answer.released + answer.read).toBe(0)
    expect(answer.warning).toMatch(/nothing/)
    expect(updates).toEqual([])
  })

  it('reads again a topic whose chosen partner has since gone', async () => {
    judged.verdicts = new Map([['c1', verdict(readDistribution(NONE, { [NONE]: 0.9, js: 0.1 }))]])
    const { db, updates } = fakeDb([queued('hash', 'Hash Functions', { against: 'merged-away', because: 'unsure', probability: 0.4 })])
    expect((await rereadPending(db, 'u')).released).toBe(1)
    expect(updates[0].id).toBe('hash')
  })

  it('reads nothing before there is a column to keep the reading in', async () => {
    const before059: Record<string, unknown> = { ...queued('hash', 'Hash Functions') }
    delete before059.pending_reading
    const { db } = fakeDb([before059])
    expect(await rereadPending(db, 'u')).toEqual({ released: 0, read: 0, warning: null })
  })
})

describe('readPendingTopics', () => {
  const js = { id: 'js', title: 'JavaScript', summary: 'The language.', embedding: '[0.8,0.6]', state: 'active' }
  const tables = { id: 'tables', title: 'Hash Tables', summary: null, embedding: '[1,0]', state: 'active' }

  it('asks about the topic the reading chose, and says what it read', async () => {
    const kept = { against: 'tables', because: 'unsure', probability: 0.4 }
    const { db } = fakeDb(
      [{ id: 'hash', title: 'Hash Functions', summary: null, state: 'pending', embedding: '[1,0]', pending_reading: kept }, tables, js],
      js
    )
    const [row] = await readPendingTopics(db)
    expect(row.nearest?.title).toBe('Hash Tables')
    expect(row.nearest?.similarity).toBeCloseTo(1)
    expect(row.reading).toMatch(/Nearest match read at 40%/)
  })

  it('falls back to the nearest title, with no reading, where none was kept', async () => {
    const { db } = fakeDb(
      [{ id: 'hash', title: 'Hash Functions', summary: null, state: 'pending', embedding: '[0.8,0.6]', pending_reading: null }, js],
      js
    )
    const [row] = await readPendingTopics(db)
    expect(row.nearest?.title).toBe('JavaScript')
    expect(row.reading).toBeNull()
  })

  it('falls back the same way where the chosen topic has since gone', async () => {
    const kept = { against: 'merged-away', because: 'unsure', probability: 0.4 }
    const { db } = fakeDb(
      [{ id: 'hash', title: 'Hash Functions', summary: null, state: 'pending', embedding: '[0.8,0.6]', pending_reading: kept }, js],
      js
    )
    const [row] = await readPendingTopics(db)
    expect(row.nearest?.title).toBe('JavaScript')
    expect(row.reading).toBeNull()
  })
})
