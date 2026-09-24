import { describe, it, expect } from 'vitest'
import { readDistribution, readSubjects, readingSentence, guardScope, NONE } from '../src/resolution'
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

describe('guardScope', () => {
  const link = readDistribution('t1', { t1: 0.95, t2: 0.03, [NONE]: 0.02 })
  const queued = readDistribution('t1', { t1: 0.5, t2: 0.3, [NONE]: 0.2 })
  const created = readDistribution(NONE, { [NONE]: 0.9, t1: 0.1 })

  it('lets a link through where the two are the same size', () => {
    expect(guardScope(link, { same: 0.9, narrower: 0.06, broader: 0.02, adjacent: 0.02 }))
      .toBe(link)
  })

  it('holds a link where the concept is the narrower case', () => {
    // "Generics in TypeScript" read as TypeScript at 0.95. The first
    // distribution cannot see this and no bar on it can.
    const held = guardScope(link, { same: 0.1, narrower: 0.85, broader: 0.03, adjacent: 0.02 })
    expect(held).toMatchObject({ action: 'pending', nearestId: 't1', because: 'wrong-scope' })
  })

  it('holds a link where the concept is the broader one', () => {
    const held = guardScope(link, { same: 0.08, narrower: 0.05, broader: 0.85, adjacent: 0.02 })
    expect(held.action).toBe('pending')
  })

  it('holds a link the scope reading could not be got for', () => {
    // A guard that waves through what it could not check is not a guard,
    // and the fault it exists for is one-directional.
    expect(guardScope(link, undefined).action).toBe('pending')
    expect(guardScope(link, {}).action).toBe('pending')
  })

  it('keeps the probability and margin of the reading it held', () => {
    const held = guardScope(link, { same: 0.1, narrower: 0.9 })
    expect(held.probability).toBe(link.probability)
    expect(held.margin).toBe(link.margin)
  })

  it('never downgrades a link past pending', () => {
    // "The narrower case of that topic" is a real relationship worth
    // recording as an edge; throwing it to `create` would lose the pair.
    const held = guardScope(link, { same: 0, narrower: 1 })
    expect(held.action).toBe('pending')
  })

  it('leaves anything that was not a link alone', () => {
    expect(guardScope(queued, { same: 0, narrower: 1 })).toBe(queued)
    expect(guardScope(created, { same: 0, narrower: 1 })).toBe(created)
  })

  it('holds a link on a same score that is not a finite number', () => {
    expect(guardScope(link, { same: Number.NaN, narrower: 0.5 }).action).toBe('pending')
  })

  it('holds the bar the config sets', () => {
    expect(guardScope(link, { same: config.JEV_SAME_SCOPE - 0.01 }).action).toBe('pending')
    expect(guardScope(link, { same: config.JEV_SAME_SCOPE }).action).toBe('link')
  })
})
