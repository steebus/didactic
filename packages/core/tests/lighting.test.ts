import { describe, it, expect } from 'vitest'
import {
  LIGHTINGS,
  LIGHTING_BOX,
  LIGHTING_CENTRE,
  LIGHTING_GLYPHS,
  LIGHTING_LABEL,
  LIGHTING_NOTE,
  LIGHTING_RAY,
  type Lighting,
} from '../src/lighting'

describe('the three lights a sheet is read under', () => {
  it('offers the default first, then the two explicit ones', () => {
    expect([...LIGHTINGS]).toEqual(['system', 'light', 'dark'])
  })

  /* A control whose whole face is a drawing has no visible word to
     lean on, so two of these carry the same weight the word used to. */
  it('gives every one a word and a sentence, and none of them twice', () => {
    for (const light of LIGHTINGS) {
      expect(LIGHTING_LABEL[light]).toMatch(/\S/)
      expect(LIGHTING_NOTE[light]).toMatch(/\S/)
    }
    expect(new Set(Object.values(LIGHTING_LABEL)).size).toBe(LIGHTINGS.length)
    expect(new Set(Object.values(LIGHTING_NOTE)).size).toBe(LIGHTINGS.length)
  })
})

describe('the forms the three are drawn as', () => {
  it('draws every one as a closed path', () => {
    for (const light of LIGHTINGS) {
      const glyph = LIGHTING_GLYPHS[light]
      expect(glyph.outline).toMatch(/^M/)
      expect(glyph.outline.trim().endsWith('Z')).toBe(true)
    }
  })

  /* The half that is inked is the only thing marking the middle
     setting out: a disc with no rays and no bite is "ask the room",
     and a disc with either is one of the two answers. */
  it('inks a half on the system glyph and on neither other', () => {
    expect(LIGHTING_GLYPHS.system.fill).toMatch(/^M/)
    expect(LIGHTING_GLYPHS.light.fill).toBeNull()
    expect(LIGHTING_GLYPHS.dark.fill).toBeNull()
  })

  it('puts the rays on daylight alone, eight of them, evenly round', () => {
    expect(LIGHTING_GLYPHS.light.rays).toEqual([0, 45, 90, 135, 180, 225, 270, 315])
    expect(LIGHTING_GLYPHS.system.rays).toEqual([])
    expect(LIGHTING_GLYPHS.dark.rays).toEqual([])
  })

  it('keeps every ray inside the box, turned about its middle', () => {
    expect(LIGHTING_RAY).toMatch(/^M/)
    for (const deg of LIGHTING_GLYPHS.light.rays) {
      expect(deg).toBeGreaterThanOrEqual(0)
      expect(deg).toBeLessThan(360)
    }
    // The ray is drawn at noon, which is directly above the centre.
    const [, x, y] = /^M([\d.]+) ([\d.]+)/.exec(LIGHTING_RAY) ?? []
    expect(Number(x)).toBe(LIGHTING_CENTRE)
    expect(Number(y)).toBeLessThan(LIGHTING_CENTRE)
    expect(Number(y)).toBeGreaterThan(0)
  })

  /* Every coordinate in every form has to sit inside the one box, or
     the phone and the web crop the same glyph differently. */
  it('draws everything inside the one square box', () => {
    const forms = LIGHTINGS.flatMap((light: Lighting) =>
      [LIGHTING_GLYPHS[light].outline, LIGHTING_GLYPHS[light].fill].filter(
        (d): d is string => d !== null
      )
    ).concat(LIGHTING_RAY)

    for (const d of forms) {
      for (const n of d.match(/[\d.]+/g) ?? []) {
        expect(Number(n)).toBeGreaterThanOrEqual(0)
        expect(Number(n)).toBeLessThanOrEqual(LIGHTING_BOX)
      }
    }
  })
})
