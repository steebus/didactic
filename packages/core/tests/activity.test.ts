import { describe, it, expect } from 'vitest'
import { activityDays, activityLevel, activityTitle, calendarLayout, type ActivityCount } from '../src/activity'
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

describe('calendarLayout', () => {
  // 2026-06-01 is a Monday; 2026-07-01 a Wednesday.
  const days = activityDays([], '2026-07-02')
  const layout = calendarLayout(days)
  const at = (day: string) => layout.cells[days.findIndex(d => d.day === day)]

  it('puts Monday on row one and Sunday on row seven', () => {
    expect(at('2026-06-01').row).toBe(1)
    expect(at('2026-06-07').row).toBe(7)
  })

  it('starts a new column each Monday inside a month', () => {
    expect(at('2026-06-08').col).toBe(at('2026-06-01').col + 1)
    expect(at('2026-06-07').col).toBe(at('2026-06-01').col)
  })

  it('leaves one empty column between months, even mid-week', () => {
    expect(at('2026-06-01').col).toBe(at('2026-05-31').col + 2)
    expect(at('2026-07-01').col).toBe(at('2026-06-30').col + 2)
    expect(at('2026-07-01').row).toBe(3)
  })

  it('labels each month at its first column, with the year on January, the first and the last', () => {
    const june = layout.months.find(m => m.day === '2026-06-01')!
    expect(june.col).toBe(at('2026-06-01').col)
    expect(june.label).toBe('Jun')
    expect(layout.months[0].label).toMatch(/2025$/)
    expect(layout.months.at(-1)!.label).toBe('Jul 2026')
    expect(layout.months.find(m => m.day === '2026-01-01')!.label).toBe('Jan 2026')
  })

  it('counts its columns', () => {
    expect(layout.cols).toBe(Math.max(...layout.cells.map(c => c.col)))
  })
})
