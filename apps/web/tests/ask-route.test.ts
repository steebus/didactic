import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * The routes, at their edges.
 *
 * What is tested here is what the model never sees: who is let in, what
 * a malformed body does, and whether an undo can be pressed twice. The
 * turn itself is covered in `ask-agent.test.ts` against a fake model.
 */

const ownerId = vi.fn(async () => 'user-1' as string | null)
const askTurn = vi.fn()

vi.mock('@/lib/auth', () => ({ ownerId: () => ownerId() }))
vi.mock('@/lib/llm/ask', async importOriginal => {
  const real = await importOriginal<typeof import('@/lib/llm/ask')>()
  return { ...real, askTurn: (...args: unknown[]) => askTurn(...args) }
})
vi.mock('next/cache', () => ({ revalidateTag: vi.fn() }))
// A topic is not written without one, so the double answers instantly
// rather than reaching for the edge function.
vi.mock('@/lib/embedding', () => ({ embed: vi.fn(async () => new Array(1536).fill(0)) }))

/**
 * A Supabase double that records what it was asked to do.
 *
 * It honours `.eq()` rather than ignoring it, which matters: an earlier
 * version returned a row whatever it was asked for, so every test that
 * claimed to check ownership passed against code with the ownership
 * check deleted. A double that cannot express "not yours" cannot test
 * for it.
 */
function fakeDb(rows: Record<string, Record<string, unknown>[]> = {}) {
  const deleted: Array<{ table: string; id: string; userId: string }> = []
  const inserted: Array<{ table: string; row: Record<string, unknown> }> = []

  const DEFAULT: Record<string, Record<string, unknown>[]> = {
    conversations: [{ id: 'conv-1', user_id: 'user-1', lesson_id: 'l1', context: { route: 'lesson' } }],
    lessons: [{ id: 'l1', user_id: 'user-1', body: '# A lesson' }],
    topics: [],
    messages: [],
  }
  const store = { ...DEFAULT, ...rows }

  const chain = (table: string) => {
    const filters: Array<[string, unknown]> = []
    const matching = () =>
      (store[table] ?? []).filter(row => filters.every(([col, val]) => row[col] === val))

    const q: Record<string, unknown> = {}
    q.select = () => q
    q.eq = (col: string, val: unknown) => {
      filters.push([col, val])
      return q
    }
    q.ilike = () => q
    q.limit = () => q
    q.order = () => q
    q.single = async () => {
      const found = matching()[0]
      return found ? { data: found, error: null } : { data: null, error: { message: 'no rows' } }
    }
    q.maybeSingle = async () => ({ data: matching()[0] ?? null, error: null })
    q.insert = (row: Record<string, unknown>) => {
      inserted.push({ table, row })
      return {
        select: () => ({ single: async () => ({ data: { id: 'new-1' }, error: null }) }),
        then: (r: (v: unknown) => void) => r({ error: null }),
      }
    }
    q.delete = () => ({
      eq: (_col: string, value: string) => ({
        eq: (_c2: string, userId: string) => {
          deleted.push({ table, id: value, userId })
          return Promise.resolve({ error: null })
        },
      }),
    })
    q._rows = () => matching()
    q.update = () => ({ eq: async () => ({ error: null }) })
    return q
  }

  return { from: (t: string) => chain(t), _deleted: deleted, _inserted: inserted }
}

let db = fakeDb()
vi.mock('@/lib/supabase', () => ({ supabaseAdmin: () => db }))

beforeEach(() => {
  vi.resetModules()
  ownerId.mockResolvedValue('user-1')
  askTurn.mockReset()
  db = fakeDb()
})

afterEach(() => vi.clearAllMocks())

function post(body: unknown) {
  return new Request('http://x/api/ask', { method: 'POST', body: JSON.stringify(body) })
}

describe('who is let in', () => {
  it('answers 401 as JSON, never a redirect', async () => {
    ownerId.mockResolvedValue(null)
    const { POST } = await import('@/app/api/ask/route')
    const res = await POST(post({ message: 'hi', context: { route: 'lesson' } }))
    expect(res.status).toBe(401)
    expect(await res.json()).toHaveProperty('error')
  })
})

describe('what a bad body does', () => {
  it('refuses a context that is not one, rather than storing a shape nothing can read back', async () => {
    const { POST } = await import('@/app/api/ask/route')
    const res = await POST(post({ message: 'hi', context: { route: 'nowhere' } }))
    expect(res.status).toBe(400)
  })

  it('refuses an empty message', async () => {
    const { POST } = await import('@/app/api/ask/route')
    const res = await POST(post({ message: '', context: { route: 'lesson' } }))
    expect(res.status).toBe(400)
  })
})

describe('when the model cannot be reached', () => {
  it('keeps the conversation and says so, rather than losing what was typed', async () => {
    askTurn.mockRejectedValue(new Error('ANTHROPIC_API_KEY is not set'))
    const { POST } = await import('@/app/api/ask/route')
    const res = await POST(post({ message: 'why?', context: { route: 'lesson', entityId: 'l1' } }))

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.warning).toContain('ANTHROPIC_API_KEY')
    expect(body.text).toContain('conversation is kept')
    // Both turns were written down, so a reload still shows the question.
    const messages = db._inserted.filter(i => i.table === 'messages')
    expect(messages.length).toBeGreaterThan(0)
  })
})

describe('undoing an agent write', () => {
  it('is safe to press twice, and only ever reaches your own row', async () => {
    const { undoWrite } = await import('@/lib/ask')
    await undoWrite(db as never, 'user-1', 'mark', 'mark-1')
    await undoWrite(db as never, 'user-1', 'mark', 'mark-1')

    expect(db._deleted).toHaveLength(2)
    // Every delete is scoped by the owner as well as the id: the id
    // alone arrives from a browser.
    for (const d of db._deleted) {
      expect(d.userId).toBe('user-1')
      expect(d.table).toBe('highlights')
    }
  })

  it('deletes from the card table for a card', async () => {
    const { undoWrite } = await import('@/lib/ask')
    await undoWrite(db as never, 'user-1', 'card', 'card-1')
    expect(db._deleted[0].table).toBe('clozes')
  })

  it('refuses a body with no write named', async () => {
    const { POST } = await import('@/app/api/ask/[id]/undo/route')
    const res = await POST(
      new Request('http://x/api/ask/c1/undo', { method: 'POST', body: '{}' }),
      { params: Promise.resolve({ id: 'c1' }) }
    )
    expect(res.status).toBe(400)
  })
})

describe('accepting a topic', () => {
  it('refuses when nobody is signed in', async () => {
    ownerId.mockResolvedValue(null)
    const { POST } = await import('@/app/api/ask/[id]/accept/route')
    const res = await POST(
      new Request('http://x/api/ask/conv-1/accept', { method: 'POST', body: JSON.stringify({ name: 'X' }) }),
      { params: Promise.resolve({ id: 'conv-1' }) }
    )
    expect(res.status).toBe(401)
  })

  it('refuses a topic with no name', async () => {
    const { POST } = await import('@/app/api/ask/[id]/accept/route')
    const res = await POST(
      new Request('http://x/api/ask/conv-1/accept', { method: 'POST', body: '{}' }),
      { params: Promise.resolve({ id: 'conv-1' }) }
    )
    expect(res.status).toBe(400)
  })

  it('refuses a conversation belonging to somebody else', async () => {
    db = fakeDb({ conversations: [{ id: 'conv-1', user_id: 'someone-else' }] })
    const { POST } = await import('@/app/api/ask/[id]/accept/route')
    const res = await POST(
      new Request('http://x/api/ask/conv-1/accept', {
        method: 'POST',
        body: JSON.stringify({ name: 'Compounding', summary: 's' }),
      }),
      { params: Promise.resolve({ id: 'conv-1' }) }
    )
    expect(res.status).toBe(404)
    expect(db._inserted.filter(i => i.table === 'topics')).toHaveLength(0)
  })

  it('creates the topic for a conversation that is yours', async () => {
    const { POST } = await import('@/app/api/ask/[id]/accept/route')
    const res = await POST(
      new Request('http://x/api/ask/conv-1/accept', {
        method: 'POST',
        body: JSON.stringify({ name: 'Compounding', summary: 's' }),
      }),
      { params: Promise.resolve({ id: 'conv-1' }) }
    )
    expect(res.status).toBe(200)
    const written = db._inserted.find(i => i.table === 'topics')
    expect(written?.row).toMatchObject({ user_id: 'user-1', title: 'Compounding', slug: 'compounding' })
  })

  it('writes an embedding, without which the resolver can never see the topic', async () => {
    const { POST } = await import('@/app/api/ask/[id]/accept/route')
    await POST(
      new Request('http://x/api/ask/conv-1/accept', {
        method: 'POST',
        body: JSON.stringify({ name: 'Compounding', summary: 's' }),
      }),
      { params: Promise.resolve({ id: 'conv-1' }) }
    )
    // `match_topics` selects `where state = 'active' and embedding is not
    // null`. A topic written without one is invisible to the resolver for
    // good, and the next ingestion that meets the same concept creates
    // the near-duplicate `search_map` exists to prevent.
    const written = db._inserted.find(i => i.table === 'topics')
    expect(written?.row.embedding).toBeTruthy()
  })

  it('returns the standing topic rather than creating a second', async () => {
    db = fakeDb({ topics: [{ id: 'topic-9', user_id: 'user-1', slug: 'compounding' }] })
    const { POST } = await import('@/app/api/ask/[id]/accept/route')
    const res = await POST(
      new Request('http://x/api/ask/conv-1/accept', {
        method: 'POST',
        body: JSON.stringify({ name: 'Compounding', summary: 's' }),
      }),
      { params: Promise.resolve({ id: 'conv-1' }) }
    )
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ topicId: 'topic-9' })
    expect(db._inserted.filter(i => i.table === 'topics')).toHaveLength(0)
  })
})

describe('the row a conversation is written as', () => {
  /**
   * The double accepts any column, so a name the database does not have
   * passes every other test in this file and 500s in production. This
   * pins the column names against the migrations instead: `012` renamed
   * `nodes` to `topics` *and* `node_id` to `topic_id` (012:24), and the
   * first version of this route wrote `node_id`.
   */
  it('names columns the conversations table actually has', async () => {
    const { POST } = await import('@/app/api/ask/route')
    askTurn.mockResolvedValue({ text: 'hello', proposals: [], writes: [] })
    await POST(post({ message: 'hi', context: { route: 'topic', entityId: 't1' } }))

    const written = db._inserted.find(i => i.table === 'conversations')
    expect(written).toBeTruthy()

    // Every column in 005 as 012 left it, plus what 051 added.
    const allowed = new Set(['id', 'user_id', 'kind', 'topic_id', 'started_at', 'lesson_id', 'context', 'folded_at'])
    for (const column of Object.keys(written!.row)) {
      expect(allowed.has(column), `conversations has no column "${column}"`).toBe(true)
    }
    expect(written!.row).toMatchObject({ topic_id: 't1', lesson_id: null })
  })
})

describe('a conversation that is not yours', () => {
  it('is refused when carried into a turn, rather than appended to', async () => {
    db = fakeDb({ conversations: [{ id: 'conv-1', user_id: 'someone-else' }] })
    const { POST } = await import('@/app/api/ask/route')
    const res = await POST(
      post({ conversationId: 'conv-1', message: 'hi', context: { route: 'other' } })
    )
    expect(res.status).toBe(404)
    expect(db._inserted.filter(i => i.table === 'messages')).toHaveLength(0)
  })

  it('is refused when folded', async () => {
    db = fakeDb({ conversations: [{ id: 'conv-1', user_id: 'someone-else', lesson_id: 'l1' }] })
    const { POST } = await import('@/app/api/ask/[id]/fold/route')
    const res = await POST(new Request('http://x', { method: 'POST' }), {
      params: Promise.resolve({ id: 'conv-1' }),
    })
    expect(res.status).toBe(404)
  })
})

describe('a lesson that is not yours', () => {
  it('cannot be asked about, so nothing is hung off it', async () => {
    const { POST } = await import('@/app/api/ask/route')
    const res = await POST(
      post({ message: 'hi', context: { route: 'lesson', entityId: 'someone-elses-lesson' } })
    )
    expect(res.status).toBe(404)
    expect(db._inserted).toHaveLength(0)
  })
})
