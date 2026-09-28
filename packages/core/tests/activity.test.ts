import { describe, it, expect } from 'vitest'
import { activityDays, activityLevel, activityTitle, type ActivityCount } from '../src/activity'
import { ACTIVITY } from '../src/config'

const row = (day: string, kind: ActivityCount['kind'], n = 1, subjectId: string | null = 'a'): ActivityCount =>
  ({ day, kind, n, subjectId })

describe('activityDays', () => {
  it('returns every day in the span, oldest first, ending today', () => {
    const days = activityDays([], '2026-09-28')
    expect(days).toHaveLength(ACTIVITY.DAYS)
    expect(days.at(-1)!.day).toBe('2026-09-28')
    expect(days[0].day).toBe('2025-09-23')
    expect(days.every(d => d.score === 0 && d.subjectId === null)).toBe(true)
  })

  it('weighs each kind', () => {
    const [d] = activityDays([row('2026-09-28', 'lesson'), row('2026-09-28', 'card', 4)], '2026-09-28').slice(-1)
    expect(d.score).toBe(5 + 4 * 0.5)
    expect(d.counts).toEqual({ lesson: 1, card: 4 })
  })

  it('colours a day by the subject with the most weighted work', () => {
    const [d] = activityDays(
      [row('2026-09-28', 'card', 6, 'a'), row('2026-09-28', 'read', 1, 'b')],
      '2026-09-28'
    ).slice(-1)
    expect(d.subjectId).toBe('b')
  })

  it('breaks a tie on the lower id', () => {
    const [d] = activityDays(
      [row('2026-09-28', 'mark', 1, 'z'), row('2026-09-28', 'mark', 1, 'm')],
      '2026-09-28'
    ).slice(-1)
    expect(d.subjectId).toBe('m')
  })

  it('never colours by unfiled work unless it is all there is', () => {
    const days = activityDays(
      [
        row('2026-09-27', 'lesson', 1, null),
        row('2026-09-27', 'mark', 1, 'a'),
        row('2026-09-28', 'lesson', 1, null),
      ],
      '2026-09-28'
    )
    expect(days.at(-2)!.subjectId).toBe('a')
    expect(days.at(-2)!.score).toBe(6)
    expect(days.at(-1)!.subjectId).toBeNull()
    expect(days.at(-1)!.score).toBe(5)
  })

  it('drops rows outside the span', () => {
    const days = activityDays([row('2024-01-01', 'lesson'), row('2026-09-29', 'lesson')], '2026-09-28')
    expect(days.every(d => d.score === 0)).toBe(true)
  })

  it('crosses a clock change without losing or doubling a day', () => {
    const days = activityDays([], '2026-04-01')
    const set = new Set(days.map(d => d.day))
    expect(set.size).toBe(ACTIVITY.DAYS)
    expect(set.has('2026-03-29')).toBe(true)
  })
})

describe('activityLevel', () => {
  const scores = [1, 2, 3, 4, 5, 6, 7, 8]
  it('is nought for nothing', () => expect(activityLevel(0, scores)).toBe(0))
  it('reads against the reader’s own days', () => {
    expect(activityLevel(1, scores)).toBe(1)
    expect(activityLevel(3, scores)).toBe(2)
    expect(activityLevel(5, scores)).toBe(3)
    expect(activityLevel(8, scores)).toBe(4)
  })
  it('gives a lone active day the top level', () => expect(activityLevel(2, [0, 0, 2])).toBe(4))
})

describe('activityTitle', () => {
  it('names the day and what was done, largest first', () => {
    const [d] = activityDays([row('2026-03-12', 'mark', 3), row('2026-03-12', 'lesson')], '2026-03-12').slice(-1)
    expect(activityTitle(d)).toBe('12 March · 1 lesson, 3 marks')
  })
  it('says so when nothing was done', () => {
    const [d] = activityDays([], '2026-03-12').slice(-1)
    expect(activityTitle(d)).toBe('12 March · nothing')
  })
})
