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
      answered: 0.05,
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

  it('keeps answering a question between marking and skimming', () => {
    // Answering is evidence you followed the argument, which is worth
    // more than evidence you were in the room. It is still not reading:
    // a lesson's worth of right answers must stay well under the lesson.
    expect(config.DEPTH_WEIGHTS.answered).toBeGreaterThan(config.DEPTH_WEIGHTS.marked)
    expect(config.DEPTH_WEIGHTS.answered).toBeLessThan(config.DEPTH_WEIGHTS.skim)
    // Four right answers -- a well-furnished lesson -- against reading it.
    expect(config.DEPTH_WEIGHTS.answered * 4).toBeLessThan(config.DEPTH_WEIGHTS.read)
  })

  it('caps consumption-only ability below expert', () => {
    expect(config.CONSUMPTION_CEILING).toBe(3.5)
  })

  it('defaults freshness half-life to 90 days', () => {
    expect(config.FRESHNESS_HALF_LIFE_DAYS).toBe(90)
  })
})
