import { describe, it, expect } from 'vitest'
import { panelSpot, pinSpot, type Box } from '../src/markAnchor'

/** A sheet of prose 640 wide, starting 20 in and 100 down the window. */
const sheet: Box = { top: 100, bottom: 900, left: 20, right: 660 }
const desktop = { width: 1280, height: 900 }
const phone = { width: 390, height: 780 }

const box = (top: number, left: number, height = 20, width = 200): Box => ({
  top,
  bottom: top + height,
  left,
  right: left + width,
})

describe('panelSpot', () => {
  it('sets the panel below the passage, in the sheet\'s own coordinates', () => {
    const spot = panelSpot(box(200, 120), sheet, desktop)
    expect(spot.above).toBe(false)
    expect(spot.top).toBe(220 - 100 + 8)
    expect(spot.left).toBe(120 - 20)
  })

  it('lifts it above a passage near the foot of the window', () => {
    const spot = panelSpot(box(760, 120), sheet, desktop)
    expect(spot.above).toBe(true)
    expect(spot.top).toBe(760 - 100 - 8)
  })

  it('stays below when there is no room above either', () => {
    // Near the bottom of the window, but only just below the top of the
    // prose: lifting it would put it off the top instead.
    const spot = panelSpot(box(760, 120), { ...sheet, top: 700 }, desktop)
    expect(spot.above).toBe(false)
  })

  it('holds the panel inside the sheet when the passage starts near the right margin', () => {
    const spot = panelSpot(box(200, 600), sheet, desktop)
    // 640 of sheet less a 384 panel: any further right and it hangs off.
    expect(spot.left).toBe(640 - 384)
  })

  it('pins it to the left edge on a phone, where the panel is the sheet', () => {
    const narrow: Box = { top: 100, bottom: 900, left: 16, right: 374 }
    const spot = panelSpot(box(200, 300), narrow, phone)
    expect(spot.left).toBe(0)
  })

  it('never places the panel left of the sheet', () => {
    const spot = panelSpot(box(200, 0), sheet, desktop)
    expect(spot.left).toBe(0)
  })
})

describe('pinSpot', () => {
  it('floats the button under the selection, in window coordinates', () => {
    const spot = pinSpot(box(300, 40), phone)
    expect(spot.top).toBe(320 + 8)
    expect(spot.left).toBe(40)
  })

  it('puts it above a selection at the foot of the window', () => {
    const spot = pinSpot(box(750, 40), phone)
    expect(spot.top).toBe(750 - 8 - 40)
  })

  it('keeps it on screen when the selection starts near the right edge', () => {
    const spot = pinSpot(box(300, 360), phone)
    expect(spot.left).toBe(390 - 132 - 8)
    expect(spot.left).toBeGreaterThan(0)
  })

  it('keeps it on screen when the selection starts at the very left', () => {
    const spot = pinSpot(box(300, 0), phone)
    expect(spot.left).toBe(8)
  })
})
