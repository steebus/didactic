import { describe, it, expect } from 'vitest'
import {
  routeProgress,
  aggregateRoutes,
  routeLevel,
  routeCaption,
  ROUTE_LABEL,
} from '@/lib/progress'
import { orderSubjectOutline } from '@/lib/outline'
import type { SubjectTopicRow, TopicTreeNode } from '@/lib/subject'

const route = (status: 'draft' | 'active' | 'archived', total: number, complete: number) => ({
  status,
  total,
  complete,
})

describe('routeProgress', () => {
  it('is no-route when there are no curricula', () => {
    expect(routeProgress([]).state).toBe('no-route')
  })

  it('is drafted while the only route is a draft, however many lessons are marked', () => {
    const p = routeProgress([route('draft', 5, 3)])
    expect(p.state).toBe('drafted')
    // A draft counts for nothing, so its fraction never reads as started.
    expect(p.complete).toBe(3)
  })

  it('is unstarted when an approved route has nothing worked', () => {
    expect(routeProgress([route('active', 6, 0)]).state).toBe('unstarted')
  })

  it('is in-progress part way through an approved route', () => {
    const p = routeProgress([route('active', 8, 3)])
    expect(p.state).toBe('in-progress')
    expect(p.fraction).toBeCloseTo(3 / 8)
  })

  it('is worked once every lesson of an approved route is done', () => {
    expect(routeProgress([route('active', 4, 4)]).state).toBe('worked')
  })

  it('prefers an approved route over a draft', () => {
    expect(routeProgress([route('draft', 3, 0), route('active', 2, 1)]).state).toBe('in-progress')
  })
})

describe('aggregateRoutes', () => {
  it('leaves routeless topics out of the sum rather than dragging it to zero', () => {
    const agg = aggregateRoutes([
      routeProgress([]),
      routeProgress([route('active', 4, 4)]),
    ])
    expect(agg.state).toBe('worked')
    expect(agg.complete).toBe(4)
    expect(agg.total).toBe(4)
  })

  it('is no-route when nothing in the subject has a route', () => {
    expect(aggregateRoutes([routeProgress([]), routeProgress([])]).state).toBe('no-route')
  })

  it('derives the word from the summed lessons', () => {
    const agg = aggregateRoutes([
      routeProgress([route('active', 4, 2)]),
      routeProgress([route('active', 6, 0)]),
    ])
    expect(agg.state).toBe('in-progress')
    expect(agg.complete).toBe(2)
    expect(agg.total).toBe(10)
  })
})

describe('routeLevel and routeCaption', () => {
  it('grows the plant from bare ground to full flower', () => {
    expect(routeLevel(routeProgress([]))).toBe(0)
    expect(routeLevel(routeProgress([route('active', 4, 4)]))).toBe(5)
  })

  it('keeps an in-progress plant between seedling and in-leaf', () => {
    const level = routeLevel(routeProgress([route('active', 8, 3)]))
    expect(level).toBeGreaterThanOrEqual(2)
    expect(level).toBeLessThanOrEqual(4)
  })

  it('captions with the real figure, not a roots stage name', () => {
    expect(routeCaption(routeProgress([route('active', 8, 3)]))).toBe('3 of 8 worked')
    expect(routeCaption(routeProgress([]))).toBe('No route yet')
    expect(ROUTE_LABEL['in-progress']).toBe('In progress')
  })
})

// --- The outline reordering -------------------------------------------

function topicRow(over: Partial<SubjectTopicRow> & { id: string }): SubjectTopicRow {
  return {
    title: over.id,
    summary: null,
    ability: 1,
    ability_confidence: 1,
    freshness: 0,
    last_exposure_at: null,
    state: 'active',
    alsoIn: [],
    resources: [],
    curricula: [],
    ...over,
  }
}

const node = (over: Partial<SubjectTopicRow> & { id: string }, children: TopicTreeNode[] = []): TopicTreeNode => ({
  topic: topicRow(over),
  children,
})

const activeRoute = [{ id: 'c', title: 'c', status: 'active' as const, total: 4, complete: 1, lessons: [] }]
const advancedLessons = [
  {
    id: 'x',
    title: 'x',
    status: 'active' as const,
    total: 1,
    complete: 0,
    lessons: [{ id: 'l', title: 'l', stage: 'advanced', completed: false }],
  },
]

describe('orderSubjectOutline', () => {
  it('floats a topic with a route in progress above the rest', () => {
    const ordered = orderSubjectOutline([
      node({ id: 'aardvark' }),
      node({ id: 'zebra', curricula: activeRoute }),
    ])
    expect(ordered.map(n => n.topic.id)).toEqual(['zebra', 'aardvark'])
  })

  it('floats a recently tended topic above a cold one', () => {
    const ordered = orderSubjectOutline([
      node({ id: 'cold' }),
      node({ id: 'warm', freshness: 0.8, last_exposure_at: '2026-09-01' }),
    ])
    expect(ordered.map(n => n.topic.id)).toEqual(['warm', 'cold'])
  })

  it('orders siblings of equal attention simpler-first, then by title', () => {
    const ordered = orderSubjectOutline([
      node({ id: 'hard', title: 'Aaa', curricula: advancedLessons }),
      node({ id: 'easy', title: 'Zzz' }),
    ])
    // 'easy' has no advanced lessons, so it sits below the neutral line
    // above 'hard' despite the later title.
    expect(ordered.map(n => n.topic.id)).toEqual(['easy', 'hard'])
  })

  it('reorders siblings at every depth and keeps the subtree with its branch', () => {
    const ordered = orderSubjectOutline([
      node({ id: 'root' }, [
        node({ id: 'child-cold' }),
        node({ id: 'child-warm', curricula: activeRoute }),
      ]),
    ])
    expect(ordered[0].children.map(n => n.topic.id)).toEqual(['child-warm', 'child-cold'])
  })

  it('is a pure function of the data, so the same bed prints the same way twice', () => {
    const build = () => [
      node({ id: 'b', freshness: 0.8, last_exposure_at: '2026-09-01' }),
      node({ id: 'a' }),
      node({ id: 'c', curricula: activeRoute }),
    ]
    const first = orderSubjectOutline(build()).map(n => n.topic.id)
    const second = orderSubjectOutline(build().reverse()).map(n => n.topic.id)
    expect(first).toEqual(second)
  })
})
