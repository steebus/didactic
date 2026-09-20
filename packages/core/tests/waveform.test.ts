import { describe, it, expect } from 'vitest'
import {
  WAVE_BAR,
  WAVE_BARS,
  WAVE_GAP,
  WAVE_HEIGHT,
  WAVE_LOW,
  WAVE_RADIUS,
  WAVE_SWING_MS,
  WAVE_WIDTH,
} from '../src/waveform'

describe('the mark that says a voice is running', () => {
  it('puts five bars across the box with nothing left over', () => {
    expect(WAVE_BARS).toHaveLength(5)
    const last = WAVE_BARS[WAVE_BARS.length - 1]
    expect(last.x + WAVE_BAR).toBe(WAVE_WIDTH)
  })

  it('spaces them evenly, a bar and a gap at a time', () => {
    WAVE_BARS.forEach((bar, i) => {
      expect(bar.x).toBe(i * (WAVE_BAR + WAVE_GAP))
    })
  })

  it('keeps every bar inside the box', () => {
    for (const bar of WAVE_BARS) {
      expect(bar.x).toBeGreaterThanOrEqual(0)
      expect(bar.x + WAVE_BAR).toBeLessThanOrEqual(WAVE_WIDTH)
    }
    expect(WAVE_RADIUS).toBeLessThan(WAVE_BAR / 2 + 0.001)
  })

  /* A silhouette, not a flat row: the mark has to read as sound while
     it is standing still, for a paused player and for a reader who has
     asked for no motion. */
  it('rests as a waveform rather than as a row of equal bars', () => {
    const rests = WAVE_BARS.map(b => b.rest)
    expect(new Set(rests).size).toBeGreaterThan(1)
    for (const rest of rests) {
      expect(rest).toBeGreaterThan(WAVE_LOW)
      expect(rest).toBeLessThanOrEqual(1)
    }
  })

  it('stands tallest in the middle and falls away either side', () => {
    const rests = WAVE_BARS.map(b => b.rest)
    const middle = (rests.length - 1) / 2
    expect(rests[middle]).toBe(Math.max(...rests))
    expect(rests[middle]).toBe(1)
  })

  /* Bars that start in sequence march, and a row that marches reads as
     a thing loading rather than a thing sounding. */
  it('staggers the bars out of order', () => {
    const delays = WAVE_BARS.map(b => b.delay)
    expect(new Set(delays).size).toBe(delays.length)
    for (const delay of delays) {
      expect(delay).toBeGreaterThanOrEqual(0)
      expect(delay).toBeLessThan(1)
    }
    const sorted = [...delays].sort((a, b) => a - b)
    expect(delays).not.toEqual(sorted)
    expect(delays).not.toEqual([...sorted].reverse())
  })

  /* A bar that reached nothing would blink out, and five blinking bars
     read as five things rather than as one voice. */
  it('never swings a bar down to nothing', () => {
    expect(WAVE_LOW).toBeGreaterThan(0)
    expect(WAVE_LOW).toBeLessThan(1)
  })

  it('swings slowly enough to read as a voice, not an alarm', () => {
    expect(WAVE_SWING_MS).toBeGreaterThanOrEqual(400)
    expect(WAVE_SWING_MS).toBeLessThanOrEqual(1200)
  })

  it('is wider than it is tall, as a waveform is', () => {
    expect(WAVE_WIDTH).toBeGreaterThan(WAVE_HEIGHT)
  })
})
