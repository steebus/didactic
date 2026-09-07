import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const html = readFileSync(join(__dirname, 'fixtures/article.html'), 'utf-8')

vi.mock('@/lib/llm/concepts', () => ({
  extractConcepts: vi.fn().mockResolvedValue({
    summary: 'About React hooks.',
    concepts: [
      { name: 'React Hooks', relevance: 0.9 },
      { name: 'CDN Distribution', relevance: 0.4 },
    ],
  }),
}))
vi.mock('@/lib/llm/edges', () => ({ proposeEdges: vi.fn().mockResolvedValue([]) }))
vi.mock('@/lib/embedding', () => ({
  embed: vi.fn().mockImplementation(async (t: string) => {
    const v = new Array(1536).fill(0)
    v[t.includes('React') ? 0 : 1] = 1
    return v
  }),
}))

function mockDb(opts: {
  resource: Record<string, unknown>
  candidates: Array<{ id: string; title: string; embedding: number[] }>
  html: string
  // Mirrors commit_ingestion's real return columns: a plpgsql function
  // with OUT params named id/title shadows those column names in its
  // own body, so the real function returns out_id/out_title.
  created?: Array<{ out_id: string; out_title: string }>
}) {
  const inserts: Record<string, unknown[]> = {}
  const updates: Record<string, unknown[]> = {}
  const rpcCalls: Record<string, unknown[]> = {}

  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    text: async () => opts.html,
  }) as never

  const chain = (table: string) => {
    const api: Record<string, unknown> = {
      select: () => api,
      eq: () => api,
      in: () => api,
      single: async () => ({
        data: table === 'resources'
          ? { user_id: 'u1', title: 'T', ...opts.resource }
          : null,
        error: null,
      }),
      insert: (rows: unknown) => {
        inserts[table] ??= []
        inserts[table].push(...(Array.isArray(rows) ? rows : [rows]))
        return api
      },
      update: (row: unknown) => {
        updates[table] ??= []
        updates[table].push(row)
        return api
      },
      then: (resolve: (v: unknown) => void) => resolve({ data: [], error: null }),
    }
    return api
  }

  return {
    from: (table: string) => chain(table),
    rpc: async (fn: string, args: unknown) => {
      rpcCalls[fn] ??= []
      rpcCalls[fn].push(args)
      if (fn === 'match_nodes') return { data: opts.candidates, error: null }
      if (fn === 'commit_ingestion') return { data: opts.created ?? [], error: null }
      return { data: null, error: null }
    },
    storage: { from: () => ({ download: async () => ({ data: null }) }) },
    inserted: (table: string) => inserts[table] ?? [],
    updated: (table: string) => updates[table] ?? [],
    rpcArgs: (fn: string) => rpcCalls[fn] ?? [],
  }
}

// mockDb replaces globalThis.fetch. Files share one process (file
// parallelism is off so integration tests can share a database), so the
// stub is restored after every case rather than leaking into whichever
// file runs next.
const realFetch = globalThis.fetch

beforeEach(() => { vi.clearAllMocks() })
afterEach(() => { globalThis.fetch = realFetch })

describe('ingestResource', () => {
  it('links a concept matching an existing node instead of creating a duplicate', async () => {
    const existingReact = new Array(1536).fill(0)
    existingReact[0] = 1
    const db = mockDb({
      resource: { id: 'r1', url: 'https://example.com/a', kind: 'article', raw_text: null },
      candidates: [{ id: 'node-react', title: 'React Hooks', embedding: existingReact }],
      html,
    })
    const { ingestResource } = await import('@/lib/ingest')
    const result = await ingestResource(db as never, 'r1')
    expect(result.linked).toBe(1)
    expect(result.created).toBe(1) // CDN Distribution is new
  })

  it('does NOT create an exposure - filing is not reading', async () => {
    const db = mockDb({
      resource: { id: 'r1', url: 'https://example.com/a', kind: 'article', raw_text: null },
      candidates: [],
      html,
    })
    const { ingestResource } = await import('@/lib/ingest')
    await ingestResource(db as never, 'r1')
    expect(db.inserted('exposures')).toHaveLength(0)
  })

  it('leaves the resource queued after ingestion', async () => {
    const db = mockDb({
      resource: { id: 'r1', url: 'https://example.com/a', kind: 'article', raw_text: null },
      candidates: [],
      html,
    })
    const { ingestResource } = await import('@/lib/ingest')
    await ingestResource(db as never, 'r1')
    const statusWrites = db.updated('resources')
      .filter((u) => (u as { status?: string }).status !== undefined)
    expect(statusWrites).toHaveLength(0)
  })

  it('writes edges for newly created nodes, using the ids the commit returned', async () => {
    const { proposeEdges } = await import('@/lib/llm/edges')
    vi.mocked(proposeEdges).mockResolvedValue([
      { from: 'new-1', to: 'node-react', kind: 'related', weight: 0.6 },
    ])
    const existingReact = new Array(1536).fill(0)
    existingReact[0] = 1
    const db = mockDb({
      resource: { id: 'r1', url: 'https://example.com/a', kind: 'article', raw_text: null },
      candidates: [{ id: 'node-react', title: 'React Hooks', embedding: existingReact }],
      html,
      created: [{ out_id: 'new-1', out_title: 'CDN Distribution' }],
    })
    const { ingestResource } = await import('@/lib/ingest')
    await ingestResource(db as never, 'r1')

    const edges = db.inserted('edges') as Array<Record<string, unknown>>
    expect(edges).toHaveLength(1)
    expect(edges[0]).toMatchObject({
      from_node: 'new-1',
      to_node: 'node-react',
      kind: 'related',
      created_by: 'ai',
    })
  })

  it('passes the newly created nodes to edge proposal, not an empty list', async () => {
    const { proposeEdges } = await import('@/lib/llm/edges')
    vi.mocked(proposeEdges).mockResolvedValue([])
    const db = mockDb({
      resource: { id: 'r1', url: 'https://example.com/a', kind: 'article', raw_text: null },
      candidates: [],
      html,
      created: [
        { out_id: 'new-1', out_title: 'React Hooks' },
        { out_id: 'new-2', out_title: 'CDN Distribution' },
      ],
    })
    const { ingestResource } = await import('@/lib/ingest')
    await ingestResource(db as never, 'r1')

    expect(proposeEdges).toHaveBeenCalledWith(
      [{ id: 'new-1', title: 'React Hooks' }, { id: 'new-2', title: 'CDN Distribution' }],
      expect.anything()
    )
  })

  it('marks an ambiguous concept pending rather than merging or splitting silently', async () => {
    // 0.75 similarity: inside the ambiguous band.
    const near = new Array(1536).fill(0)
    near[0] = 0.75
    near[1] = Math.sqrt(1 - 0.75 * 0.75)
    const db = mockDb({
      resource: { id: 'r1', url: 'https://example.com/a', kind: 'article', raw_text: null },
      candidates: [{ id: 'node-x', title: 'Something Adjacent', embedding: near }],
      html,
    })
    const { ingestResource } = await import('@/lib/ingest')
    const result = await ingestResource(db as never, 'r1')
    expect(result.pending).toBeGreaterThan(0)

    const newNodes = (db.rpcArgs('commit_ingestion')[0] as { p_new_nodes: Array<{ state: string }> }).p_new_nodes
    expect(newNodes.some(n => n.state === 'pending')).toBe(true)
  })
})
