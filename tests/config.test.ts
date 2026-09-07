import { describe, it, expect } from 'vitest'
import { config } from '@/lib/config'

describe('config', () => {
  it('exposes resolver thresholds with match above ambiguous', () => {
    expect(config.RESOLVER_MATCH).toBe(0.85)
    expect(config.RESOLVER_AMBIGUOUS).toBe(0.70)
    expect(config.RESOLVER_MATCH).toBeGreaterThan(config.RESOLVER_AMBIGUOUS)
  })

  it('weights depth so applied counts five times a skim', () => {
    expect(config.DEPTH_WEIGHTS).toEqual({ skim: 0.2, read: 0.5, applied: 1.0 })
  })

  it('caps consumption-only ability below expert', () => {
    expect(config.CONSUMPTION_CEILING).toBe(3.5)
  })

  it('defaults freshness half-life to 90 days', () => {
    expect(config.FRESHNESS_HALF_LIFE_DAYS).toBe(90)
  })
})
