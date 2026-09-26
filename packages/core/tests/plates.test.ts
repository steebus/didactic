import { describe, it, expect } from 'vitest'
import { balancePlates, nextPlate } from '../src/plates'

const PALETTE = ['green', 'terracotta', 'mustard', 'ultramarine', 'plum', 'olive']

describe('nextPlate', () => {
  it('starts at the first plate', () => {
    expect(nextPlate([], PALETTE)).toBe('green')
  })

  it('never repeats a plate while one is unused', () => {
    // Two subjects made and one thrown away: the count said the next
    // was plate 1, which is the one still in use.
    expect(nextPlate(['terracotta'], PALETTE)).toBe('green')
    expect(nextPlate(['green', 'mustard'], PALETTE)).toBe('terracotta')
  })

  it('doubles up evenly once all six are used', () => {
    expect(nextPlate(PALETTE, PALETTE)).toBe('green')
    expect(nextPlate([...PALETTE, 'green'], PALETTE)).toBe('terracotta')
  })

  it('ignores colours outside the palette, and case', () => {
    expect(nextPlate(['#123456', 'GREEN'], PALETTE)).toBe('terracotta')
  })
})

describe('balancePlates', () => {
  it('gives three subjects printed in one plate three plates', () => {
    expect(balancePlates(['mustard', 'mustard', 'mustard'], PALETTE))
      .toEqual(['mustard', 'green', 'terracotta'])
  })

  it('never moves a subject that has a plate of its own', () => {
    // Photography's green was its own. Moving the second mustard onto
    // green first, and then Photography off it, repainted a bed that
    // was never wrong.
    expect(balancePlates(['mustard', 'mustard', 'mustard', 'green'], PALETTE))
      .toEqual(['mustard', 'terracotta', 'ultramarine', 'green'])
  })

  it('keeps every plate that is already distinct', () => {
    expect(balancePlates(['plum', 'green', 'olive'], PALETTE)).toEqual(['plum', 'green', 'olive'])
  })

  it('settles: applied to its own answer it changes nothing', () => {
    // Every shape up to fourteen subjects, drawn from a seeded source:
    // past six the plates double up, which is where a rule that only
    // looked settled would move something on the second pass.
    let seed = 3
    const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296
    for (let trial = 0; trial < 500; trial++) {
      const n = 1 + Math.floor(rnd() * 14)
      const colours = Array.from({ length: n }, () => PALETTE[Math.floor(rnd() * PALETTE.length)])
      const once = balancePlates(colours, PALETTE)
      expect(balancePlates(once, PALETTE)).toEqual(once)
    }
  })

  it('spreads the plates as evenly as the count allows', () => {
    const once = balancePlates(Array(8).fill('plum'), PALETTE)
    const counts = PALETTE.map(p => once.filter(c => c === p).length)
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1)
  })

  it('leaves a colour outside the palette where it is', () => {
    expect(balancePlates(['#123456', 'green', 'green'], PALETTE)).toEqual(['#123456', 'green', 'terracotta'])
  })
})
