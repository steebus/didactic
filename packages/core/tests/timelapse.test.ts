import { describe, it, expect } from 'vitest'
import { timeline, when } from '../src/timelapse'

const day = 86_400_000

describe('playing the bed back', () => {
  it('starts at zero and ends inside the duration, give or take a stagger', () => {
    const t = timeline([{ id: 'a', at: 0 }, { id: 'b', at: 10 * day }], 10_000)
    expect(t.at.get('a')).toBe(0)
    expect(t.at.get('b')).toBe(10_000)
  })

  it('keeps a gap a gap: a quiet week is a pause, a busy hour is not', () => {
    const t = timeline(
      [{ id: 'a', at: 0 }, { id: 'b', at: day / 24 }, { id: 'c', at: 8 * day }, { id: 'd', at: 70 * day }],
      7_000
    )
    const gap = (x: string, y: string) => t.at.get(y)! - t.at.get(x)!
    expect(gap('b', 'c')).toBeGreaterThan(gap("a", "b") * 5)
  })

  it('staggers a burst rather than dropping it in at once', () => {
    const burst = Array.from({ length: 30 }, (_, i) => ({ id: `t${i}`, at: 5 * day }))
    const t = timeline([{ id: 'first', at: 0 }, ...burst], 10_000)
    const times = burst.map(b => t.at.get(b.id)!).sort((x, y) => x - y)
    expect(new Set(times).size).toBe(30)
    for (let i = 1; i < times.length; i++) expect(times[i] - times[i - 1]).toBeGreaterThanOrEqual(25)
  })

  it('is the same however the rows came back', () => {
    const rows = [{ id: 'b', at: day }, { id: 'a', at: 0 }, { id: 'c', at: day }]
    expect([...timeline(rows, 5_000).at]).toEqual([...timeline([...rows].reverse(), 5_000).at])
  })

  it('copes with nothing, and with everything at once', () => {
    expect(timeline([], 1000).end).toBe(0)
    expect(timeline([{ id: 'a', at: 5 }], 1000).at.get('a')).toBe(0)
  })

  it('reads a timestamp, and calls a missing one unknown', () => {
    expect(when('2026-01-01T00:00:00Z')).toBe(Date.UTC(2026, 0, 1))
    expect(when(null)).toBeNull()
    expect(when('nonsense')).toBeNull()
  })
})
