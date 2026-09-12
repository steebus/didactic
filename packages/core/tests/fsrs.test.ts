import { describe, it, expect } from 'vitest'
import {
  AGAIN,
  DEFAULT_WEIGHTS,
  EASY,
  GOOD,
  HARD,
  REQUEST_RETENTION,
  freshMemory,
  intervalFor,
  retrievability,
  review,
  waitPhrase,
  type Memory,
} from '../src/fsrs'

const AT = new Date('2026-09-12T09:00:00.000Z')
const day = (from: Date, days: number) => new Date(from.getTime() + days * 86_400_000)

describe('the forgetting curve', () => {
  it('is certain the moment the card is answered', () => {
    expect(retrievability(0, 10)).toBe(1)
  })

  it('is exactly the requested retention after one stability', () => {
    expect(retrievability(10, 10)).toBeCloseTo(REQUEST_RETENTION, 10)
    expect(retrievability(180, 180)).toBeCloseTo(REQUEST_RETENTION, 10)
  })

  it('falls as the wait grows, and never reaches zero', () => {
    const near = retrievability(5, 10)
    const far = retrievability(500, 10)
    expect(near).toBeGreaterThan(far)
    expect(far).toBeGreaterThan(0)
  })

  it('has a longer tail than an exponential would', () => {
    // Two stabilities out, an exponential curve would be at 0.81.
    expect(retrievability(20, 10)).toBeGreaterThan(0.81)
  })
})

describe('intervalFor', () => {
  it('is the stability itself at the default retention', () => {
    expect(intervalFor(30)).toBe(30)
  })

  it('asks sooner when more retention is wanted', () => {
    expect(intervalFor(30, 0.97)).toBeLessThan(intervalFor(30, 0.9))
  })

  it('never returns less than a day, or more than a century', () => {
    expect(intervalFor(0.001)).toBe(1)
    expect(intervalFor(1e9)).toBe(36500)
  })
})

describe('a card nobody has answered', () => {
  it('is due the moment it exists', () => {
    expect(freshMemory(AT).due).toBe(AT.toISOString())
    expect(freshMemory(AT).state).toBe('new')
  })

  it('starts more stable the better the first answer went', () => {
    const stabilities = [AGAIN, HARD, GOOD, EASY].map(
      r => review(freshMemory(AT), r, AT).memory.stability!
    )
    expect(stabilities).toEqual([...stabilities].sort((a, b) => a - b))
  })

  it('starts harder the worse the first answer went', () => {
    const missed = review(freshMemory(AT), AGAIN, AT).memory.difficulty!
    const easy = review(freshMemory(AT), EASY, AT).memory.difficulty!
    expect(missed).toBeGreaterThan(easy)
    expect(easy).toBeGreaterThanOrEqual(1)
    expect(missed).toBeLessThanOrEqual(10)
  })

  it('claims no memory of a card it has never shown', () => {
    expect(review(freshMemory(AT), GOOD, AT).retrievability).toBe(0)
  })

  it('comes back in minutes when it was missed, and in days when it was not', () => {
    const missed = review(freshMemory(AT), AGAIN, AT)
    expect(missed.memory.state).toBe('learning')
    expect(missed.memory.lapses).toBe(1)
    expect(missed.intervalDays).toBeLessThan(1)

    const got = review(freshMemory(AT), GOOD, AT)
    expect(got.memory.state).toBe('review')
    expect(got.memory.lapses).toBe(0)
    expect(got.intervalDays).toBeGreaterThanOrEqual(1)
  })
})

/** A card held for a while: answered well once, a fortnight ago. */
function settled(): Memory {
  const first = review(freshMemory(AT), GOOD, AT).memory
  return { ...first, stability: 14, difficulty: 5, due: day(AT, 14).toISOString() }
}

describe('a card that has been answered before', () => {
  it('lasts longer every time it is got right', () => {
    let memory = settled()
    let last = memory.stability!
    for (let i = 0; i < 5; i++) {
      const at = new Date(memory.due)
      const next = review(memory, GOOD, at)
      expect(next.memory.stability!).toBeGreaterThan(last)
      last = next.memory.stability!
      memory = next.memory
    }
  })

  it('lasts less long after a miss, and never more', () => {
    const memory = settled()
    const missed = review(memory, AGAIN, day(AT, 14))
    expect(missed.memory.stability!).toBeLessThanOrEqual(memory.stability!)
    expect(missed.memory.lapses).toBe(memory.lapses + 1)
    expect(missed.memory.state).toBe('relearning')
    expect(missed.intervalDays).toBeLessThan(1)
  })

  it('gains more from a better answer', () => {
    const memory = settled()
    const at = day(AT, 14)
    const hard = review(memory, HARD, at).memory.stability!
    const good = review(memory, GOOD, at).memory.stability!
    const easy = review(memory, EASY, at).memory.stability!
    expect(hard).toBeLessThan(good)
    expect(good).toBeLessThan(easy)
  })

  it('gains more from a card that was nearly forgotten', () => {
    const memory = settled()
    const soon = review(memory, GOOD, day(AT, 7))
    const late = review(memory, GOOD, day(AT, 60))
    expect(late.retrievability).toBeLessThan(soon.retrievability)
    expect(late.memory.stability!).toBeGreaterThan(soon.memory.stability!)
  })

  it('moves difficulty the way the answer points, and keeps it on scale', () => {
    const memory = settled()
    const at = day(AT, 14)
    expect(review(memory, AGAIN, at).memory.difficulty!).toBeGreaterThan(memory.difficulty!)
    expect(review(memory, EASY, at).memory.difficulty!).toBeLessThan(memory.difficulty!)

    // A run of the same answer must not walk off either end.
    for (const rating of [AGAIN, EASY] as const) {
      let walked = settled()
      for (let i = 0; i < 40; i++) walked = review(walked, rating, new Date(walked.due)).memory
      expect(walked.difficulty!).toBeGreaterThanOrEqual(1)
      expect(walked.difficulty!).toBeLessThanOrEqual(10)
    }
  })

  it('counts the days between the answers', () => {
    const memory = settled()
    expect(review(memory, GOOD, day(AT, 14)).elapsedDays).toBeCloseTo(14, 6)
  })

  it('treats a second look the same day as a second look, not a review', () => {
    const memory = settled()
    const sameDay = review(memory, GOOD, new Date(AT.getTime() + 3_600_000))
    const aFortnight = review(memory, GOOD, day(AT, 14))
    // An hour later the reader has learned far less than they would
    // have at the fortnight, and the short-term formula pays them far
    // less for it -- where the ordinary one would read the hour as a
    // near-perfect recall of a card two weeks cold and pay in full.
    expect(sameDay.memory.stability!).toBeGreaterThan(memory.stability!)
    expect(sameDay.memory.stability!).toBeLessThan(aFortnight.memory.stability!)
    const sameDayGain = sameDay.memory.stability! / memory.stability!
    const reviewGain = aFortnight.memory.stability! / memory.stability!
    expect(sameDayGain).toBeLessThan(reviewGain / 2)
  })

  it('schedules the next sitting at the new stability', () => {
    const memory = settled()
    const next = review(memory, GOOD, day(AT, 14))
    expect(next.intervalDays).toBe(intervalFor(next.memory.stability!))
    const wait = (new Date(next.memory.due).getTime() - day(AT, 14).getTime()) / 86_400_000
    expect(wait).toBeCloseTo(next.intervalDays, 6)
  })

  it('reads a row with no numbers on it as a card never answered', () => {
    const broken: Memory = { ...settled(), stability: null, difficulty: null }
    const next = review(broken, GOOD, day(AT, 14))
    expect(next.memory.stability).toBe(review(freshMemory(AT), GOOD, AT).memory.stability)
  })
})

describe('weights', () => {
  it('ships the nineteen FSRS-5 expects', () => {
    expect(DEFAULT_WEIGHTS).toHaveLength(19)
  })

  it('falls back to the defaults rather than trusting a short set', () => {
    const memory = settled()
    const at = day(AT, 14)
    expect(review(memory, GOOD, at, [1, 2, 3]).memory.stability).toBe(
      review(memory, GOOD, at).memory.stability
    )
  })

  it('schedules differently when a fitted set says so', () => {
    const fitted = DEFAULT_WEIGHTS.map((w, i) => (i === 8 ? w + 0.5 : w))
    const memory = settled()
    const at = day(AT, 14)
    expect(review(memory, GOOD, at, fitted).memory.stability).not.toBe(
      review(memory, GOOD, at).memory.stability
    )
  })
})

describe('waitPhrase', () => {
  it('says minutes, hours, days, months and years', () => {
    expect(waitPhrase(10 / 1440)).toBe('10 min')
    expect(waitPhrase(0.5)).toBe('12 h')
    expect(waitPhrase(3)).toBe('3 d')
    expect(waitPhrase(60)).toBe('2 mo')
    expect(waitPhrase(730)).toBe('2.0 yr')
    expect(waitPhrase(36500)).toBe('100 yr')
  })

  it('never says nothing at all for a wait that exists', () => {
    expect(waitPhrase(0)).toBe('1 min')
  })
})
