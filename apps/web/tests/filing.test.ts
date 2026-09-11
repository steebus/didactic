import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockCreate = vi.fn()
vi.mock('@anthropic-ai/sdk', () => ({
  default: class { messages = { create: mockCreate } }
}))

beforeEach(() => {
  mockCreate.mockReset()
  process.env.ANTHROPIC_API_KEY = 'test-key'
})

const BED = [
  { id: 'order-routing', title: 'Order routing', summary: null, under: null },
  { id: 'custody', title: 'Custody', summary: null, under: 'order-routing' },
]

const answered = (
  input: Record<string, unknown>,
  stop = 'end_turn'
) => ({
  stop_reason: stop,
  content: [{ type: 'tool_use', name: 'record_filing', input }],
})

const sort = async (bed = BED) => {
  const { sortIntoBed } = await import('@/lib/llm/filing')
  return sortIntoBed({
    subjectTitle: 'Brokerage',
    topic: { id: 'new', title: 'Settlement' },
    bed,
  })
}

describe('placing a topic in the bed it was added to', () => {
  it('keeps the edges that put it under something', async () => {
    mockCreate.mockResolvedValue(answered({
      same_as: null,
      confidence: 0,
      edges: [
        { from: 'order-routing', to: 'new', kind: 'prereq', weight: 0.8 },
        { from: 'custody', to: 'new', kind: 'related', weight: 0.5 },
      ],
      note: 'Filed after order routing.',
    }))

    const sorted = await sort()

    expect(sorted?.edges).toHaveLength(2)
    expect(sorted?.note).toBe('Filed after order routing.')
  })

  it('drops an edge that does not touch the new topic', async () => {
    // Relating two topics that were already here is answering a
    // question nobody asked, and would let one hand-added topic
    // quietly reshape the rest of the bed.
    mockCreate.mockResolvedValue(answered({
      same_as: null,
      confidence: 0,
      edges: [
        { from: 'order-routing', to: 'custody', kind: 'prereq', weight: 0.9 },
        { from: 'order-routing', to: 'new', kind: 'prereq', weight: 0.8 },
      ],
      note: null,
    }))

    expect((await sort())?.edges).toEqual([
      { from: 'order-routing', to: 'new', kind: 'prereq', weight: 0.8 },
    ])
  })

  it('drops an edge to a topic that is not in the bed, or of no known kind', async () => {
    mockCreate.mockResolvedValue(answered({
      same_as: null,
      confidence: 0,
      edges: [
        { from: 'invented', to: 'new', kind: 'prereq', weight: 0.8 },
        { from: 'new', to: 'custody', kind: 'sort-of-like', weight: 0.8 },
        { from: 'new', to: 'new', kind: 'related', weight: 1 },
      ],
      note: null,
    }))

    expect((await sort())?.edges).toEqual([])
  })
})

describe('a claim that the topic is already here', () => {
  it('is raised when the sort is sure', async () => {
    mockCreate.mockResolvedValue(answered({
      same_as: 'custody', confidence: 0.9, edges: [], note: null,
    }))

    expect((await sort())?.sameAs).toBe('custody')
  })

  it('is dropped when it is a guess', async () => {
    // The caller turns a claim into an adjudication, so a half-sure
    // one costs the user a decision they did not need to make.
    mockCreate.mockResolvedValue(answered({
      same_as: 'custody', confidence: 0.4, edges: [], note: null,
    }))

    expect((await sort())?.sameAs).toBeNull()
  })

  it('is dropped when it names something that is not here', async () => {
    mockCreate.mockResolvedValue(answered({
      same_as: 'somewhere-else', confidence: 1, edges: [], note: null,
    }))

    expect((await sort())?.sameAs).toBeNull()
  })
})

describe('a bed that cannot be read', () => {
  it('is not read at all when it is empty', async () => {
    expect(await sort([])).toBeNull()
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('is given up on rather than half-read', async () => {
    // Half a placement files the topic under the first thing the model
    // reached before it ran out, which is worse than leaving it
    // unplaced for the bed's own edge pass to pick up.
    mockCreate.mockResolvedValue(answered({
      same_as: null, confidence: 0,
      edges: [{ from: 'order-routing', to: 'new', kind: 'prereq', weight: 0.8 }],
      note: null,
    }, 'max_tokens'))

    expect(await sort()).toBeNull()
  })

  it('never sees the topic it is placing listed as already there', async () => {
    mockCreate.mockResolvedValue(answered({
      same_as: null, confidence: 0, edges: [], note: null,
    }))

    await sort([...BED, { id: 'new', title: 'Settlement', summary: null, under: null }])

    const prompt = mockCreate.mock.calls[0][0].messages[0].content as string
    const alreadyHere = prompt.slice(prompt.indexOf('ALREADY HERE:'))
    expect(alreadyHere).not.toContain('new: Settlement')
  })
})
