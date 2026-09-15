import { describe, it, expect } from 'vitest'
import { figureRecord, impactLabel } from '../src/figureRecord'
import { computeAbility, viabilityFigure } from '../src/scoring'
import type { Exposure } from '../src/types'

let n = 0
function exposure(over: Partial<Exposure> = {}): Exposure {
  n++
  return {
    id: `e${String(n).padStart(3, '0')}`, topic_id: 't', source: 'resource', source_id: 'r',
    depth: 'read', ability_delta: 0, reason: 'read something',
    created_at: `2026-09-${String(n).padStart(2, '0')}T09:00:00Z`,
    ...over,
  }
}

describe('figureRecord', () => {
  it('adds up to the figure the topic prints', () => {
    // The whole claim: every line is computeAbility on a prefix, so the
    // deltas sum to the figure, from the floor, whatever the order.
    const log = [
      exposure({ depth: 'read' }),
      exposure({ depth: 'answered' }),
      exposure({ depth: 'applied' }),
      exposure({ depth: 'skim' }),
      exposure({ depth: 'marked' }),
    ]
    const record = figureRecord([...log].reverse())
    const floor = viabilityFigure(computeAbility([]).ability)
    const sum = record.reduce((s, e) => s + e.delta, 0)

    expect(floor + sum).toBe(viabilityFigure(computeAbility(log).ability))
    expect(record[0].after).toBe(viabilityFigure(computeAbility(log).ability))
  })

  it('prints newest first', () => {
    const record = figureRecord([exposure(), exposure(), exposure()])
    const dates = record.map(e => e.created_at)
    expect(dates).toEqual([...dates].sort().reverse())
  })

  it('shows the diminishing return: the same read is worth less the more there has been', () => {
    const record = figureRecord([exposure(), exposure(), exposure(), exposure()]).reverse()
    expect(record[0].delta).toBeGreaterThan(record[3].delta)
  })

  it('says a struggle made the figure a guess, rather than that it did nothing', () => {
    const log = Array.from({ length: 8 }, () => exposure({ depth: 'read' }))
    log.push(exposure({ depth: 'struggled', reason: 'diary: "not landing"' }))
    const struggle = figureRecord(log)[0]

    expect(struggle.delta).toBe(0)
    expect(struggle.sureness).toBe('held')
    expect(impactLabel(struggle)).toBe('made it a guess')
  })

  it('never calls the first thing recorded a guess made, since the floor was never a figure', () => {
    const [only] = figureRecord([exposure({ depth: 'marked' })])
    expect(only.sureness).toBeNull()
  })

  it('lists a diary entry that recorded nothing here, as moving nothing', () => {
    const log = [exposure({ created_at: '2026-09-01T09:00:00Z' })]
    const record = figureRecord(log, [
      { id: 'd1', note: 'Spent the week on\n\n Core Web Vitals and it finally clicked.', created_at: '2026-09-14T07:20:00Z' },
    ])

    expect(record[0]).toMatchObject({
      id: 'entry:d1',
      kind: 'entry',
      delta: 0,
      after: record[1].after,
      reason: 'diary: "Spent the week on Core Web Vitals and it finally clicked."',
    })
    expect(impactLabel(record[0])).toBe('moved nothing')
  })

  it('does not list an entry twice when its reading is already in the log', () => {
    const log = [exposure({ source: 'diary', source_id: 'd1', reason: 'diary: "built it"' })]
    const record = figureRecord(log, [{ id: 'd1', note: 'built it', created_at: log[0].created_at }])
    expect(record).toHaveLength(1)
    expect(record[0].kind).toBe('exposure')
  })

  it('cuts a long entry at a word', () => {
    const note = 'word '.repeat(60)
    const [entry] = figureRecord([], [{ id: 'd', note, created_at: '2026-09-01T00:00:00Z' }])
    expect(entry.reason.length).toBeLessThan(110)
    expect(entry.reason).toMatch(/word…"$/)
  })
})

describe('impactLabel', () => {
  it('signs every figure, nought included', () => {
    expect(impactLabel({ kind: 'exposure', delta: 6, sureness: null })).toBe('+6')
    expect(impactLabel({ kind: 'exposure', delta: 0, sureness: null })).toBe('±0')
    expect(impactLabel({ kind: 'exposure', delta: 3, sureness: 'lifted' })).toBe('+3, no longer a guess')
  })
})
