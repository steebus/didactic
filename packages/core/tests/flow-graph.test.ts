import { describe, it, expect } from 'vitest'
import { flowGraph, flowPath, flowNodeSize, wrapCount, FLOW_NODE_WIDTH } from '../src/flowGraph'
import { BLOCKS, type FlowStepData } from '../src/blocks'

/** The block's own example, which is also what the writing agent is shown. */
const example = (): FlowStepData[] =>
  JSON.parse(BLOCKS.find(b => b.name === 'flow')!.example).steps

describe('flowGraph', () => {
  it('runs a plain lane top to bottom', () => {
    const { nodes, edges } = flowGraph([
      { text: 'One' },
      { text: 'Two' },
      { text: 'Three' },
    ])
    expect(nodes.map(n => n.text)).toEqual(['One', 'Two', 'Three'])
    expect(edges).toEqual([
      { from: '0', to: '1' },
      { from: '1', to: '2' },
    ])
  })

  it('marks a step that parts as a question', () => {
    const { nodes } = flowGraph([
      { text: 'Is it?', branches: [{ label: 'Yes', steps: [{ text: 'Do this' }] }] },
    ])
    expect(nodes.find(n => n.text === 'Is it?')?.kind).toBe('ask')
    expect(nodes.find(n => n.text === 'Do this')?.kind).toBe('step')
  })

  it('puts the branch label on the edge out of the question', () => {
    const { edges } = flowGraph([
      {
        text: 'Is it?',
        branches: [
          { label: 'Yes', steps: [{ text: 'Left' }] },
          { label: 'No', steps: [{ text: 'Right' }] },
        ],
      },
    ])
    expect(edges).toEqual([
      { from: '0', to: '0.0.0', label: 'Yes' },
      { from: '0', to: '0.1.0', label: 'No' },
    ])
  })

  it('labels only the first step of the lane, not every step in it', () => {
    const { edges } = flowGraph([
      {
        text: 'Is it?',
        branches: [{ label: 'No', steps: [{ text: 'First' }, { text: 'Second' }] }],
      },
    ])
    expect(edges).toEqual([
      { from: '0', to: '0.0.0', label: 'No' },
      { from: '0.0.0', to: '0.0.1' },
    ])
  })

  /* This is the whole reason the module exists: the tree says the
     rejoin by the branches running out, and the drawing needs a line
     from each of those ends to the step underneath. */
  it('joins every end of every branch to what comes after the parting', () => {
    const { edges } = flowGraph([
      {
        text: 'Is it?',
        branches: [
          { label: 'Yes', steps: [{ text: 'Left' }] },
          { label: 'No', steps: [{ text: 'Right one' }, { text: 'Right two' }] },
        ],
      },
      { text: 'Afterwards' },
    ])
    const into = edges.filter(e => e.to === '1').map(e => e.from).sort()
    expect(into).toEqual(['0.0.0', '0.1.1'])
  })

  it('keeps two steps that say the same words apart', () => {
    const { nodes, edges } = flowGraph([
      {
        text: 'Is it?',
        branches: [
          { label: 'Yes', steps: [{ text: 'Leave it alone' }] },
          { label: 'No', steps: [{ text: 'Leave it alone' }] },
        ],
      },
    ])
    expect(nodes.filter(n => n.text === 'Leave it alone')).toHaveLength(2)
    expect(new Set(edges.map(e => e.to)).size).toBe(2)
  })

  it('ends a branch that names where it goes, and descends no further', () => {
    const { nodes, edges } = flowGraph([
      { text: 'Start', goes: 'The other flow' },
      { text: 'Never reached from Start' },
    ])
    const away = nodes.find(n => n.kind === 'goes')
    expect(away?.text).toBe('The other flow')
    expect(edges).toEqual([{ from: '0', to: '0.goes' }])
  })

  it('nests a second parting rather than refusing it', () => {
    const { nodes } = flowGraph([
      {
        text: 'First?',
        branches: [
          {
            label: 'Yes',
            steps: [{ text: 'Second?', branches: [{ label: 'Yes', steps: [{ text: 'Deep' }] }] }],
          },
        ],
      },
    ])
    expect(nodes.find(n => n.text === 'Deep')?.depth).toBe(2)
  })

  it('drops a step with no words', () => {
    const { nodes } = flowGraph([{ text: 'One' }, { detail: 'orphan' }, { text: 'Two' }])
    expect(nodes.map(n => n.text)).toEqual(['One', 'Two'])
  })

  it('answers an empty flow with an empty graph', () => {
    expect(flowGraph(undefined)).toEqual({ nodes: [], edges: [] })
    expect(flowGraph([])).toEqual({ nodes: [], edges: [] })
  })

  it('builds the block example into one connected graph', () => {
    const { nodes, edges } = flowGraph(example())
    expect(nodes.length).toBeGreaterThan(4)
    // Every node but the first is reached by something.
    const reached = new Set(edges.map(e => e.to))
    for (const node of nodes.slice(1)) expect(reached.has(node.id)).toBe(true)
    // No edge points at a node that is not in the graph.
    const ids = new Set(nodes.map(n => n.id))
    for (const edge of edges) {
      expect(ids.has(edge.from)).toBe(true)
      expect(ids.has(edge.to)).toBe(true)
    }
  })
})

describe('flowPath', () => {
  const graph = flowGraph([
    {
      text: 'Is it?',
      branches: [
        { label: 'Yes', steps: [{ text: 'Left' }] },
        { label: 'No', steps: [{ text: 'Right' }] },
      ],
    },
    { text: 'Afterwards' },
  ])

  it('lights the way in and the way out of a step in the middle', () => {
    const lit = flowPath(graph, '0.0.0')
    expect(lit.nodes).toEqual(new Set(['0.0.0', '0', '1']))
    // The other arm of the question is not on the way to or from here.
    expect(lit.nodes.has('0.1.0')).toBe(false)
  })

  it('lights the edges of that path and no others', () => {
    const lit = flowPath(graph, '0.0.0')
    expect(lit.edges.has('0>0.0.0')).toBe(true)
    expect(lit.edges.has('0.0.0>1')).toBe(true)
    expect(lit.edges.has('0>0.1.0')).toBe(false)
    expect(lit.edges.has('0.1.0>1')).toBe(false)
  })

  it('lights every way down from the top', () => {
    const lit = flowPath(graph, '0')
    expect(lit.nodes).toEqual(new Set(['0', '0.0.0', '0.1.0', '1']))
  })

  it('lights nothing for nothing, or for a node that is not there', () => {
    expect(flowPath(graph, null).nodes.size).toBe(0)
    expect(flowPath(graph, 'nope').nodes.size).toBe(0)
  })

  it('terminates on a graph that loops back on itself', () => {
    const looped = { nodes: [{ id: 'a', kind: 'step' as const, text: 'A', depth: 0 }], edges: [{ from: 'a', to: 'a' }] }
    expect(flowPath(looped, 'a').nodes).toEqual(new Set(['a']))
  })
})

describe('wrapCount', () => {
  it('keeps what fits on one line', () => {
    expect(wrapCount('one two', 20)).toBe(1)
  })

  it('breaks where the words stop fitting', () => {
    expect(wrapCount('aaaa bbbb cccc', 9)).toBe(2)
  })

  it('counts nothing as one line rather than none', () => {
    expect(wrapCount('   ', 10)).toBe(1)
  })

  it('runs a word longer than the line over, and terminates', () => {
    expect(wrapCount('aaaaaaaaaaaa', 4)).toBe(3)
  })
})

describe('flowNodeSize', () => {
  it('gives every node the same width, so the browser wraps as we did', () => {
    const a = flowNodeSize({ id: 'a', kind: 'step', text: 'Short', depth: 0 })
    const b = flowNodeSize({ id: 'b', kind: 'step', text: 'A much longer line of text here', depth: 0 })
    expect(a.width).toBe(FLOW_NODE_WIDTH)
    expect(b.width).toBe(FLOW_NODE_WIDTH)
  })

  it('makes room for more words', () => {
    const short = flowNodeSize({ id: 'a', kind: 'step', text: 'Short', depth: 0 })
    const long = flowNodeSize({
      id: 'b',
      kind: 'step',
      text: 'A considerably longer step that will certainly wrap onto several lines',
      depth: 0,
    })
    expect(long.height).toBeGreaterThan(short.height)
  })

  it('makes room for a detail under the text', () => {
    const without = flowNodeSize({ id: 'a', kind: 'step', text: 'Step', depth: 0 })
    const with_ = flowNodeSize({ id: 'a', kind: 'step', text: 'Step', detail: 'And why', depth: 0 })
    expect(with_.height).toBeGreaterThan(without.height)
  })
})
