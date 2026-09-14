import { describe, it, expect } from 'vitest'
import { reckon, RECKONING_EMPTY } from '../src/loose'
import { established, holdings } from '../src/adjudication'
import type { TopicEvidence } from '../src/shapes'

const held = (over: Partial<TopicEvidence>): TopicEvidence => ({
  ...RECKONING_EMPTY,
  ...over,
})

describe('reckon', () => {
  it('is empty for an empty handful', () => {
    expect(reckon([])).toEqual(RECKONING_EMPTY)
  })

  it('adds what the handful holds between them', () => {
    const total = reckon([
      held({ resources: 2, marks: 1 }),
      held({ resources: 1, exposures: 3 }),
    ])
    expect(total.resources).toBe(3)
    expect(total.marks).toBe(1)
    expect(total.exposures).toBe(3)
  })

  it('never claims a subject', () => {
    // A loose topic is by definition filed under none, so a reckoning
    // that named one would be describing something else.
    const total = reckon([held({ subjects: [{ id: 'a', title: 'Investing' }] })])
    expect(total.subjects).toEqual([])
  })

  it('reads back through the same sentences a single topic does', () => {
    // The reckoning is a TopicEvidence so the delete can be phrased with
    // `holdings` and `established` rather than a second set of words
    // that could drift from them.
    const total = reckon([held({ resources: 1 }), held({ marks: 2 })])
    expect(holdings(total)).toBe('1 resource · 2 marks')
    expect(established(total)).toBe(true)
  })

  it('is not established when nothing in the handful was read', () => {
    expect(established(reckon([held({ resources: 4 }), held({ resources: 1 })]))).toBe(false)
  })
})
