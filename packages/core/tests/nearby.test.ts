import { describe, it, expect } from 'vitest'
import { edgeKindLabel, nearbyTopics, type Neighbour } from '../src/graph'

/** An edge as the topic sheet hands it over: the far topic, the kind,
 *  and whether the edge points at the sheet's own topic. */
const near = (id: string, kind: string, incoming: boolean): Neighbour =>
  ({ id, title: id, kind, incoming })

describe('edgeKindLabel', () => {
  it('turns the two nesting kinds round at the other end', () => {
    // `prereq` runs earlier -> later, so an edge pointing at this topic
    // has the neighbour at the earlier end: that one is sown first, and
    // the one this topic points at is sown after. Printing "sow first"
    // for both told a reader to start with the topic that follows.
    expect(edgeKindLabel('prereq', true)).toBe('sow first')
    expect(edgeKindLabel('prereq', false)).toBe('sow after')

    // `specialises` runs general -> narrower.
    expect(edgeKindLabel('specialises', true)).toBe('broader than')
    expect(edgeKindLabel('specialises', false)).toBe('variety of')
  })

  it('reads the sideways kinds the same either way, because they are', () => {
    for (const kind of ['related', 'alternative']) {
      expect(edgeKindLabel(kind, true)).toBe(edgeKindLabel(kind, false))
    }
  })

  it('falls back to the kind itself rather than to nothing', () => {
    expect(edgeKindLabel('invented', false)).toBe('invented')
  })
})

describe('nearbyTopics', () => {
  it('prints a topic once however many edges reach it', () => {
    const rows = nearbyTopics([
      near('react', 'related', false),
      near('react', 'prereq', true),
      near('react', 'specialises', false),
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0].kind).toBe('prereq')
  })

  it('collapses a relation written from both ends', () => {
    // Two rows in the table, one thing said.
    const rows = nearbyTopics([
      near('caching', 'related', true),
      near('caching', 'related', false),
    ])
    expect(rows).toHaveLength(1)
  })

  it('keeps the most definite claim, and leaves `related` last', () => {
    const rows = nearbyTopics([
      near('c', 'related', false),
      near('a', 'prereq', true),
      near('d', 'alternative', false),
      near('b', 'specialises', true),
    ])
    expect(rows.map(r => r.id)).toEqual(['a', 'b', 'd', 'c'])
  })

  it('orders by title inside one kind, so the list is the same tomorrow', () => {
    const rows = nearbyTopics([
      { id: '2', title: 'Zlib', kind: 'related', incoming: true },
      { id: '1', title: 'Apples', kind: 'related', incoming: true },
    ])
    expect(rows.map(r => r.title)).toEqual(['Apples', 'Zlib'])
  })

  it('answers an empty bed with an empty list', () => {
    expect(nearbyTopics([])).toEqual([])
  })
})
