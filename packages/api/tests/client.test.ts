import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createApi } from '../src/client'
import { didactic } from '../src/index'
import { ENDPOINTS, invalidatedBy, type Endpoint } from '../src/endpoints'

/**
 * What this package has to get right.
 *
 * It is one thin layer, but it is the layer both front ends reach the
 * backend through, so the things worth testing are the ones that would
 * be wrong on both platforms at once: the header a request carries, the
 * shape a failure comes back as, and whether `ENDPOINTS` still agrees
 * with the routes it is supposed to describe.
 */

const original = globalThis.fetch

function respond(body: unknown, init: { status?: number; text?: string } = {}) {
  const status = init.status ?? 200
  const payload = init.text ?? JSON.stringify(body)
  return vi.fn().mockResolvedValue(
    new Response(payload, { status, headers: { 'Content-Type': 'application/json' } })
  )
}

beforeEach(() => {
  vi.restoreAllMocks()
})

afterEach(() => {
  globalThis.fetch = original
})

describe('createApi', () => {
  it('asks for headers on every request rather than holding them', async () => {
    // A phone's token expires while the app is open, so a header
    // captured once would go stale mid-session.
    let calls = 0
    const fetchMock = respond({ ok: true })
    globalThis.fetch = fetchMock
    const api = createApi({
      baseUrl: 'https://example.test',
      headers: () => ({ Authorization: `Bearer token-${++calls}` }),
    })

    await api.get('/api/home')
    await api.get('/api/home')

    const sent = fetchMock.mock.calls.map(c => (c[1] as RequestInit).headers)
    expect((sent[0] as Record<string, string>).Authorization).toBe('Bearer token-1')
    expect((sent[1] as Record<string, string>).Authorization).toBe('Bearer token-2')
  })

  it('names a JSON content type for a body, and never for a FormData one', async () => {
    // FormData sets its own multipart boundary; naming a type here
    // replaces it with one that has none and the parts stop parsing.
    const fetchMock = respond({ ok: true })
    globalThis.fetch = fetchMock
    const api = createApi({ baseUrl: 'https://example.test' })

    await api.post('/api/resources', { kind: 'article' })
    await api.upload('/api/resources/upload', new FormData())

    const [first, second] = fetchMock.mock.calls.map(c => (c[1] as RequestInit).headers)
    expect((first as Record<string, string>)['Content-Type']).toBe('application/json')
    expect((second as Record<string, string>)['Content-Type']).toBeUndefined()
  })

  it('puts query values on the URL and drops the empty ones', async () => {
    const fetchMock = respond({ highlights: [] })
    globalThis.fetch = fetchMock
    const api = createApi({ baseUrl: 'https://example.test' })

    await api.get('/api/highlights', { q: 'roots' })
    await api.get('/api/highlights', { q: undefined })

    const urls = fetchMock.mock.calls.map(c => String(c[0]))
    expect(urls[0]).toContain('q=roots')
    expect(urls[1]).not.toContain('q=')
  })

  it('answers a dropped connection with a sentence instead of throwing', async () => {
    // The one failure that never reaches readJson, because there is no
    // response at all to read.
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('network'))
    const api = createApi({ baseUrl: 'https://example.test' })

    const result = await api.get('/api/home')
    expect(result.ok).toBe(false)
    expect(result.status).toBe(0)
    expect(result.error).toMatch(/connection dropped/i)
  })

  it('passes an error sentence through rather than throwing on a 401', async () => {
    globalThis.fetch = respond({ error: 'not signed in' }, { status: 401 })
    const api = createApi({ baseUrl: 'https://example.test' })

    const result = await api.get('/api/home')
    expect(result.ok).toBe(false)
    expect(result.status).toBe(401)
    expect(result.error).toBe('not signed in')
  })

  it('turns an empty body into a sentence about running out of time', async () => {
    globalThis.fetch = respond(null, { status: 200, text: '' })
    const api = createApi({ baseUrl: 'https://example.test' })

    const result = await api.post('/api/subjects', { subject: 'Roots' })
    expect(result.ok).toBe(false)
    expect(result.error).toMatch(/ran out of time/i)
  })

  it('sends relative paths when there is no base URL, as the web does', async () => {
    const fetchMock = respond({ ok: true })
    globalThis.fetch = fetchMock
    const api = createApi()

    await api.get('/api/home')
    expect(String(fetchMock.mock.calls[0][0])).toBe('/api/home')
  })
})

describe('didactic', () => {
  it('builds the path for a route that takes an id', async () => {
    const fetchMock = respond({ topic: {} })
    globalThis.fetch = fetchMock
    const client = didactic({ baseUrl: 'https://example.test' })

    await client.topics.area('abc-123')
    expect(String(fetchMock.mock.calls[0][0])).toContain('/api/topics/abc-123/area')
  })

  it('sends the method each route actually answers to', async () => {
    const fetchMock = respond({ ok: true })
    globalThis.fetch = fetchMock
    const client = didactic({ baseUrl: 'https://example.test' })

    await client.highlights.remove('mark-1')
    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect(init.method).toBe('DELETE')
    // The id travels in the body on this route, not the path.
    expect(JSON.parse(String(init.body))).toEqual({ id: 'mark-1' })
  })
})

describe('ENDPOINTS', () => {
  const entries = Object.entries(ENDPOINTS) as Array<[string, Endpoint]>

  it('names every entry after its own key, so a lookup cannot lie', () => {
    for (const [key, endpoint] of entries) {
      expect(endpoint.name, key).toBe(key)
    }
  })

  it('gives every write something to invalidate, and every read nothing', () => {
    // A write that drops no tag is the stale-map failure this table
    // exists to prevent. The exceptions are the three that genuinely
    // change nothing cached: signing in and out, and asking for the
    // qualifying questions.
    const changesNothing = new Set([
      'auth.claim',
      'auth.signIn',
      'auth.signOut',
      'subjects.qualify',
    ])

    for (const [key, endpoint] of entries) {
      if (endpoint.method === 'GET') {
        expect(endpoint.invalidates, key).toEqual([])
      } else if (!changesNothing.has(key)) {
        expect(endpoint.invalidates.length, key).toBeGreaterThan(0)
      }
    }
  })

  it('starts every path at /api/', () => {
    for (const [key, endpoint] of entries) {
      expect(endpoint.path.startsWith('/api/'), key).toBe(true)
    }
  })

  it('hands back the tags a write drops', () => {
    expect(invalidatedBy('highlights.create')).toContain('highlights')
    expect(invalidatedBy('highlights.create')).toContain('topics')
    expect(invalidatedBy('home.read')).toEqual([])
  })
})
