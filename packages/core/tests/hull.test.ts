import { describe, it, expect } from 'vitest'
import { centroid, contains, convexHull, outline } from '../src/hull'

describe('convexHull', () => {
  it('drops the points inside', () => {
    const hull = convexHull([
      { x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 }, { x: 1, y: 1 },
    ])
    expect(hull).toHaveLength(4)
    expect(hull).not.toContainEqual({ x: 1, y: 1 })
  })

  it('answers fewer than three points as they are', () => {
    expect(convexHull([{ x: 1, y: 1 }, { x: 1, y: 1 }])).toEqual([{ x: 1, y: 1 }])
  })
})

describe('outline', () => {
  it('gives one seed a ring around it', () => {
    const ring = outline([{ x: 5, y: 5 }], 10)
    expect(ring.length).toBeGreaterThanOrEqual(8)
    for (const p of ring) expect(Math.hypot(p.x - 5, p.y - 5)).toBeCloseTo(10, 5)
  })

  it('clears every seed by the padding', () => {
    const seeds = [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 20, y: 30 }]
    const shape = outline(seeds, 12)
    for (const s of seeds) {
      expect(contains(shape, s)).toBe(true)
      expect(contains(shape, { x: s.x, y: s.y + 11 }) || contains(shape, { x: s.x, y: s.y - 11 })).toBe(true)
    }
  })
})

describe('contains', () => {
  const square = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }]
  it('says inside is inside and outside is not', () => {
    expect(contains(square, { x: 5, y: 5 })).toBe(true)
    expect(contains(square, { x: 15, y: 5 })).toBe(false)
  })
})

describe('centroid', () => {
  it('is the mean, and nothing for no points', () => {
    expect(centroid([{ x: 0, y: 0 }, { x: 4, y: 2 }])).toEqual({ x: 2, y: 1 })
    expect(centroid([])).toBeNull()
  })
})
