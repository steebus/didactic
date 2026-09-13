import { describe, it, expect } from 'vitest'
import {
  lessonState,
  lessonStandings,
  lessonNeighbours,
  LESSON_LABEL,
  LESSON_NOTE,
  LESSON_ORDER,
  type LessonLike,
} from '../src/lessonState'

const lesson = (over: Partial<LessonLike> = {}): LessonLike => ({
  completed_at: null,
  has_body: true,
  marks: 0,
  ...over,
})

describe('lessonState', () => {
  it('is unwritten when nothing has been written', () => {
    expect(lessonState(lesson({ has_body: false }))).toBe('unwritten')
  })

  it('is ready once there is a body and no sign of anyone in it', () => {
    expect(lessonState(lesson())).toBe('ready')
  })

  it('is started once a passage in it has been marked', () => {
    expect(lessonState(lesson({ marks: 2 }))).toBe('started')
  })

  it('is worked once it is finished', () => {
    expect(lessonState(lesson({ completed_at: '2026-09-01T00:00:00Z' }))).toBe('worked')
  })

  it('reads as worked before anything else', () => {
    // A finished lesson whose body was thrown away by a rewrite, or one
    // finished without marking a thing, is still finished. Completion
    // is the strongest fact there is about a lesson and nothing below
    // it may contradict it.
    expect(
      lessonState(lesson({ completed_at: '2026-09-01T00:00:00Z', has_body: false, marks: 0 }))
    ).toBe('worked')
  })
})

describe('lessonStandings', () => {
  it('marks the first unworked lesson as the one to pick up', () => {
    const standings = lessonStandings([
      lesson({ completed_at: '2026-09-01T00:00:00Z' }),
      lesson({ completed_at: '2026-09-02T00:00:00Z' }),
      lesson(),
      lesson({ has_body: false }),
    ])
    expect(standings.map(s => s.next)).toEqual([false, false, true, false])
  })

  it('marks exactly one, even where later lessons were worked out of order', () => {
    const standings = lessonStandings([
      lesson({ completed_at: '2026-09-01T00:00:00Z' }),
      lesson(),
      lesson({ completed_at: '2026-09-03T00:00:00Z' }),
      lesson(),
    ])
    expect(standings.filter(s => s.next).length).toBe(1)
    expect(standings[1].next).toBe(true)
  })

  it('marks none once every lesson is worked', () => {
    const standings = lessonStandings([
      lesson({ completed_at: '2026-09-01T00:00:00Z' }),
      lesson({ completed_at: '2026-09-02T00:00:00Z' }),
    ])
    expect(standings.some(s => s.next)).toBe(false)
  })

  it('marks the first of an untouched route', () => {
    const standings = lessonStandings([lesson({ has_body: false }), lesson({ has_body: false })])
    expect(standings[0].next).toBe(true)
  })

  it('has nothing to mark in an empty route', () => {
    expect(lessonStandings([])).toEqual([])
  })
})

describe('the vocabulary', () => {
  it('gives every state a word and a note', () => {
    for (const state of LESSON_ORDER) {
      expect(LESSON_LABEL[state]).toBeTruthy()
      expect(LESSON_NOTE[state]).toBeTruthy()
    }
  })

  it('orders least-worked first, like the other two channels', () => {
    expect(LESSON_ORDER).toEqual(['unwritten', 'ready', 'opened', 'started', 'worked'])
  })

  it('names every state exactly once', () => {
    expect(new Set(LESSON_ORDER).size).toBe(LESSON_ORDER.length)
    expect(LESSON_ORDER.length).toBe(Object.keys(LESSON_LABEL).length)
  })
})

describe('lessonNeighbours', () => {
  const route = [
    { id: 'a', title: 'Why it matters', has_body: true },
    { id: 'b', title: 'Measuring it', has_body: true },
    { id: 'c', title: 'Core vitals', has_body: true },
  ]

  it('gives both ways from the middle', () => {
    expect(lessonNeighbours(route, 'b')).toEqual({
      previous: { id: 'a', title: 'Why it matters', written: true },
      next: { id: 'c', title: 'Core vitals', written: true },
    })
  })

  it('has no previous at the start', () => {
    const { previous, next } = lessonNeighbours(route, 'a')
    expect(previous).toBeNull()
    expect(next).toEqual({ id: 'b', title: 'Measuring it', written: true })
  })

  it('has no next at the end', () => {
    const { previous, next } = lessonNeighbours(route, 'c')
    expect(previous).toEqual({ id: 'b', title: 'Measuring it', written: true })
    expect(next).toBeNull()
  })

  it('says when the next one has not been written', () => {
    const half = [route[0], { id: 'b', title: 'Measuring it', has_body: false }]
    expect(lessonNeighbours(half, 'a').next?.written).toBe(false)
  })

  it('calls a neighbour unwritten when nothing says either way', () => {
    // Offering to write a lesson that exists wastes a press; failing to
    // offer one that does not wastes a minute of the reader's time.
    const bare = [{ id: 'a', title: 'One' }, { id: 'b', title: 'Two' }]
    expect(lessonNeighbours(bare, 'a').next?.written).toBe(false)
  })

  it('has neither for a lesson the route does not hold', () => {
    expect(lessonNeighbours(route, 'elsewhere')).toEqual({ previous: null, next: null })
  })

  it('has neither in a route of one', () => {
    expect(lessonNeighbours([route[0]], 'a')).toEqual({ previous: null, next: null })
  })

  it('has neither in an empty route', () => {
    expect(lessonNeighbours([], 'a')).toEqual({ previous: null, next: null })
  })

  it('does not gate the way on by whether anything was worked', () => {
    // Nothing in this app is locked. A prerequisite not met is said out
    // loud on the lesson's own sheet, never enforced by hiding the way
    // there -- so the neighbours do not depend on completion at all.
    expect(lessonNeighbours(route, 'a').next).toEqual({
      id: 'b',
      title: 'Measuring it',
      written: true,
    })
  })
})

describe('opened: the rung that used to be missing', () => {
  it('reads a lesson the reader has been in as opened', () => {
    expect(lessonState(lesson({ opened_at: '2026-09-13T09:00:00Z' }))).toBe('opened')
  })

  it('still reads one nobody has been in as ready', () => {
    expect(lessonState(lesson())).toBe('ready')
    expect(lessonState(lesson({ opened_at: null }))).toBe('ready')
  })

  it('lets marking beat opening, because it is the stronger evidence', () => {
    expect(lessonState(lesson({ opened_at: '2026-09-13T09:00:00Z', marks: 2 }))).toBe('started')
  })

  it('lets finishing beat both', () => {
    expect(
      lessonState(
        lesson({ opened_at: '2026-09-13T09:00:00Z', marks: 2, completed_at: '2026-09-13T10:00:00Z' })
      )
    ).toBe('worked')
  })

  it('says nothing about a lesson with no body, however often it was opened', () => {
    // Opening an unwritten lesson is what writes it, so the open lands
    // before there is anything to have read. Until there is prose, the
    // honest word is still that there is none.
    expect(lessonState(lesson({ has_body: false, opened_at: '2026-09-13T09:00:00Z' }))).toBe(
      'unwritten'
    )
  })

  it('reads a caller that has never heard of it exactly as before', () => {
    // A phone on an older build, or a list assembled before 036: no
    // `opened_at` at all rather than a null one.
    const older = { completed_at: null, has_body: true, marks: 0 }
    expect(lessonState(older)).toBe('ready')
    expect(lessonState({ ...older, marks: 1 })).toBe('started')
  })

  it('does not move where the reader is up to', () => {
    // Opening a lesson and wandering off is not progress through a
    // route. `next` stays exact, on position and completion.
    const standings = lessonStandings([
      lesson({ completed_at: '2026-09-01T00:00:00Z' }),
      lesson({ opened_at: '2026-09-13T09:00:00Z' }),
      lesson(),
    ])
    expect(standings.map(s => s.state)).toEqual(['worked', 'opened', 'ready'])
    expect(standings.map(s => s.next)).toEqual([false, true, false])
  })

  it('has a word and a note of its own, like every other rung', () => {
    expect(LESSON_LABEL.opened).toBe('Opened')
    expect(LESSON_NOTE.opened).toBeTruthy()
    expect(LESSON_NOTE.opened).not.toBe(LESSON_NOTE.started)
  })
})
