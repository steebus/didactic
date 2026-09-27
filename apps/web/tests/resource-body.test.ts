import { describe, it, expect, vi, afterEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { documentMarkdown, readableBody } from '@/lib/resourceBody'
import { IMPORTER } from '@/lib/extract/markdown'
import { lessonSections } from '@didactic/core/sections'

/**
 * A resource made readable, once.
 *
 * The database is a small fake that answers the three reads this makes
 * and records the one write: whether a body is kept is the behaviour
 * worth pinning, because keeping half a book would freeze it as the
 * whole of one.
 */
function fakeDb(tables: Record<string, unknown>, { stamped = true } = {}) {
  const kept: Array<Record<string, unknown>> = []
  const stamps: Array<Record<string, unknown>> = []
  const chain = (table: string) => {
    const answer = { data: tables[table] ?? null, error: null }
    const q: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'order']) q[m] = () => q
    q.maybeSingle = async () => answer
    q.then = (resolve: (v: unknown) => void) => resolve(answer)
    q.upsert = async (row: Record<string, unknown>) => {
      // Before 057, PostgREST refuses a column it does not know.
      if (!stamped && 'made_with' in row) return { error: { code: 'PGRST204', message: 'no made_with' } }
      kept.push(row)
      return { error: null }
    }
    q.update = (row: Record<string, unknown>) => {
      stamps.push(row)
      return q
    }
    return q
  }
  return { db: { from: chain } as unknown as SupabaseClient, kept, stamps }
}

const base = { id: 'r', user_id: 'u', url: null, raw_text: null, storage_path: null }

afterEach(() => vi.unstubAllGlobals())

describe('documentMarkdown', () => {
  it('sets a heading wherever the chapter changes, so a document has sections', () => {
    const body = documentMarkdown([
      { heading: 'Chapter 1', content: 'First para.\n\nSecond para.' },
      { heading: 'Chapter 1', content: 'Still one.' },
      { heading: 'Chapter 2', content: 'Now two.' },
      { heading: null, content: 'Appendix text.' },
    ])
    expect(lessonSections(body).map(s => s.text)).toEqual(['Chapter 1', 'Chapter 2'])
    expect(body).toContain('First para.\n\nSecond para.')
  })

  it('reads a document’s own characters as text, not as markdown', () => {
    const body = documentMarkdown([{ heading: null, content: '# 3 costs $5 *each*' }])
    expect(body).toBe('\\# 3 costs \\$5 \\*each\\*')
  })
})

describe('readableBody', () => {
  it('reads a kept body without making another', async () => {
    const { db, kept } = fakeDb({ resource_bodies: { body: '# Kept', source: 'article' } })
    const got = await readableBody(db, { ...base, kind: 'article', url: 'https://x.test' })
    expect(got).toEqual({ body: '# Kept', source: 'article' })
    expect(kept).toHaveLength(0)
  })

  it('makes a note’s body from what was pasted, and keeps it', async () => {
    const { db, kept } = fakeDb({})
    const got = await readableBody(db, { ...base, kind: 'note', raw_text: 'Pasted words.' })
    expect(got).toEqual({ body: 'Pasted words.', source: 'note' })
    expect(kept).toEqual([
      { resource_id: 'r', user_id: 'u', body: 'Pasted words.', source: 'note', made_with: IMPORTER },
    ])
  })

  it('keeps a body without the importer’s stamp before there is a column for it', async () => {
    const { db, kept } = fakeDb({}, { stamped: false })
    await readableBody(db, { ...base, kind: 'note', raw_text: 'Pasted words.' })
    expect(kept).toEqual([{ resource_id: 'r', user_id: 'u', body: 'Pasted words.', source: 'note' }])
  })

  it('says why a book has nothing to read, and keeps nothing', async () => {
    const { db, kept } = fakeDb({})
    const got = await readableBody(db, { ...base, kind: 'book' })
    expect(got.body).toBeNull()
    expect(got.body === null && got.why).toMatch(/title, not its pages/)
    expect(kept).toHaveLength(0)
  })

  it('shows a document still being read, but does not keep half of it', async () => {
    const { db, kept } = fakeDb({
      resource_passages: [{ heading: 'One', content: 'So far.' }],
      ingestion_jobs: { pages_done: 40, page_count: 300 },
    })
    const got = await readableBody(db, { ...base, kind: 'pdf', storage_path: 'u/r.pdf' })
    expect(got.body).toContain('So far.')
    expect(kept).toHaveLength(0)
  })

  it('keeps a document once it has all been read', async () => {
    const { db, kept } = fakeDb({
      resource_passages: [{ heading: 'One', content: 'All of it.' }],
      ingestion_jobs: { pages_done: 300, page_count: 300 },
    })
    await readableBody(db, { ...base, kind: 'pdf', storage_path: 'u/r.pdf' })
    expect(kept).toHaveLength(1)
    expect(kept[0].source).toBe('document')
  })

  it('brings an article in from its page, and says why when it cannot', async () => {
    const paragraph = 'The broker holds the shares for you, in its name, and keeps a ledger. '.repeat(5)
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          `<html><head><title>Custody</title></head><body><article><h1>Custody</h1><h2>Who holds it</h2><p>${paragraph}</p><p>${paragraph}</p></article></body></html>`,
          { status: 200 }
        )
      )
    )
    const { db, kept } = fakeDb({})
    const got = await readableBody(db, { ...base, kind: 'article', url: 'https://x.test/custody' })
    expect(got.body).toContain('The broker holds the shares')
    expect(kept).toHaveLength(1)

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('no', { status: 403 })))
    const refused = await readableBody(fakeDb({}).db, { ...base, kind: 'article', url: 'https://x.test/p' })
    expect(refused.body).toBeNull()
    expect(refused.body === null && refused.why).toMatch(/403/)
  })

  describe('an article kept by an older importer', () => {
    const paragraph = 'Man is his own star, and the soul that can render an honest man. '.repeat(5)
    const page = `<html><head><title>Self-Reliance</title></head><body><article><p>${paragraph}</p><p>One line<br>and the next</p></article></body></html>`
    const old = { body: '# Old reading', source: 'article', made_with: IMPORTER - 1 }

    it('is made again, and kept with the new stamp', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(page, { status: 200 })))
      const { db, kept } = fakeDb({ resource_bodies: old })
      const got = await readableBody(db, { ...base, kind: 'article', url: 'https://x.test/emerson' })
      expect(got.body).toContain('One line\\\nand the next')
      expect(kept).toHaveLength(1)
      expect(kept[0].made_with).toBe(IMPORTER)
    })

    it('keeps what it had when its page cannot be read, and is not tried on every open', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('gone', { status: 404 })))
      const { db, kept, stamps } = fakeDb({ resource_bodies: old })
      const got = await readableBody(db, { ...base, kind: 'article', url: 'https://x.test/emerson' })
      expect(got).toEqual({ body: '# Old reading', source: 'article' })
      expect(kept).toHaveLength(0)
      expect(stamps).toEqual([{ made_with: IMPORTER }])
    })

    it('is left alone before the stamp exists, rather than made on every open', async () => {
      const fetching = vi.fn()
      vi.stubGlobal('fetch', fetching)
      const { db } = fakeDb({ resource_bodies: { body: '# Old reading', source: 'article' } })
      await readableBody(db, { ...base, kind: 'article', url: 'https://x.test/emerson' })
      expect(fetching).not.toHaveBeenCalled()
    })
  })
})
