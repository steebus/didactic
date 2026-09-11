import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockCreate = vi.fn()
vi.mock('@anthropic-ai/sdk', () => ({
  default: class { messages = { create: mockCreate } }
}))

beforeEach(() => { mockCreate.mockReset() })

function toolResponse(payload: unknown) {
  return { content: [{ type: 'tool_use', name: 'record_qualifying_questions', input: payload }] }
}

const q = (prompt: string, level: number) => ({ prompt, level, probes: 'something' })

describe('proposeQualifyingQuestions', () => {
  it('returns the set the model wrote', async () => {
    mockCreate.mockResolvedValue(toolResponse({
      questions: [q('What is a hook?', 1), q('When does a hook fire twice?', 4)],
    }))
    const { proposeQualifyingQuestions } = await import('@/lib/llm/qualify')
    const questions = await proposeQualifyingQuestions({ subject: 'React' })
    expect(questions).toHaveLength(2)
    expect(questions[0].prompt).toBe('What is a hook?')
    expect(questions[0].probes).toBe('something')
  })

  it('sorts by difficulty, because the order is the point of the set', async () => {
    mockCreate.mockResolvedValue(toolResponse({
      questions: [q('hard', 5), q('easy', 1), q('middling', 3)],
    }))
    const { proposeQualifyingQuestions } = await import('@/lib/llm/qualify')
    const questions = await proposeQualifyingQuestions({ subject: 'React' })
    expect(questions.map(x => x.prompt)).toEqual(['easy', 'middling', 'hard'])
  })

  it('keeps the model order within one rung', async () => {
    mockCreate.mockResolvedValue(toolResponse({
      questions: [q('first', 2), q('second', 2), q('third', 2)],
    }))
    const { proposeQualifyingQuestions } = await import('@/lib/llm/qualify')
    const questions = await proposeQualifyingQuestions({ subject: 'React' })
    expect(questions.map(x => x.prompt)).toEqual(['first', 'second', 'third'])
  })

  it('clamps a rung outside 1-5 rather than sorting the set by it', async () => {
    mockCreate.mockResolvedValue(toolResponse({
      questions: [q('nonsense', 42), q('easy', 1)],
    }))
    const { proposeQualifyingQuestions } = await import('@/lib/llm/qualify')
    const questions = await proposeQualifyingQuestions({ subject: 'React' })
    expect(questions.map(x => x.level)).toEqual([1, 5])
  })

  it('defaults a missing rung to the middle instead of dropping the question', async () => {
    mockCreate.mockResolvedValue(toolResponse({
      questions: [{ prompt: 'no level given', probes: 'x' }],
    }))
    const { proposeQualifyingQuestions } = await import('@/lib/llm/qualify')
    const questions = await proposeQualifyingQuestions({ subject: 'React' })
    expect(questions[0].level).toBe(3)
  })

  it('drops questions with nothing to print', async () => {
    mockCreate.mockResolvedValue(toolResponse({
      questions: [q('real', 1), { level: 2, probes: 'x' }, q('   ', 3)],
    }))
    const { proposeQualifyingQuestions } = await import('@/lib/llm/qualify')
    const questions = await proposeQualifyingQuestions({ subject: 'React' })
    expect(questions.map(x => x.prompt)).toEqual(['real'])
  })

  it('caps the set at ten, keeping the easiest', async () => {
    mockCreate.mockResolvedValue(toolResponse({
      questions: Array.from({ length: 14 }, (_, i) => q(`q${i}`, (i % 5) + 1)),
    }))
    const { proposeQualifyingQuestions } = await import('@/lib/llm/qualify')
    const questions = await proposeQualifyingQuestions({ subject: 'React' })
    expect(questions).toHaveLength(10)
    expect(questions[0].level).toBe(1)
  })

  it('throws rather than returning an empty set', async () => {
    mockCreate.mockResolvedValue(toolResponse({ questions: [] }))
    const { proposeQualifyingQuestions } = await import('@/lib/llm/qualify')
    await expect(proposeQualifyingQuestions({ subject: 'React' })).rejects.toThrow('empty')
  })

  it('carries the roots figure into the brief so the set is aimed at it', async () => {
    mockCreate.mockResolvedValue(toolResponse({ questions: [q('a', 1)] }))
    const { proposeQualifyingQuestions } = await import('@/lib/llm/qualify')
    await proposeQualifyingQuestions({ subject: 'React', roots: 4 })
    const sent = JSON.stringify(mockCreate.mock.calls[0][0])
    expect(sent).toContain('4 out of 5')
  })
})
