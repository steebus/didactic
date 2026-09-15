import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ConceptToJudge, SubjectToJudge } from '@/lib/llm/overlap'

const mockCreate = vi.fn()
vi.mock('@anthropic-ai/sdk', () => ({
  default: class { messages = { create: mockCreate } }
}))

beforeEach(() => {
  mockCreate.mockReset()
})

const CONCEPTS: ConceptToJudge[] = [
  {
    key: 'c1',
    name: 'P/E Ratio',
    description: 'Share price divided by earnings per share.',
    nearest: [
      {
        id: 'pe',
        title: 'Price-to-Earnings Ratio',
        summary: null,
        similarity: 0.88,
        subjects: ['Investing'],
      },
    ],
  },
  {
    key: 'c2',
    name: 'Speculation vs Investment',
    description: 'What separates buying on analysis from buying on price movement.',
    nearest: [],
  },
]

const SUBJECTS: SubjectToJudge[] = [
  { id: 'investing', title: 'Investing', topics: ['Price-to-Earnings Ratio'] },
  { id: 'rust', title: 'Rust', topics: ['Borrow checker'] },
]

const answered = (input: Record<string, unknown>, stop = 'end_turn') => ({
  stop_reason: stop,
  content: [{ type: 'tool_use', name: 'record_judgements', input }],
})

const judge = async (concepts = CONCEPTS, subjects = SUBJECTS) => {
  const { judgeConcepts } = await import('@/lib/llm/overlap')
  return judgeConcepts({ resourceTitle: 'The Intelligent Investor', concepts, subjects })
}

describe('reading concepts against the map', () => {
  it('shows the model the descriptions on both sides, and the subjects', async () => {
    mockCreate.mockResolvedValue(answered({ judgements: [] }))
    await judge()

    const prompt = mockCreate.mock.calls[0][0].messages[0].content as string
    expect(prompt).toContain('Share price divided by earnings per share.')
    expect(prompt).toContain('pe: Price-to-Earnings Ratio — (no description) [in Investing]')
    expect(prompt).toContain('investing: Investing — holds Price-to-Earnings Ratio')
  })

  it('reads a sameness claim, a confident no, and the subjects', async () => {
    mockCreate.mockResolvedValue(answered({
      judgements: [
        { concept: 'c1', same_as: 'pe', confidence: 0.9, subjects: ['investing'] },
        { concept: 'c2', same_as: null, confidence: 0.85, subjects: ['investing'] },
      ],
    }))
    const verdicts = await judge()

    expect(verdicts?.get('c1')).toEqual({ sameAs: 'pe', distinct: false, subjects: ['investing'] })
    expect(verdicts?.get('c2')).toEqual({ sameAs: null, distinct: true, subjects: ['investing'] })
  })

  it('keeps a reading that says a concept stands alone', async () => {
    // Empty is an answer -- filed nowhere -- and has to survive as one
    // rather than as a missing verdict, which means "judge by name".
    mockCreate.mockResolvedValue(answered({
      judgements: [{ concept: 'c2', same_as: null, confidence: 0.8, subjects: [] }],
    }))
    const verdicts = await judge()
    expect(verdicts?.get('c2')?.subjects).toEqual([])
    expect(verdicts?.has('c1')).toBe(false)
  })

  it('drops an unsure claim either way', async () => {
    mockCreate.mockResolvedValue(answered({
      judgements: [
        { concept: 'c1', same_as: 'pe', confidence: 0.5, subjects: [] },
        { concept: 'c2', same_as: null, confidence: 0.4, subjects: [] },
      ],
    }))
    const verdicts = await judge()
    expect(verdicts?.get('c1')).toMatchObject({ sameAs: null, distinct: false })
    expect(verdicts?.get('c2')).toMatchObject({ sameAs: null, distinct: false })
  })

  it('refuses ids it was never shown', async () => {
    mockCreate.mockResolvedValue(answered({
      judgements: [
        // Not one of c1's nearest, and not a subject on the list.
        { concept: 'c1', same_as: 'someone-else', confidence: 0.95, subjects: ['investing', 'gardening', 'investing'] },
        { concept: 'c9', same_as: null, confidence: 0.9, subjects: ['investing'] },
      ],
    }))
    const verdicts = await judge()
    // A confident same_as naming nothing shown is confusion, not a no.
    expect(verdicts?.get('c1')).toEqual({ sameAs: null, distinct: false, subjects: ['investing'] })
    expect(verdicts?.size).toBe(1)
  })

  it('reads judgements that arrived as JSON text', async () => {
    mockCreate.mockResolvedValue(answered({
      judgements: JSON.stringify([{ concept: 'c1', same_as: null, confidence: 0.9, subjects: ['rust'] }]),
    }))
    const verdicts = await judge()
    expect(verdicts?.get('c1')?.subjects).toEqual(['rust'])
  })

  it('gives up on a truncated answer rather than reading half of it', async () => {
    mockCreate.mockResolvedValue(answered({
      judgements: [{ concept: 'c1', same_as: null, confidence: 0.9, subjects: ['investing'] }],
    }, 'max_tokens'))
    expect(await judge()).toBeNull()
  })

  it('does not ask when there is nothing on the map to judge against', async () => {
    const alone = CONCEPTS.map(c => ({ ...c, nearest: [] }))
    expect(await judge(alone, [])).toBeNull()
    expect(mockCreate).not.toHaveBeenCalled()
  })
})
