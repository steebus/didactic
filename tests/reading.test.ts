import { describe, it, expect } from 'vitest'
import { readVerdict } from '@/lib/subject'
import { readJson } from '@/lib/http'

describe('readVerdict', () => {
  it('calls it matching when the two figures are within a rung', () => {
    // One rung is inside the noise of a single conversation, so it is
    // not worth telling the user their self-report was wrong.
    expect(readVerdict(3, 3)).toBe('matching')
    expect(readVerdict(3, 4)).toBe('matching')
    expect(readVerdict(3, 2)).toBe('matching')
  })

  it('reads above when the answers show two rungs more than claimed', () => {
    expect(readVerdict(2, 4)).toBe('above')
    expect(readVerdict(0, 5)).toBe('above')
  })

  it('reads below when the answers show two rungs less', () => {
    expect(readVerdict(5, 3)).toBe('below')
    expect(readVerdict(4, 1)).toBe('below')
  })

  it('has nothing to compare when either figure is missing', () => {
    expect(readVerdict(null, 4)).toBe('unstated')
    expect(readVerdict(3, null)).toBe('unstated')
    expect(readVerdict(null, null)).toBe('unstated')
  })

  it('treats a stated nought as a figure, not as a missing answer', () => {
    expect(readVerdict(0, 0)).toBe('matching')
    expect(readVerdict(0, 3)).toBe('above')
  })
})

const response = (body: string, init: ResponseInit = {}) => new Response(body, init)

describe('readJson', () => {
  it('reads an ordinary JSON reply', async () => {
    const { ok, body, error } = await readJson<{ subjectId: string }>(
      response(JSON.stringify({ subjectId: 'abc' }), { status: 200 })
    )
    expect(ok).toBe(true)
    expect(body.subjectId).toBe('abc')
    expect(error).toBeNull()
  })

  it('carries a stated error through', async () => {
    const { ok, error } = await readJson(
      response(JSON.stringify({ error: 'not signed in' }), { status: 401 })
    )
    expect(ok).toBe(false)
    expect(error).toBe('not signed in')
  })

  it('explains an empty body instead of throwing on it', async () => {
    // This is the timeout case: the function was killed after the
    // response began, and `res.json()` threw "Unexpected end of JSON
    // input" at the user.
    const { ok, error } = await readJson(response('', { status: 200 }))
    expect(ok).toBe(false)
    expect(error).toMatch(/ran out of time/)
  })

  it('names a gateway timeout as one', async () => {
    const { error } = await readJson(response('<html>gateway timeout</html>', { status: 504 }))
    expect(error).toMatch(/took too long/)
  })

  it('handles HTML where JSON was expected', async () => {
    const { ok, error } = await readJson(response('<!doctype html><h1>500</h1>', { status: 500 }))
    expect(ok).toBe(false)
    expect(error).toMatch(/not JSON/)
  })
})
