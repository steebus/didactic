import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// embed() calls the Supabase edge function rather than an SDK, so the
// boundary under test is fetch.
const realFetch = globalThis.fetch

beforeEach(() => { vi.resetModules() })
afterEach(() => { globalThis.fetch = realFetch })

function mockFetch(body: unknown, ok = true, status = 200) {
  const fn = vi.fn().mockResolvedValue({
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  })
  globalThis.fetch = fn as never
  return fn
}

describe('embed', () => {
  it('returns the vector the function produced', async () => {
    mockFetch({ embedding: new Array(384).fill(0.1) })
    const { embed } = await import('@/lib/embedding')
    const result = await embed('React Hooks')
    expect(result).toHaveLength(384)
  })

  it('sends the text to the embed function', async () => {
    const fn = mockFetch({ embedding: new Array(384).fill(0.1) })
    const { embed } = await import('@/lib/embedding')
    await embed('React Hooks')

    const [url, init] = fn.mock.calls[0]
    expect(String(url)).toContain('/functions/v1/embed')
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ text: 'React Hooks' })
  })

  it('throws when the text is empty, rather than embedding nothing', async () => {
    const { embed } = await import('@/lib/embedding')
    await expect(embed('   ')).rejects.toThrow('empty text')
  })

  it('throws when the function fails rather than returning a bad vector', async () => {
    mockFetch({ error: 'boom' }, false, 500)
    const { embed } = await import('@/lib/embedding')
    await expect(embed('React Hooks')).rejects.toThrow('500')
  })

  it('refuses a vector of the wrong width', async () => {
    // A dimension mismatch means the model changed under the schema;
    // storing it would corrupt every later similarity comparison.
    mockFetch({ embedding: new Array(1536).fill(0.1) })
    const { embed } = await import('@/lib/embedding')
    await expect(embed('React Hooks')).rejects.toThrow('384')
  })
})
