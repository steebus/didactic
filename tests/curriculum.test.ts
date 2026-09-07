import { describe, it, expect } from 'vitest'
import {
  tierLessons,
  viewLessons,
  curriculumProgress,
  findPrereqCycle,
  linearPrereqs,
} from '@/lib/curriculum'
import type { Lesson } from '@/lib/types'

const lesson = (id: string, over: Partial<Lesson> = {}): Lesson => ({
  id,
  user_id: 'u',
  curriculum_id: 'c',
  topic_id: 't',
  title: id,
  slug: id,
  summary: null,
  body: null,
  position: 0,
  stage: 'core',
  estimated_minutes: null,
  created_by: 'ai',
  completed_at: null,
  created_at: '2026-01-01T00:00:00Z',
  ...over,
})

describe('tierLessons', () => {
  it('tiers a linear chain in order', () => {
    const lessons = [lesson('a'), lesson('b'), lesson('c')]
    const tiers = tierLessons(lessons, linearPrereqs(['a', 'b', 'c']))
    expect([tiers.get('a'), tiers.get('b'), tiers.get('c')]).toEqual([0, 1, 2])
  })

  it('puts every genuine starting point at tier 0', () => {
    // Two roots that fork and rejoin: portrait and landscape both rest
    // on exposure, and neither rests on the other.
    const lessons = [lesson('exposure'), lesson('portrait'), lesson('landscape')]
    const tiers = tierLessons(lessons, [
      { lesson_id: 'portrait', requires_lesson_id: 'exposure' },
      { lesson_id: 'landscape', requires_lesson_id: 'exposure' },
    ])
    expect(tiers.get('exposure')).toBe(0)
    expect(tiers.get('portrait')).toBe(1)
    expect(tiers.get('landscape')).toBe(1)
  })

  it('tiers by the longest chain, not the shortest', () => {
    // d can be reached in one hop from a, but must sit after c.
    const lessons = ['a', 'b', 'c', 'd'].map(id => lesson(id))
    const tiers = tierLessons(lessons, [
      { lesson_id: 'b', requires_lesson_id: 'a' },
      { lesson_id: 'c', requires_lesson_id: 'b' },
      { lesson_id: 'd', requires_lesson_id: 'a' },
      { lesson_id: 'd', requires_lesson_id: 'c' },
    ])
    expect(tiers.get('d')).toBe(3)
  })

  it('ignores prereqs pointing outside the curriculum', () => {
    const tiers = tierLessons([lesson('a')], [
      { lesson_id: 'a', requires_lesson_id: 'somewhere-else' },
    ])
    expect(tiers.get('a')).toBe(0)
  })

  it('still tiers when the prereqs contain a cycle', () => {
    // A cycle is a bug in the draft, not a reason to hang the page.
    const lessons = [lesson('a'), lesson('b')]
    const tiers = tierLessons(lessons, [
      { lesson_id: 'a', requires_lesson_id: 'b' },
      { lesson_id: 'b', requires_lesson_id: 'a' },
    ])
    expect(tiers.size).toBe(2)
  })
})

describe('viewLessons', () => {
  it('opens a lesson only once everything it requires is complete', () => {
    const lessons = [
      lesson('a', { completed_at: '2026-01-02T00:00:00Z' }),
      lesson('b'),
      lesson('c'),
    ]
    const views = viewLessons(lessons, [
      { lesson_id: 'c', requires_lesson_id: 'a' },
      { lesson_id: 'c', requires_lesson_id: 'b' },
    ])
    const by = Object.fromEntries(views.map(v => [v.lesson.id, v.availability]))
    expect(by).toEqual({ a: 'complete', b: 'available', c: 'locked' })
  })

  it('opens both branches at once when they share a finished root', () => {
    const lessons = [
      lesson('exposure', { completed_at: '2026-01-02T00:00:00Z' }),
      lesson('portrait'),
      lesson('landscape'),
    ]
    const views = viewLessons(lessons, [
      { lesson_id: 'portrait', requires_lesson_id: 'exposure' },
      { lesson_id: 'landscape', requires_lesson_id: 'exposure' },
    ])
    expect(views.filter(v => v.availability === 'available')).toHaveLength(2)
  })

  it('orders by tier first and position second', () => {
    const lessons = [
      lesson('later', { position: 0 }),
      lesson('first', { position: 5 }),
    ]
    const views = viewLessons(lessons, [
      { lesson_id: 'later', requires_lesson_id: 'first' },
    ])
    expect(views.map(v => v.lesson.id)).toEqual(['first', 'later'])
  })

  it('reports what a locked lesson is waiting on', () => {
    const views = viewLessons([lesson('a'), lesson('b')], [
      { lesson_id: 'b', requires_lesson_id: 'a' },
    ])
    expect(views.find(v => v.lesson.id === 'b')!.requires).toEqual(['a'])
  })
})

describe('curriculumProgress', () => {
  it('reads an empty curriculum as nothing learned, not everything', () => {
    expect(curriculumProgress([])).toEqual({ total: 0, complete: 0, fraction: 0 })
  })

  it('counts only completed lessons', () => {
    const progress = curriculumProgress([
      { completed_at: '2026-01-01T00:00:00Z' },
      { completed_at: null },
      { completed_at: null },
    ])
    expect(progress).toEqual({ total: 3, complete: 1, fraction: 1 / 3 })
  })
})

describe('findPrereqCycle', () => {
  it('returns null for a straight line', () => {
    expect(findPrereqCycle(linearPrereqs(['a', 'b', 'c']))).toBeNull()
  })

  it('returns null for a diamond, which is not a cycle', () => {
    expect(findPrereqCycle([
      { lesson_id: 'b', requires_lesson_id: 'a' },
      { lesson_id: 'c', requires_lesson_id: 'a' },
      { lesson_id: 'd', requires_lesson_id: 'b' },
      { lesson_id: 'd', requires_lesson_id: 'c' },
    ])).toBeNull()
  })

  it('finds a cycle a draft could produce', () => {
    const cycle = findPrereqCycle([
      { lesson_id: 'a', requires_lesson_id: 'b' },
      { lesson_id: 'b', requires_lesson_id: 'c' },
      { lesson_id: 'c', requires_lesson_id: 'a' },
    ])
    expect(cycle).not.toBeNull()
    expect(cycle!.at(0)).toBe(cycle!.at(-1))
  })
})

describe('linearPrereqs', () => {
  it('chains each lesson to the one before it', () => {
    expect(linearPrereqs(['a', 'b', 'c'])).toEqual([
      { lesson_id: 'b', requires_lesson_id: 'a' },
      { lesson_id: 'c', requires_lesson_id: 'b' },
    ])
  })

  it('gives a single lesson nothing to wait for', () => {
    expect(linearPrereqs(['a'])).toEqual([])
  })
})
