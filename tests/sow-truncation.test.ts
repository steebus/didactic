import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockCreate = vi.fn()
vi.mock('@anthropic-ai/sdk', () => ({
  default: class { messages = { create: mockCreate } }
}))
vi.mock('@/lib/auth', () => ({ ownerId: async () => 'user-1' }))
vi.mock('@/lib/supabase', () => ({
  supabaseAdmin: () => { throw new Error('the database should not be reached') }
}))

beforeEach(() => {
  mockCreate.mockReset()
  process.env.ANTHROPIC_API_KEY = 'test-key'
})

const post = async () => {
  const { POST } = await import('@/app/api/subjects/route')
  return POST(new Request('http://localhost/api/subjects', {
    method: 'POST',
    body: JSON.stringify({ subject: 'Photography', depth: 'I want to master it' }),
  }))
}

describe('a tool call cut off at the token ceiling', () => {
  it('is reported as half-written rather than crashing on a non-array', async () => {
    // What the SDK actually hands back when the JSON stops mid-list.
    mockCreate.mockResolvedValue({
      stop_reason: 'max_tokens',
      content: [{ type: 'tool_use', name: 'record_subject_topics', input: { topics: '[{"name":"Expo' } }],
    })

    const res = await post()
    expect(res.status).toBe(502)
    expect((await res.json()).error).toMatch(/half-written/)
  })

  it('still refuses a non-array even if stop_reason does not say so', async () => {
    mockCreate.mockResolvedValue({
      stop_reason: 'end_turn',
      content: [{ type: 'tool_use', name: 'record_subject_topics', input: { topics: 'not a list' } }],
    })

    const res = await post()
    expect(res.status).toBe(502)
    expect((await res.json()).error).toMatch(/came back empty/)
  })
})
