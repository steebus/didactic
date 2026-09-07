import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockCreate = vi.fn()
vi.mock('@anthropic-ai/sdk', () => ({
  default: class { messages = { create: mockCreate } }
}))

beforeEach(() => { mockCreate.mockReset() })

function toolResponse(payload: unknown) {
  return { content: [{ type: 'tool_use', name: 'record_concepts', input: payload }] }
}

describe('extractConcepts', () => {
  it('returns the summary and concepts from the tool call', async () => {
    mockCreate.mockResolvedValue(toolResponse({
      summary: 'An article about React hooks.',
      concepts: [
        { name: 'React Hooks', relevance: 0.9 },
        { name: 'useState', relevance: 0.7 },
      ],
    }))
    const { extractConcepts } = await import('@/lib/llm/concepts')
    const result = await extractConcepts('Understanding React Hooks', 'Hooks let you...')
    expect(result.summary).toBe('An article about React hooks.')
    expect(result.concepts).toHaveLength(2)
    expect(result.concepts[0]).toEqual({ name: 'React Hooks', relevance: 0.9 })
  })

  it('drops concepts whose relevance is out of range rather than trusting them', async () => {
    mockCreate.mockResolvedValue(toolResponse({
      summary: 's',
      concepts: [
        { name: 'Good', relevance: 0.8 },
        { name: 'Bad', relevance: 1.7 },
        { name: 'Worse', relevance: -0.2 },
      ],
    }))
    const { extractConcepts } = await import('@/lib/llm/concepts')
    const result = await extractConcepts('t', 'x')
    expect(result.concepts.map(c => c.name)).toEqual(['Good'])
  })

  it('truncates very long text before sending it', async () => {
    mockCreate.mockResolvedValue(toolResponse({ summary: 's', concepts: [] }))
    const { extractConcepts } = await import('@/lib/llm/concepts')
    await extractConcepts('t', 'x'.repeat(200_000))
    const sent = JSON.stringify(mockCreate.mock.calls[0][0])
    expect(sent.length).toBeLessThan(150_000)
  })

  it('throws when the model returns no tool call', async () => {
    mockCreate.mockResolvedValue({ content: [{ type: 'text', text: 'sorry' }] })
    const { extractConcepts } = await import('@/lib/llm/concepts')
    await expect(extractConcepts('t', 'x')).rejects.toThrow('no structured output')
  })
})
