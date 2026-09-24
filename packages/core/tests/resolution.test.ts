import { describe, it, expect } from 'vitest'
import { readDistribution, readSubjects, readingSentence, NONE } from '../src/resolution'
import { config } from '../src/config'

describe('readDistribution', () => {
  it('links a clear winner with daylight behind it', () => {
    const reading = readDistribution('t1', { t1: 0.94, t2: 0.04, [NONE]: 0.02 })
    expect(reading).toMatchObject({ action: 'link', topicId: 't1', because: 'sure' })
  })

  it('queues a close race rather than merging on the winner', () => {
    // The case a cosine cannot express: both topics score well, and the
    // winner is only just the winner. A merge here destroys a history
    // on a coin toss.
    const reading = readDistribution('t1', { t1: 0.52, t2: 0.44, [NONE]: 0.04 })
    expect(reading).toMatchObject({ action: 'pending', nearestId: 't1' })
  })

  it('calls a close race between two topics a race', () => {
    const reading = readDistribution('t1', { t1: 0.45, t2: 0.4, [NONE]: 0.15 })
    expect(reading).toMatchObject({ action: 'pending', because: 'narrow-margin' })
  })

  it('calls a lone weak winner a shrug rather than a race', () => {
    const reading = readDistribution('t1', { t1: 0.5, t2: 0.2, [NONE]: 0.3 })
    expect(reading).toMatchObject({ action: 'pending', because: 'unsure' })
  })

  it('cannot produce a link without daylight behind it', () => {
    // Why there is one bar and not two. The distribution is normalised,
    // so clearing JEV_LINK forces every rival below 1 - JEV_LINK. A
    // separate margin threshold would be unreachable, and this is the
    // test that says so rather than a comment claiming it.
    const floor = config.JEV_LINK - (1 - config.JEV_LINK)
    for (const rival of [0.01, 0.1, 1 - config.JEV_LINK]) {
      const reading = readDistribution('t1', { t1: config.JEV_LINK, t2: rival })
      expect(reading.action).toBe('link')
      expect(reading.margin).toBeGreaterThanOrEqual(floor)
    }
  })

  it('creates when none of them wins outright', () => {
    const reading = readDistribution(NONE, { [NONE]: 0.88, t1: 0.08, t2: 0.04 })
    expect(reading).toMatchObject({ action: 'create', because: 'distinct' })
  })

  it('queues a weak "none" against the topic behind it', () => {
    // "Probably new" is still a question, and unlike a shrug it has a
    // topic to name, so the queue can show the pair.
    const reading = readDistribution(NONE, { [NONE]: 0.45, t1: 0.4, t2: 0.15 })
    expect(reading).toMatchObject({ action: 'pending', nearestId: 't1', because: 'unsure' })
  })

  it('refuses to link on a choice with no distribution behind it', () => {
    // A verdict without its reasoning. Not every provider returns
    // probabilities, and an irreversible write is not the place to
    // assume one that did not arrive.
    const reading = readDistribution('t1', undefined)
    expect(reading).toMatchObject({ action: 'pending', nearestId: 't1', because: 'empty' })
  })

  it('creates when nothing came back at all', () => {
    expect(readDistribution(undefined, {})).toMatchObject({ action: 'create', because: 'empty' })
  })

  it('creates rather than queueing when only none was returned', () => {
    const reading = readDistribution(NONE, { [NONE]: 0.3 })
    expect(reading.action).toBe('create')
  })

  it('ignores options that are not finite numbers', () => {
    const reading = readDistribution('t1', { t1: 0.95, t2: Number.NaN, [NONE]: 0.05 })
    expect(reading).toMatchObject({ action: 'link', topicId: 't1' })
  })

  it('reports the margin it decided on', () => {
    const reading = readDistribution('t1', { t1: 0.9, t2: 0.07, [NONE]: 0.03 })
    expect(reading.margin).toBeCloseTo(0.83, 5)
  })

  it('reads a rounded distribution that sums to less than one', () => {
    // Two decimal places, so a distribution may arrive summing to 0.99.
    // Nothing here normalises, so the bars have to hold against it.
    const reading = readDistribution('t1', { t1: 0.89, t2: 0.06, [NONE]: 0.04 })
    expect(reading.action).toBe('link')
  })

  it('holds the bars the config sets rather than its own', () => {
    const justUnder = readDistribution('t1', { t1: config.JEV_LINK - 0.01, t2: 0.01 })
    expect(justUnder.action).toBe('pending')
    const justOver = readDistribution('t1', { t1: config.JEV_LINK + 0.01, t2: 0.01 })
    expect(justOver.action).toBe('link')
  })
})

describe('readSubjects', () => {
  it('files under every subject above the floor, strongest first', () => {
    // The many-to-many case: a topic genuinely sitting in two beds
    // lands in both rather than in whichever rounded up.
    expect(readSubjects({ s1: 0.45, s2: 0.44, s3: 0.08, [NONE]: 0.03 })).toEqual(['s1', 's2'])
  })

  it('files under nothing when none wins outright', () => {
    expect(readSubjects({ [NONE]: 0.82, s1: 0.12, s2: 0.06 })).toEqual([])
  })

  it('still files where none is present but weak', () => {
    expect(readSubjects({ s1: 0.6, [NONE]: 0.3, s2: 0.1 })).toEqual(['s1'])
  })

  it('drops subjects under the floor', () => {
    expect(readSubjects({ s1: 0.7, s2: 0.2, s3: 0.1 })).toEqual(['s1'])
  })

  it('returns nothing for an absent distribution', () => {
    expect(readSubjects(undefined)).toEqual([])
  })
})

describe('readingSentence', () => {
  it('says the two kinds of unsure differently', () => {
    const race = readingSentence(readDistribution('t1', { t1: 0.45, t2: 0.4, [NONE]: 0.15 }))
    const shrug = readingSentence(readDistribution('t1', { t1: 0.5, t2: 0.2, [NONE]: 0.3 }))
    expect(race).not.toBe(shrug)
    expect(race).toMatch(/close behind/)
  })

  it('prints a percentage rather than a probability', () => {
    const sentence = readingSentence(readDistribution('t1', { t1: 0.94, t2: 0.04, [NONE]: 0.02 }))
    expect(sentence).toContain('94%')
  })
})
