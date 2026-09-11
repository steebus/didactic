import { describe, it, expect } from 'vitest'
import { computeAbility, computeFreshness, subjectAggregate } from '@/lib/scoring'
import type { Exposure } from '@/lib/types'

function exposure(over: Partial<Exposure> = {}): Exposure {
  return {
    id: 'e', topic_id: 'n', source: 'resource', source_id: 'r',
    depth: 'read', ability_delta: 0, reason: '',
    created_at: '2026-01-01T00:00:00Z',
    ...over,
  }
}

describe('computeAbility', () => {
  it('returns the floor of 1.0 with no exposures', () => {
    expect(computeAbility([]).ability).toBe(1.0)
  })

  it('gives zero confidence with no exposures', () => {
    expect(computeAbility([]).confidence).toBe(0)
  })

  it('rises with a single read', () => {
    expect(computeAbility([exposure({ depth: 'read' })]).ability).toBeGreaterThan(1.0)
  })

  it('weights applied above read above skim', () => {
    const skim = computeAbility([exposure({ depth: 'skim' })]).ability
    const read = computeAbility([exposure({ depth: 'read' })]).ability
    const applied = computeAbility([exposure({ depth: 'applied' })]).ability
    expect(applied).toBeGreaterThan(read)
    expect(read).toBeGreaterThan(skim)
  })

  it('shows diminishing returns - the tenth read moves less than the first', () => {
    const one = computeAbility([exposure()]).ability
    const two = computeAbility([exposure(), exposure()]).ability
    const nine = computeAbility(Array(9).fill(exposure())).ability
    const ten = computeAbility(Array(10).fill(exposure())).ability
    expect(two - one).toBeGreaterThan(ten - nine)
  })

  it('never exceeds 3.5 from reading alone, however much is read', () => {
    const many = computeAbility(Array(500).fill(exposure({ depth: 'read' })))
    expect(many.ability).toBeLessThanOrEqual(3.5)
  })

  it('never exceeds 3.5 from skimming alone', () => {
    const many = computeAbility(Array(500).fill(exposure({ depth: 'skim' })))
    expect(many.ability).toBeLessThanOrEqual(3.5)
  })

  it('can exceed 3.5 when the work was applied', () => {
    const applied = computeAbility(Array(20).fill(exposure({ depth: 'applied' })))
    expect(applied.ability).toBeGreaterThan(3.5)
  })

  it('never exceeds 5.0', () => {
    const lots = computeAbility(Array(1000).fill(exposure({ depth: 'applied' })))
    expect(lots.ability).toBeLessThanOrEqual(5.0)
  })

  it('keeps confidence low after a single skim', () => {
    expect(computeAbility([exposure({ depth: 'skim' })]).confidence).toBeLessThan(0.3)
  })

  it('raises confidence as exposures accumulate', () => {
    const few = computeAbility(Array(2).fill(exposure())).confidence
    const many = computeAbility(Array(12).fill(exposure())).confidence
    expect(many).toBeGreaterThan(few)
  })

  it('caps confidence at 1', () => {
    expect(computeAbility(Array(500).fill(exposure())).confidence).toBeLessThanOrEqual(1)
  })
})

describe('computeFreshness', () => {
  const now = new Date('2026-06-01T00:00:00Z')

  it('is zero when never exposed', () => {
    expect(computeFreshness(null, 3, now)).toBe(0)
  })

  it('is 1 immediately after exposure', () => {
    expect(computeFreshness('2026-06-01T00:00:00Z', 3, now)).toBeCloseTo(1)
  })

  it('halves at the half-life for a novice topic', () => {
    const at90 = computeFreshness('2026-03-03T00:00:00Z', 1, now)
    expect(at90).toBeCloseTo(0.5, 1)
  })

  it('decays more slowly for well-known material', () => {
    const novice = computeFreshness('2026-01-01T00:00:00Z', 1, now)
    const expert = computeFreshness('2026-01-01T00:00:00Z', 5, now)
    expect(expert).toBeGreaterThan(novice)
  })

  it('stays between 0 and 1', () => {
    const ancient = computeFreshness('2000-01-01T00:00:00Z', 3, now)
    expect(ancient).toBeGreaterThanOrEqual(0)
    expect(ancient).toBeLessThanOrEqual(1)
  })
})

describe('subjectAggregate', () => {
  it('averages ability across members', () => {
    const result = subjectAggregate([
      { ability: 2, freshness: 1, state: 'active' },
      { ability: 4, freshness: 1, state: 'active' },
    ])
    expect(result.ability).toBeCloseTo(3)
  })

  it('excludes pending topics from the rollup', () => {
    const result = subjectAggregate([
      { ability: 2, freshness: 1, state: 'active' },
      { ability: 5, freshness: 1, state: 'pending' },
    ])
    expect(result.ability).toBeCloseTo(2)
  })

  it('weights freshness toward the worst members, so cold topics are not masked', () => {
    const members = [
      { ability: 3, freshness: 1.0, state: 'active' },
      { ability: 3, freshness: 1.0, state: 'active' },
      ...Array(20).fill({ ability: 3, freshness: 0.05, state: 'active' }),
    ]
    const result = subjectAggregate(members)
    const plainMean = members.reduce((s, m) => s + m.freshness, 0) / members.length
    expect(result.freshness).toBeLessThan(plainMean)
  })

  it('returns zeros for an empty subject', () => {
    expect(subjectAggregate([])).toEqual({ ability: 0, freshness: 0 })
  })
})

describe('marked passages', () => {
  const marked = (n: number) =>
    Array.from({ length: n }, () => ({ depth: 'marked' as const })) as Parameters<
      typeof computeAbility
    >[0]

  it('moves the figure barely at all for one highlight', () => {
    const { ability } = computeAbility(marked(1))
    expect(ability).toBeLessThan(1.2)
  })

  it('compounds, so a dozen count for more than one', () => {
    expect(computeAbility(marked(12)).ability).toBeGreaterThan(
      computeAbility(marked(1)).ability
    )
  })

  it('still counts for less than reading the thing', () => {
    // A lesson's worth of marking must not out-score reading an
    // article, or highlighting becomes the cheapest way to move the
    // map. Twenty is a heavy session; fifty is where they draw level,
    // and fifty marked passages is genuine attention rather than a way
    // round the figure.
    const oneRead = computeAbility([{ depth: 'read' }] as Parameters<typeof computeAbility>[0])
      .ability
    expect(computeAbility(marked(20)).ability).toBeLessThan(oneRead)
  })

  it('does not report full confidence from highlights alone', () => {
    // The diversity term divides by the number of depths there are; a
    // hard-coded three would have let one kind of exposure claim more
    // variety than it has.
    expect(computeAbility(marked(50)).confidence).toBeLessThan(1)
  })
})
