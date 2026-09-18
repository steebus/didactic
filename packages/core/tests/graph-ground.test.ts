import { describe, expect, it } from 'vitest'
import {
  fade, labelInk, nodeFade, PAPER, PAPER_DARK,
  LABEL_INK, LABEL_INK_DARK, LABEL_INK_DORMANT, LABEL_INK_DORMANT_DARK,
} from '../src/graph'

const rgb = (s: string) => (s.match(/\d+/g) ?? []).map(Number)

/** Relative luminance, for asking whether a seed got lighter or darker. */
function lum(s: string): number {
  const [r, g, b] = rgb(s).map(c => {
    const v = c / 255
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

describe('fading a seed toward its ground', () => {
  it('leaves a fully saturated colour alone on either ground', () => {
    expect(rgb(fade('#2f5233', 1))).toEqual([47, 82, 51])
    expect(rgb(fade('#649069', 1, PAPER_DARK))).toEqual([100, 144, 105])
  })

  it('reaches the ground itself at nought', () => {
    expect(rgb(fade('#2f5233', 0))).toEqual([...PAPER])
    expect(rgb(fade('#649069', 0, PAPER_DARK))).toEqual([...PAPER_DARK])
  })

  /**
   * The bug this whole change exists to prevent.
   *
   * A dormant topic must sit *back* into the bed. On paper that means
   * going lighter; on a dark bed it means going darker. Fading a dark
   * bed toward paper inverts the one thing the map is for -- the cold
   * topics would come forward as the brightest things on the sheet.
   */
  it('sits a dormant seed back into the bed, whichever bed it is', () => {
    const warm = nodeFade(1)
    const cold = nodeFade(0)

    const onPaper = [fade('#2f5233', warm), fade('#2f5233', cold)]
    expect(lum(onPaper[1])).toBeGreaterThan(lum(onPaper[0]))

    const onDark = [fade('#649069', warm, PAPER_DARK), fade('#649069', cold, PAPER_DARK)]
    expect(lum(onDark[1])).toBeLessThan(lum(onDark[0]))
  })

  it('defaults to daylight, so an untaught caller draws what it always drew', () => {
    expect(fade('#2f5233', 0.5)).toBe(fade('#2f5233', 0.5, PAPER))
  })

  it('takes the rgb() string it returns, since a hover fades a fade', () => {
    expect(rgb(fade(fade('#2f5233', 0.5), 1))).toEqual(rgb(fade('#2f5233', 0.5)))
  })
})

describe('label ink', () => {
  it('goes faint below the dormancy line on both grounds', () => {
    expect(labelInk(0.9)).toBe(LABEL_INK)
    expect(labelInk(0.1)).toBe(LABEL_INK_DORMANT)
    expect(labelInk(0.9, true)).toBe(LABEL_INK_DARK)
    expect(labelInk(0.1, true)).toBe(LABEL_INK_DORMANT_DARK)
  })

  // A name has to be readable on the bed it is printed on, and the two
  // beds are at opposite ends of the ramp.
  it('reverses out after dark rather than staying near-black', () => {
    expect(lum(`rgb(${parseInt(LABEL_INK_DARK.slice(1, 3), 16)},${
      parseInt(LABEL_INK_DARK.slice(3, 5), 16)},${
      parseInt(LABEL_INK_DARK.slice(5, 7), 16)})`))
      .toBeGreaterThan(0.5)
  })
})
