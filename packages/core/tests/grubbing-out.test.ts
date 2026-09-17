import { describe, expect, it } from 'vitest'
import { grubbingOut } from '../src/adjudication'
import { RECKONING_EMPTY } from '../src/loose'
import type { TopicEvidence } from '../src/shapes'

const evidence = (over: Partial<TopicEvidence>): TopicEvidence => ({
  ...RECKONING_EMPTY,
  ...over,
})

describe('grubbingOut', () => {
  it('says nothing about a topic holding nothing', () => {
    const { takes, keeps } = grubbingOut(RECKONING_EMPTY)
    expect(takes).toEqual([])
    expect(keeps).toEqual([])
  })

  // The whole point of the warning: the reader's own writing survives,
  // and the lessons do not. Getting these two the wrong way round is
  // the one mistake that would matter.
  it('takes lessons and readings, keeps marks and material', () => {
    const { takes, keeps } = grubbingOut(
      evidence({ lessons: 4, exposures: 9, marks: 3, resources: 2 })
    )

    expect(takes.join(' ')).toContain('4 lessons')
    expect(takes.join(' ')).toContain('9 recorded readings')
    expect(keeps.join(' ')).toContain('3 marked passages')
    expect(keeps.join(' ')).toContain('2 pieces')

    // Nothing the reader wrote is ever listed as going.
    expect(takes.join(' ')).not.toContain('mark')
  })

  it('counts one of each in the singular', () => {
    const { takes, keeps } = grubbingOut(
      evidence({ lessons: 1, exposures: 1, marks: 1, resources: 1 })
    )
    expect(takes[0]).toContain('1 lesson,')
    expect(takes[1]).toContain('1 recorded reading')
    expect(keeps[0]).toContain('1 marked passage')
    expect(keeps[1]).toContain('1 piece')
  })
})
