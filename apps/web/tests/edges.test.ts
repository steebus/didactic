import { describe, it, expect, vi, beforeEach } from 'vitest'

const evaluate = vi.fn()
vi.mock('ai', () => ({ experimental_evaluate: evaluate }))

beforeEach(() => { evaluate.mockReset() })

/** Answer every pair question the same way. */
const answering = (choice: string, p: number) =>
  evaluate.mockImplementation(async ({ questions }: { questions: Record<string, unknown> }) => ({
    answers: Object.fromEntries(Object.keys(questions).map(id => [id, { choice, probabilities: { [choice]: p } }])),
  }))

describe('proposeEdges', () => {
  it('draws the relation the reading was sure of, at its probability', async () => {
    answering('a_first', 0.8)
    const { proposeEdges } = await import('@/lib/llm/edges')
    const result = await proposeEdges([{ id: 'a', title: 'JavaScript' }], [{ id: 'b', title: 'React Hooks' }])
    expect(result).toEqual([{ from: 'a', to: 'b', kind: 'prereq', weight: 0.8 }])
  })

  it('turns a relation read the other way round into an edge that runs that way', async () => {
    answering('b_holds', 0.9)
    const { proposeEdges } = await import('@/lib/llm/edges')
    const result = await proposeEdges([{ id: 'a', title: 'React Hooks' }], [{ id: 'b', title: 'React' }])
    expect(result).toEqual([{ from: 'b', to: 'a', kind: 'specialises', weight: 0.9 }])
  })

  it('draws nothing for none, or for a relation it was unsure of', async () => {
    const { proposeEdges } = await import('@/lib/llm/edges')
    answering('none', 0.9)
    expect(await proposeEdges([{ id: 'a', title: 'x' }], [{ id: 'b', title: 'y' }])).toEqual([])
    answering('related', 0.3)
    expect(await proposeEdges([{ id: 'a', title: 'x' }], [{ id: 'b', title: 'y' }])).toEqual([])
  })

  it('asks each pair once, and only about the nearest', async () => {
    answering('none', 1)
    const { proposeEdges } = await import('@/lib/llm/edges')
    const far = Array.from({ length: 20 }, (_, i) => ({ id: `n${i}`, title: `far ${i}`, embedding: [0, 1] }))
    await proposeEdges(
      [{ id: 'a', title: 'x', embedding: [1, 0] }, { id: 'b', title: 'y', embedding: '[1,0]' }],
      far
    )
    const asked = evaluate.mock.calls.flatMap(c => Object.values(c[0].questions as Record<string, { instructions: string }>))
    const about = asked.map(q => q.instructions)
    // a–b once, then seven far neighbours each.
    expect(about.filter(i => i.includes('"x"') && i.includes('"y"'))).toHaveLength(1)
    expect(asked).toHaveLength(1 + 7 + 7)
  })

  it('returns nothing when there are no new topics, without asking', async () => {
    const { proposeEdges } = await import('@/lib/llm/edges')
    expect(await proposeEdges([], [{ id: 'b', title: 'y' }])).toEqual([])
    expect(evaluate).not.toHaveBeenCalled()
  })
})
