import { describe, it, expect } from 'vitest'
import { buildTopicTree } from '@/lib/subject'

const topic = (id: string, title = id) => ({ id, title })

const edge = (from: string, to: string, kind = 'specialises', weight = 0.5) => ({
  from_topic: from,
  to_topic: to,
  kind,
  weight,
})

/** Flatten to "parent > child" pairs so a shape is easy to assert on. */
function pairs(nodes: ReturnType<typeof buildTopicTree>, parent = ''): string[] {
  return nodes.flatMap(node => [
    `${parent}>${node.topic.id}`,
    ...pairs(node.children as never, node.topic.id),
  ])
}

describe('buildTopicTree', () => {
  it('prints an unconnected subject as a flat list rather than as nothing', () => {
    const tree = buildTopicTree([topic('b'), topic('a'), topic('c')], [])
    expect(tree.map(n => n.topic.id)).toEqual(['a', 'b', 'c'])
    expect(tree.every(n => n.children.length === 0)).toBe(true)
  })

  it('nests a narrower topic under the general one', () => {
    const tree = buildTopicTree(
      [topic('photography'), topic('portraits')],
      [edge('photography', 'portraits')]
    )
    expect(pairs(tree)).toEqual(['>photography', 'photography>portraits'])
  })

  it('nests a topic under what must be learned first', () => {
    const tree = buildTopicTree(
      [topic('sql'), topic('indexes')],
      [edge('sql', 'indexes', 'prereq')]
    )
    expect(pairs(tree)).toEqual(['>sql', 'sql>indexes'])
  })

  it('ignores sideways relationships, which nest nothing', () => {
    const tree = buildTopicTree(
      [topic('redis'), topic('memcached')],
      [edge('redis', 'memcached', 'alternative'), edge('redis', 'memcached', 'related')]
    )
    expect(tree).toHaveLength(2)
  })

  it('ignores edges reaching outside the subject', () => {
    // The prerequisite is real, but it is not in this bed and cannot be
    // drawn in an outline of it.
    const tree = buildTopicTree([topic('indexes')], [edge('sql', 'indexes', 'prereq')])
    expect(pairs(tree)).toEqual(['>indexes'])
  })

  it('prefers a containment over an ordering when a topic has both', () => {
    const tree = buildTopicTree(
      [topic('lighting'), topic('exposure'), topic('flash')],
      [
        edge('exposure', 'flash', 'prereq', 0.9),
        edge('lighting', 'flash', 'specialises', 0.4),
      ]
    )
    expect(pairs(tree)).toContain('lighting>flash')
    expect(pairs(tree)).not.toContain('exposure>flash')
  })

  it('takes the strongest parent when two are the same kind', () => {
    const tree = buildTopicTree(
      [topic('a'), topic('b'), topic('c')],
      [edge('a', 'c', 'specialises', 0.3), edge('b', 'c', 'specialises', 0.9)]
    )
    expect(pairs(tree)).toContain('b>c')
  })

  it('breaks a tie by title, so the same data prints the same way twice', () => {
    const topics = [topic('x', 'Zebra'), topic('y', 'Apple'), topic('z', 'Child')]
    const edges = [edge('x', 'z', 'specialises', 0.5), edge('y', 'z', 'specialises', 0.5)]
    const first = pairs(buildTopicTree(topics, edges))
    const second = pairs(buildTopicTree([...topics].reverse(), [...edges].reverse()))
    expect(first).toEqual(second)
    expect(first).toContain('y>z')
  })

  it('survives a cycle instead of recursing forever', () => {
    const tree = buildTopicTree(
      [topic('a'), topic('b'), topic('c')],
      [edge('a', 'b'), edge('b', 'c'), edge('c', 'a')]
    )
    // One of the three has to become the root; which one does not
    // matter, only that every topic is printed exactly once.
    const printed = pairs(tree).map(p => p.split('>')[1]).sort()
    expect(printed).toEqual(['a', 'b', 'c'])
  })

  it('never drops a topic, however the edges run', () => {
    const topics = ['a', 'b', 'c', 'd', 'e'].map(id => topic(id))
    const tree = buildTopicTree(topics, [
      edge('a', 'b'),
      edge('b', 'c'),
      edge('a', 'd', 'prereq'),
      edge('d', 'a', 'prereq'),
      edge('e', 'e'),
    ])
    const printed = pairs(tree).map(p => p.split('>')[1]).sort()
    expect(printed).toEqual(['a', 'b', 'c', 'd', 'e'])
  })

  it('sorts siblings by title at every depth', () => {
    const tree = buildTopicTree(
      [topic('root'), topic('z', 'Zinnia'), topic('a', 'Aster'), topic('m', 'Marigold')],
      [edge('root', 'z'), edge('root', 'a'), edge('root', 'm')]
    )
    expect(tree[0].children.map(c => c.topic.id)).toEqual(['a', 'm', 'z'])
  })
})
