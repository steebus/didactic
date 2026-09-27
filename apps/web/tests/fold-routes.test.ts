import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Folding and promoting, undoable (062), as the routes see it: a fold
 * where the migration has run and the old one-way demote where it has
 * not, and a clear refusal when there is nothing to undo.
 */

const db = vi.hoisted(() => ({
  rpc: {} as Record<string, { data?: unknown; error?: { code?: string; message: string } | null }>,
  rows: {} as Record<string, unknown>,
  called: [] as string[],
}))

vi.mock('@/lib/auth', () => ({ ownerId: vi.fn(async () => 'u') }))
vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }))
vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: () => ({
    rpc: async (fn: string) => (db.called.push(fn), db.rpc[fn] ?? { data: null, error: null }),
    from: (table: string) => {
      const q: Record<string, unknown> = {}
      for (const m of ['select', 'eq', 'in', 'is', 'order', 'limit']) q[m] = () => q
      q.maybeSingle = async () => ({ data: db.rows[table] ?? null, error: null })
      q.then = (resolve: (v: unknown) => void) =>
        resolve({ data: table === 'topics' ? [{ id: 'c', title: 'Child' }, { id: 'p', title: 'Parent' }] : [], error: null })
      return q
    },
  }),
}))

const demote = (await import('@/app/api/topics/[id]/demote/route')).POST
const unfold = (await import('@/app/api/topics/[id]/unfold/route')).POST
const unpromote = (await import('@/app/api/subjects/[id]/unpromote/route')).POST
type Handler = (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>
const call = (handler: Handler, id: string, body: unknown = {}) =>
  handler(new Request('http://x', { method: 'POST', body: JSON.stringify(body) }), { params: Promise.resolve({ id }) })

beforeEach(() => {
  db.rpc = {}
  db.rows = {}
  db.called = []
})

describe('the demote route', () => {
  it('folds, and says which fold undoes it', async () => {
    db.rpc.fold_topic_into = { data: 'fold-1', error: null }
    db.rows.topic_folds = { lesson_id: 'lesson-1' }
    const res = await call(demote, 'c', { intoTopicId: 'p' })
    expect(await res.json()).toEqual({ lessonId: 'lesson-1', intoTopicId: 'p', intoTitle: 'Parent', foldId: 'fold-1' })
    expect(db.called).toEqual(['fold_topic_into'])
  })

  it('falls back to the one-way demote before 062', async () => {
    db.rpc.fold_topic_into = { error: { code: 'PGRST202', message: 'no such function' } }
    db.rpc.demote_topic_into = { data: 'lesson-2', error: null }
    const res = await call(demote, 'c', { intoTopicId: 'p' })
    expect(await res.json()).toMatchObject({ lessonId: 'lesson-2', foldId: null })
    expect(db.called).toEqual(['fold_topic_into', 'demote_topic_into'])
  })
})

describe('undoing', () => {
  it('unfolds the open fold of a topic, by the topic’s own id', async () => {
    db.rows.topic_folds = { id: 'fold-1' }
    const res = await call(unfold, 'c')
    expect(res.status).toBe(200)
    expect(db.called).toEqual(['unfold_topic'])
  })

  it('says so when there is nothing to unfold', async () => {
    const res = await call(unfold, 'c')
    expect(res.status).toBe(404)
    expect(db.called).toEqual([])
  })

  it('puts a promotion back, and says when 062 has not run', async () => {
    db.rows.subjects = { id: 's' }
    db.rpc.unpromote_subject = { data: 'p', error: null }
    expect(await (await call(unpromote, 's')).json()).toEqual({ topicId: 'p' })
    db.rpc.unpromote_subject = { error: { code: 'PGRST202', message: 'no such function' } }
    expect((await call(unpromote, 's')).status).toBe(503)
  })
})
