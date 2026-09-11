import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * The generator, one round at a time.
 *
 * These tests used to mock `messages.create` and assert that a lesson
 * which hit the ceiling was continued by handing the model its own half
 * a lesson back as the last turn. That shape is an assistant prefill,
 * and every current model answers one with a 400 -- so the code was
 * wrong in the one way a mock can never show you, and the suite passed
 * for as long as it existed. The rule the mock could not enforce is
 * enforced here instead: whatever else a round does, the last message
 * is never the assistant's.
 */
const finalMessage = vi.fn()
/** Only the part of the request these tests read back. */
interface Asked {
  messages: Array<{ role: string; content: string | Array<Record<string, unknown>> }>
}
const mockStream = vi.fn((options: Asked) => {
  void options
  return { finalMessage }
})
vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { stream: mockStream }
  },
}))

beforeEach(() => {
  mockStream.mockClear()
  finalMessage.mockReset()
  process.env.ANTHROPIC_API_KEY = 'test-key'
})

const write = async (carried?: string) => {
  const { generateLessonBody } = await import('@/lib/llm/curriculum')
  return generateLessonBody(
    {
      topicTitle: 'Web performance',
      curriculumTitle: 'Making it fast',
      goal: null,
      lesson: { title: 'The cost of slow', summary: null, stage: 'core', estimatedMinutes: 20 },
      covered: [],
      sources: [],
      library: [],
    },
    carried
  )
}

const said = (text: string, stop = 'end_turn') => ({
  stop_reason: stop,
  usage: { output_tokens: 2000 },
  content: [{ type: 'text', text }],
})

/** The messages the last round was asked with. */
const asked = () => mockStream.mock.calls.at(-1)![0].messages

describe('a lesson that fits', () => {
  it('is written in one round and says it is finished', async () => {
    finalMessage.mockResolvedValue(said('# The cost of slow\n\nAll of it.'))

    expect(await write()).toEqual({
      text: '# The cost of slow\n\nAll of it.',
      finished: true,
    })
    expect(mockStream).toHaveBeenCalledTimes(1)
  })

  it('asks with the prompt alone, and nothing else', async () => {
    finalMessage.mockResolvedValue(said('All of it.'))
    await write()

    const messages = asked()
    expect(messages).toHaveLength(1)
    expect(messages[0].role).toBe('user')
  })

  it('marks the prompt for caching, since every round resends it', async () => {
    finalMessage.mockResolvedValue(said('All of it.'))
    await write()

    const prompt = asked()[0].content as Array<Record<string, unknown>>
    expect(prompt[0].cache_control).toEqual({ type: 'ephemeral' })
  })

  it('is streamed, so a long round is not cut off in transit', async () => {
    finalMessage.mockResolvedValue(said('All of it.'))
    await write()

    expect(mockStream).toHaveBeenCalled()
  })
})

describe('a round that fills up', () => {
  it('hands back what it wrote and says there is more', async () => {
    finalMessage.mockResolvedValue(
      said('Performance data is almost always skewed, not', 'max_tokens')
    )

    expect(await write()).toEqual({
      text: 'Performance data is almost always skewed, not',
      finished: false,
    })
  })

  it('writes only one round, and leaves the next to the caller', async () => {
    // The loop is the client's, not this function's: each round is its
    // own request, which is the whole reason a long lesson can be
    // written at all inside the platform's minute.
    finalMessage.mockResolvedValue(said('On and on', 'max_tokens'))
    await write()

    expect(mockStream).toHaveBeenCalledTimes(1)
  })
})

describe('carrying on from a round that filled up', () => {
  it('joins the new prose onto the old', async () => {
    finalMessage.mockResolvedValue(said(' neatly bell-shaped.'))

    const { text } = await write('Performance data is almost always skewed, not')
    expect(text).toBe('Performance data is almost always skewed, not neatly bell-shaped.')
  })

  it('never ends on an assistant turn, which the model refuses', async () => {
    // The bug this file failed to catch for its whole life. A last-turn
    // assistant prefill is a 400 on every current model, so a lesson
    // long enough to need a second round never got one.
    finalMessage.mockResolvedValue(said('-sentence.'))
    await write('Half a lesson, ending mid')

    const messages = asked()
    expect(messages.at(-1)!.role).toBe('user')
    expect(messages.some((m: { role: string }) => m.role === 'assistant')).toBe(true)
  })

  it('hands back the prose so far as its own turn, then asks for the rest', async () => {
    finalMessage.mockResolvedValue(said('-sentence.'))
    await write('Half a lesson, ending mid')

    const [prompt, carried, carryOn] = asked()
    expect(prompt.role).toBe('user')
    expect(carried.role).toBe('assistant')
    expect(carried.content).toBe('Half a lesson, ending mid')
    expect(carryOn.role).toBe('user')
    expect(carryOn.content).toMatch(/carry straight on/i)
  })

  it('asks with the same prompt it started from, so the cache still reads', async () => {
    finalMessage.mockResolvedValue(said('All of it.'))
    await write()
    const first = (asked()[0].content as Array<Record<string, unknown>>)[0].text

    finalMessage.mockResolvedValue(said(' and the rest.'))
    await write('The start.')
    expect((asked()[0].content as Array<Record<string, unknown>>)[0].text).toBe(first)
  })

  it('leaves no trailing whitespace for the next round to trip on', async () => {
    // The API refuses a turn that ends in whitespace, and the next
    // round is asked to carry on from the last character.
    finalMessage.mockResolvedValue(said('more.  \n', 'max_tokens'))

    const { text } = await write('Some prose,')
    expect(text).toBe('Some prose,more.')
    expect(text).not.toMatch(/\s$/)
  })
})
