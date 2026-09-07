import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockCreate = vi.fn()
vi.mock('@anthropic-ai/sdk', () => ({
  default: class { messages = { create: mockCreate } }
}))

beforeEach(() => { mockCreate.mockReset() })

function toolResponse(edges: unknown) {
  return { content: [{ type: 'tool_use', name: 'record_edges', input: { edges } }] }
}

describe('proposeEdges', () => {
  it('returns proposed edges', async () => {
    mockCreate.mockResolvedValue(toolResponse([
      { from: 'a', to: 'b', kind: 'prereq', weight: 0.8 },
    ]))
    const { proposeEdges } = await import('@/lib/llm/edges')
    const result = await proposeEdges([{ id: 'a', title: 'React Hooks' }], [{ id: 'b', title: 'JavaScript' }])
    expect(result).toEqual([{ from: 'a', to: 'b', kind: 'prereq', weight: 0.8 }])
  })

  it('drops edges referencing ids that were not supplied', async () => {
    mockCreate.mockResolvedValue(toolResponse([
      { from: 'a', to: 'b', kind: 'related', weight: 0.5 },
      { from: 'a', to: 'ghost', kind: 'related', weight: 0.5 },
    ]))
    const { proposeEdges } = await import('@/lib/llm/edges')
    const result = await proposeEdges([{ id: 'a', title: 'x' }], [{ id: 'b', title: 'y' }])
    expect(result).toHaveLength(1)
  })

  it('drops edges with an invalid kind', async () => {
    mockCreate.mockResolvedValue(toolResponse([
      { from: 'a', to: 'b', kind: 'invented', weight: 0.5 },
    ]))
    const { proposeEdges } = await import('@/lib/llm/edges')
    expect(await proposeEdges([{ id: 'a', title: 'x' }], [{ id: 'b', title: 'y' }])).toEqual([])
  })

  it('drops self-edges', async () => {
    mockCreate.mockResolvedValue(toolResponse([
      { from: 'a', to: 'a', kind: 'related', weight: 0.5 },
    ]))
    const { proposeEdges } = await import('@/lib/llm/edges')
    expect(await proposeEdges([{ id: 'a', title: 'x' }], [])).toEqual([])
  })

  it('returns nothing when there are no new topics, without calling the model', async () => {
    const { proposeEdges } = await import('@/lib/llm/edges')
    expect(await proposeEdges([], [{ id: 'b', title: 'y' }])).toEqual([])
    expect(mockCreate).not.toHaveBeenCalled()
  })
})
