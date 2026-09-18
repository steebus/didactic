import { describe, it, expect } from 'vitest'
import { bandsOfBed, moveWithin, type TopicGroup } from '../src/groups'
import type { SubjectTopicRow, TopicTreeNode } from '../src/subject'

function topicRow(over: Partial<SubjectTopicRow> & { id: string }): SubjectTopicRow {
  return {
    title: over.id,
    summary: null,
    ability: 1,
    ability_confidence: 1,
    freshness: 0,
    last_exposure_at: null,
    state: 'active',
    position: null,
    group_id: null,
    alsoIn: [],
    resources: [],
    curricula: [],
    ...over,
  }
}

const node = (over: Partial<SubjectTopicRow> & { id: string }): TopicTreeNode => ({
  topic: topicRow(over),
  children: [],
})

const group = (id: string, title: string, position: number): TopicGroup => ({
  id,
  title,
  position,
})

describe('bandsOfBed', () => {
  it('boxes the grouped topics and leaves the rest loose', () => {
    const bands = bandsOfBed(
      [
        node({ id: 'js', position: 0, group_id: 'lang' }),
        node({ id: 'ts', position: 1, group_id: 'lang' }),
        node({ id: 'loop', position: 2 }),
      ],
      [group('lang', 'Language fundamentals', 0)]
    )
    expect(bands).toHaveLength(2)
    expect(bands[0].group?.title).toBe('Language fundamentals')
    expect(bands[0].topics.map(t => t.topic.id)).toEqual(['js', 'ts'])
    // The loose one is a band with no group, never a group called
    // something like "Other".
    expect(bands[1].group).toBeNull()
    expect(bands[1].topics.map(t => t.topic.id)).toEqual(['loop'])
  })

  it('keeps a loose topic the bed put first above the boxes', () => {
    // The whole of "not everything is grouped": a loose topic holds its
    // place in the order rather than being swept to the bottom.
    const bands = bandsOfBed(
      [
        node({ id: 'intro', position: 0 }),
        node({ id: 'js', position: 1, group_id: 'lang' }),
      ],
      [group('lang', 'Language fundamentals', 0)]
    )
    expect(bands[0].group).toBeNull()
    expect(bands[0].topics.map(t => t.topic.id)).toEqual(['intro'])
    expect(bands[1].group?.id).toBe('lang')
  })

  it('gathers a group scattered through the order into one box', () => {
    const bands = bandsOfBed(
      [
        node({ id: 'js', position: 0, group_id: 'lang' }),
        node({ id: 'tool', position: 1, group_id: 'build' }),
        node({ id: 'ts', position: 2, group_id: 'lang' }),
      ],
      [group('lang', 'Language', 0), group('build', 'Tooling', 1)]
    )
    expect(bands).toHaveLength(2)
    expect(bands[0].topics.map(t => t.topic.id)).toEqual(['js', 'ts'])
    expect(bands[1].topics.map(t => t.topic.id)).toEqual(['tool'])
  })

  it('keeps an empty group, because that is how a new one starts', () => {
    const bands = bandsOfBed(
      [node({ id: 'js', position: 0 })],
      [group('fresh', 'Just made', 0)]
    )
    expect(bands.some(b => b.group?.id === 'fresh')).toBe(true)
    expect(bands.find(b => b.group?.id === 'fresh')!.topics).toEqual([])
  })

  it('treats a topic naming a group this bed has not got as loose', () => {
    // Deleting a group sets its members' group_id to null, but a stale
    // read must not drop the topic entirely.
    const bands = bandsOfBed([node({ id: 'orphan', group_id: 'gone' })], [])
    expect(bands).toHaveLength(1)
    expect(bands[0].group).toBeNull()
    expect(bands[0].topics.map(t => t.topic.id)).toEqual(['orphan'])
  })

  it('never drops or repeats a topic, however the groups fall', () => {
    const bands = bandsOfBed(
      [
        node({ id: 'a', position: 0, group_id: 'x' }),
        node({ id: 'b', position: 1 }),
        node({ id: 'c', position: 2, group_id: 'x' }),
        node({ id: 'd', position: 3, group_id: 'y' }),
      ],
      [group('x', 'X', 0), group('y', 'Y', 1)]
    )
    const printed = bands.flatMap(b => b.topics.map(t => t.topic.id)).sort()
    expect(printed).toEqual(['a', 'b', 'c', 'd'])
  })
})

describe('the bed reordered by hand', () => {
  /**
   * A nudge writes one sequence over the whole subject, not one per
   * box, so moving a topic past a group boundary has to land it in the
   * next box rather than shuffling it inside its own.
   */
  it('moves a topic into the next group when it passes the boundary', () => {
    const order = ['a', 'b', 'c', 'd']
    const moved = moveWithin(order.map(id => ({ id })), 'b', 'down')
    expect(moved).toEqual(['a', 'c', 'b', 'd'])

    // Positions follow the new order, and `bandsOfBed` gathers by group
    // rather than by adjacency, so the bands stay whole.
    const bands = bandsOfBed(
      [
        node({ id: 'a', position: 0, group_id: 'x' }),
        node({ id: 'c', position: 1, group_id: 'y' }),
        node({ id: 'b', position: 2, group_id: 'x' }),
        node({ id: 'd', position: 3, group_id: 'y' }),
      ],
      [group('x', 'X', 0), group('y', 'Y', 1)]
    )
    expect(bands).toHaveLength(2)
    expect(bands[0].topics.map(t => t.topic.id)).toEqual(['a', 'b'])
    expect(bands[1].topics.map(t => t.topic.id)).toEqual(['c', 'd'])
  })

  it('keeps the reader order when every position is null', () => {
    // The state this bed is actually in: twenty-seven nulls. The order
    // the nudge writes is the first order it has ever had.
    const order = ['x', 'y', 'z']
    expect(moveWithin(order.map(id => ({ id })), 'z', 'up')).toEqual(['x', 'z', 'y'])
  })
})

describe('moveWithin', () => {
  const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]

  it('moves one up and one down', () => {
    expect(moveWithin(items, 'b', 'up')).toEqual(['b', 'a', 'c'])
    expect(moveWithin(items, 'b', 'down')).toEqual(['a', 'c', 'b'])
  })

  it('does nothing at either end rather than failing', () => {
    expect(moveWithin(items, 'a', 'up')).toEqual(['a', 'b', 'c'])
    expect(moveWithin(items, 'c', 'down')).toEqual(['a', 'b', 'c'])
  })

  it('does nothing for an id that is not there', () => {
    expect(moveWithin(items, 'zzz', 'up')).toEqual(['a', 'b', 'c'])
  })
})
