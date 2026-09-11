import { describe, it, expect } from 'vitest'
import { config } from '../src/config'

describe('config', () => {
  it('exposes resolver thresholds with match above ambiguous', () => {
    // The values move whenever the embedding model changes; the
    // ordering and the ceiling are what must hold.
    expect(config.RESOLVER_MATCH).toBeGreaterThan(config.RESOLVER_AMBIGUOUS)
    expect(config.RESOLVER_MATCH).toBeLessThanOrEqual(1)
    expect(config.RESOLVER_AMBIGUOUS).toBeGreaterThan(0)
  })

  it('weights depth so applied counts five times a skim', () => {
    expect(config.DEPTH_WEIGHTS).toEqual({
      marked: 0.01,
      skim: 0.2,
      read: 0.5,
      applied: 1.0,
    })
  })

  it('keeps a marked passage well below a skim', () => {
    // Marking a sentence is evidence of attention, not of reading. If
    // this ever creeps up to a skim, highlighting becomes the cheapest
    // way to move a figure.
    expect(config.DEPTH_WEIGHTS.marked).toBeLessThan(config.DEPTH_WEIGHTS.skim / 10)
  })

  it('caps consumption-only ability below expert', () => {
    expect(config.CONSUMPTION_CEILING).toBe(3.5)
  })

  it('defaults freshness half-life to 90 days', () => {
    expect(config.FRESHNESS_HALF_LIFE_DAYS).toBe(90)
  })
})
