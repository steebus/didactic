import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockCreate = vi.fn()
vi.mock('@anthropic-ai/sdk', () => ({
  default: class { messages = { create: mockCreate } }
}))

beforeEach(() => {
  mockCreate.mockReset()
  process.env.ANTHROPIC_API_KEY = 'test-key'
})

const write = async () => {
  const { generateLessonBody } = await import('@/lib/llm/curriculum')
  return generateLessonBody({
    topicTitle: 'Web performance',
    curriculumTitle: 'Making it fast',
    goal: null,
    lesson: { title: 'The cost of slow', summary: null, stage: 'core', estimatedMinutes: 20 },
    covered: [],
    sources: [],
    library: [],
  })
}

const said = (text: string, stop = 'end_turn') => ({
  stop_reason: stop,
  usage: { output_tokens: 3000 },
  content: [{ type: 'text', text }],
})

describe('a lesson that fits', () => {
  it('is written in one go', async () => {
    mockCreate.mockResolvedValue(said('# The cost of slow\n\nAll of it.'))

    expect(await write()).toBe('# The cost of slow\n\nAll of it.')
    expect(mockCreate).toHaveBeenCalledTimes(1)
  })
})

describe('a lesson cut off at the token ceiling', () => {
  it('is handed back to the model to finish, and joined', async () => {
    mockCreate
      .mockResolvedValueOnce(said('Performance data is almost always skewed, not', 'max_tokens'))
      .mockResolvedValueOnce(said(' neatly bell-shaped.'))

    // Joined at the break rather than printed with half a sentence on
    // the end, which is what the reader was being shown.
    expect(await write()).toBe(
      'Performance data is almost always skewed, not neatly bell-shaped.'
    )
    expect(mockCreate).toHaveBeenCalledTimes(2)
  })

  it('carries on from its own words rather than starting again', async () => {
    mockCreate
      .mockResolvedValueOnce(said('Half a lesson, ending mid  \n', 'max_tokens'))
      .mockResolvedValueOnce(said('-sentence.'))

    await write()

    const [first, second] = mockCreate.mock.calls.map(c => c[0].messages)
    expect(second).toHaveLength(2)
    expect(second[0].content).toBe(first[0].content)
    expect(second[1].role).toBe('assistant')
    // The API refuses a turn that ends in whitespace.
    expect(second[1].content).toBe('Half a lesson, ending mid')
    expect(second[1].content).not.toMatch(/\s$/)
  })

  it('asks once, not until it fits', async () => {
    mockCreate.mockResolvedValue(said('On and on', 'max_tokens'))

    // Still truncated after the second go, and printed as it stands:
    // a lesson that cannot be finished in two is not one a third would
    // finish either.
    expect(await write()).toBe('On and onOn and on')
    expect(mockCreate).toHaveBeenCalledTimes(2)
  })
})
