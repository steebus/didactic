import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { AskDeps } from '@/lib/llm/ask'

/**
 * The agent loop, exercised with a fake model.
 *
 * The SDK is mocked rather than called: what is being tested is which
 * effects a tool call produces and what survives a failure, neither of
 * which needs a real answer from a model.
 */

const create = vi.fn()

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create }
  },
}))

function deps(over: Partial<AskDeps> = {}): AskDeps {
  return {
    addMark: vi.fn(async () => ({ id: 'mark-1' })),
    addCard: vi.fn(async () => ({ id: 'card-1' })),
    readLesson: vi.fn(async () => 'The lesson body.'),
    searchMap: vi.fn(async () => []),
    ...over,
  }
}

/** A reply with one tool call in it. */
function callingTool(name: string, input: unknown) {
  return {
    content: [
      { type: 'text', text: 'One moment.' },
      { type: 'tool_use', id: 'tu_1', name, input },
    ],
  }
}

/** A reply that just answers. */
function answering(text: string) {
  return { content: [{ type: 'text', text }] }
}

beforeEach(() => {
  create.mockReset()
  process.env.ANTHROPIC_API_KEY = 'test-key'
})

afterEach(() => {
  vi.resetModules()
})

describe('what the agent does with a tool call', () => {
  it('keeps a mark and reports it as a write', async () => {
    const { askTurn } = await import('@/lib/llm/ask')
    const d = deps()
    create
      .mockResolvedValueOnce(callingTool('add_mark', { quote: 'the rate is annual', note: 'why' }))
      .mockResolvedValueOnce(answering('Kept that for you.'))

    const turn = await askTurn({
      context: { route: 'lesson', entityId: 'l1' },
      history: [],
      message: 'keep that bit',
      deps: d,
    })

    expect(d.addMark).toHaveBeenCalledWith('the rate is annual', 'why')
    expect(turn.writes).toEqual([{ kind: 'mark', id: 'mark-1', label: 'the rate is annual' }])
    expect(turn.proposals).toEqual([])
    expect(turn.text).toBe('Kept that for you.')
  })

  it('offers a topic without creating one, which is the whole point of the split', async () => {
    const { askTurn } = await import('@/lib/llm/ask')
    const d = deps()
    create
      .mockResolvedValueOnce(callingTool('propose_topic', { name: 'Pin/Unpin', summary: 'what it is' }))
      .mockResolvedValueOnce(answering('Offered.'))

    const turn = await askTurn({
      context: { route: 'lesson' },
      history: [],
      message: 'is that a topic?',
      deps: d,
    })

    expect(turn.proposals).toEqual([{ kind: 'topic', name: 'Pin/Unpin', summary: 'what it is' }])
    expect(turn.writes).toEqual([])
  })

  it('keeps the explanation when a write fails, rather than losing the turn', async () => {
    const { askTurn } = await import('@/lib/llm/ask')
    const d = deps({
      addCard: vi.fn(async () => {
        throw new Error('the card could not be kept')
      }),
    })
    create
      .mockResolvedValueOnce(callingTool('add_card', { question: 'q', answer: 'a' }))
      .mockResolvedValueOnce(answering('Here is why it compounds.'))

    const turn = await askTurn({
      context: { route: 'lesson' },
      history: [],
      message: 'explain',
      deps: d,
    })

    expect(turn.text).toBe('Here is why it compounds.')
    expect(turn.writes).toEqual([])
  })

  it('refuses a card missing its answer rather than writing a row the constraint would reject', async () => {
    const { askTurn } = await import('@/lib/llm/ask')
    const d = deps()
    create
      .mockResolvedValueOnce(callingTool('add_card', { question: 'q' }))
      .mockResolvedValueOnce(answering('ok'))

    const turn = await askTurn({
      context: { route: 'lesson' },
      history: [],
      message: 'make a card',
      deps: d,
    })

    expect(d.addCard).not.toHaveBeenCalled()
    expect(turn.writes).toEqual([])
  })

  it('answers without any tool call at all', async () => {
    const { askTurn } = await import('@/lib/llm/ask')
    create.mockResolvedValueOnce(answering('Because the interest is paid on the interest.'))

    const turn = await askTurn({
      context: { route: 'lesson', sectionText: 'Compounding is...' },
      history: [],
      message: 'why?',
      deps: deps(),
    })

    expect(turn.text).toBe('Because the interest is paid on the interest.')
    expect(create).toHaveBeenCalledTimes(1)
  })

  it('does not blank the answer when a later round only calls a tool', async () => {
    const { askTurn } = await import('@/lib/llm/ask')
    // The first reply must carry a tool call, or the loop breaks there
    // and the later rounds never run -- which is what made an earlier
    // version of this test pass against deliberately broken code.
    create
      .mockResolvedValueOnce({
        content: [
          { type: 'text', text: 'The first thing to say.' },
          { type: 'tool_use', id: 'tu_1', name: 'search_map', input: { query: 'x' } },
        ],
      })
      // Text-free, and only a call: the earlier answer must survive it.
      .mockResolvedValueOnce({
        content: [{ type: 'tool_use', id: 'tu_2', name: 'search_map', input: { query: 'y' } }],
      })
      .mockResolvedValueOnce({ content: [] })

    const turn = await askTurn({
      context: { route: 'lesson' },
      history: [],
      message: 'hello',
      deps: deps(),
    })

    expect(create).toHaveBeenCalledTimes(3)
    expect(turn.text).toBe('The first thing to say.')
  })

  it('sends the section it was given before the reader says anything', async () => {
    const { askTurn } = await import('@/lib/llm/ask')
    create.mockResolvedValueOnce(answering('ok'))

    await askTurn({
      context: { route: 'lesson', sectionText: 'A rate is annual unless it says otherwise.' },
      history: [],
      message: 'what does that mean?',
      deps: deps(),
    })

    const sent = create.mock.calls[0][0].messages
    expect(sent[0].content).toContain('A rate is annual unless it says otherwise.')
    expect(sent[sent.length - 1].content).toBe('what does that mean?')
  })
})

describe('tool input that is not the shape it should be', () => {
  it('reads a mark out of input handed back as JSON text', async () => {
    const { askTurn } = await import('@/lib/llm/ask')
    const d = deps()
    // The fault `toolInput.ts` was written for: the whole input object
    // re-encoded as a string under the tool call. `Array.isArray` and
    // property access both fail on it, silently.
    create
      .mockResolvedValueOnce({
        content: [
          { type: 'text', text: 'One moment.' },
          {
            type: 'tool_use',
            id: 'tu_1',
            name: 'add_mark',
            input: JSON.stringify({ quote: 'the rate is annual', note: 'why' }),
          },
        ],
      })
      .mockResolvedValueOnce(answering('Kept.'))

    const turn = await askTurn({
      context: { route: 'lesson', entityId: 'l1' },
      history: [],
      message: 'keep that',
      deps: d,
    })

    expect(d.addMark).toHaveBeenCalledWith('the rate is annual', 'why')
    expect(turn.writes).toHaveLength(1)
  })

  it('refuses an object where a string belongs, rather than writing [object Object]', async () => {
    const { askTurn } = await import('@/lib/llm/ask')
    const d = deps()
    create
      .mockResolvedValueOnce(callingTool('add_mark', { quote: { a: 1 }, note: ['x'] }))
      .mockResolvedValueOnce(answering('ok'))

    const turn = await askTurn({
      context: { route: 'lesson', entityId: 'l1' },
      history: [],
      message: 'keep that',
      deps: d,
    })

    expect(d.addMark).not.toHaveBeenCalled()
    expect(turn.writes).toEqual([])
  })

  it('refuses a whitespace-only answer the database would reject anyway', async () => {
    const { askTurn } = await import('@/lib/llm/ask')
    const d = deps()
    create
      .mockResolvedValueOnce(callingTool('add_card', { question: 'q', answer: '   ' }))
      .mockResolvedValueOnce(answering('ok'))

    await askTurn({
      context: { route: 'lesson', entityId: 'l1' },
      history: [],
      message: 'make a card',
      deps: d,
    })

    expect(d.addCard).not.toHaveBeenCalled()
  })
})

describe('when the rounds run out', () => {
  it('still says something, because an empty message bricks the conversation', async () => {
    const { askTurn } = await import('@/lib/llm/ask')
    const d = deps()
    // Four tool-only rounds: the loop ends having written marks and
    // never having written a word.
    create.mockResolvedValue({
      content: [{ type: 'tool_use', id: 't', name: 'add_mark', input: { quote: 'q', note: 'n' } }],
    })

    const turn = await askTurn({
      context: { route: 'lesson', entityId: 'l1' },
      history: [],
      message: 'hi',
      deps: d,
    })

    expect(turn.text.trim()).not.toBe('')
    // And it says what it did, since the marks are real.
    expect(turn.text).toContain('mark')
    expect(turn.writes.length).toBeGreaterThan(0)
  })
})
