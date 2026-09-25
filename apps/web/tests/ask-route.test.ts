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

/** A Supabase double that records what it was asked to do. */
function fakeDb(over: Record<string, unknown> = {}) {
  const deleted: Array<{ table: string; id: string; userId: string }> = []
  const inserted: Array<{ table: string; row: Record<string, unknown> }> = []

  const chain = (table: string) => {
    const q: Record<string, unknown> = {}
    q.select = () => q
    q.eq = () => q
    q.ilike = () => q
    q.limit = () => q
    q.order = () => q
    q.single = async () => ({ data: { id: 'row-1' }, error: null })
    q.maybeSingle = async () => ({ data: { id: 'conv-1', user_id: 'user-1' }, error: null })
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
    q.update = () => ({ eq: async () => ({ error: null }) })
    return q
  }

  return { from: (t: string) => chain(t), _deleted: deleted, _inserted: inserted, ...over }
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
      new Request('http://x/api/ask/c1/accept', { method: 'POST', body: JSON.stringify({ name: 'X' }) }),
      { params: Promise.resolve({ id: 'c1' }) }
    )
    expect(res.status).toBe(401)
  })

  it('refuses a topic with no name', async () => {
    const { POST } = await import('@/app/api/ask/[id]/accept/route')
    const res = await POST(
      new Request('http://x/api/ask/c1/accept', { method: 'POST', body: '{}' }),
      { params: Promise.resolve({ id: 'c1' }) }
    )
    expect(res.status).toBe(400)
  })

  it('returns the standing topic rather than erroring when accepted twice', async () => {
    const { POST } = await import('@/app/api/ask/[id]/accept/route')
    const res = await POST(
      new Request('http://x/api/ask/c1/accept', {
        method: 'POST',
        body: JSON.stringify({ name: 'Compounding', summary: 's' }),
      }),
      { params: Promise.resolve({ id: 'c1' }) }
    )
    // The double responds with an existing row from maybeSingle, which
    // is the second-tap case.
    expect(res.status).toBe(200)
    expect(await res.json()).toHaveProperty('topicId')
  })
})
