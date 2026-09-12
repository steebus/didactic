/**
 * FSRS: when a thing should be seen again.
 *
 * The scheduler both front ends read. It is pure arithmetic over two
 * numbers held against a card -- how long the memory of it currently
 * lasts (*stability*, in days) and how hard the card is for this
 * reader (*difficulty*, 1 to 10) -- so it belongs here rather than in
 * either app or in the database, and so the phone schedules a card the
 * same way the web does rather than to its own taste.
 *
 * This is FSRS-5: the nineteen-weight version, with the short-term
 * (same-day) formula the fourth version did not have. The weights below
 * are the published defaults, fitted across a very large review corpus;
 * they are the starting point for a reader who has no history yet, and
 * `review` takes a set so a fitted one can be handed in later without
 * anything else moving.
 *
 * Nothing here reads a clock. The caller says what `now` is, which is
 * what makes every case in `tests/fsrs.test.ts` a fixed sum rather than
 * something that has to be waited for.
 */

/**
 * How a reader answered.
 *
 * Four rungs, because the algorithm is fitted on four: the weights were
 * measured against reviews graded this way, so a client offering fewer
 * is answering on a ruler the fit does not know. The words a reader
 * actually sees are `TENDING` in `./clozes`; what travels between the
 * sheets and the database is the number, so the two cannot drift.
 */
export type Rating = 1 | 2 | 3 | 4

export const AGAIN: Rating = 1
export const HARD: Rating = 2
export const GOOD: Rating = 3
export const EASY: Rating = 4

/**
 * Where a card is in its life.
 *
 * `new` has never been answered. `learning` and `relearning` are the
 * minutes after a miss, before and after the card has ever been held.
 * `review` is the ordinary state: due in days, not minutes.
 */
export type CardState = 'new' | 'learning' | 'review' | 'relearning'

/** What is remembered about a card between sittings. */
export interface Memory {
  /** Days the memory is expected to last. Null before the first answer. */
  stability: number | null
  /** 1 (easy for this reader) to 10 (hard). Null before the first answer. */
  difficulty: number | null
  state: CardState
  reps: number
  lapses: number
  /** When it is next wanted, as an ISO instant. */
  due: string
  /** When it was last answered, as an ISO instant. Null if never. */
  lastReviewedAt: string | null
}

/** The memory after an answer, and what the answer was worth. */
export interface Reviewed {
  memory: Memory
  /** Days between the last answer and this one. 0 for a first sitting. */
  elapsedDays: number
  /** How likely the reader was to have it, just before they answered. */
  retrievability: number
  /** Days until it is wanted again. Under a day for a miss. */
  intervalDays: number
}

/**
 * The nineteen weights.
 *
 * Named rather than indexed where they are used, because `w[8]` in a
 * formula is unreadable and a transposed index is a scheduler that is
 * quietly wrong for a year. The order is FSRS-5's own, so a set fitted
 * by any of the standard tools drops in unchanged.
 */
export type Weights = readonly number[]

export const DEFAULT_WEIGHTS: Weights = [
  0.4072, 1.1829, 3.1262, 15.4722, 7.2102, 0.5316, 1.0651, 0.0234, 1.616, 0.1544, 1.0824,
  1.9813, 0.0953, 0.2975, 2.2042, 0.2407, 2.9466, 0.5034, 0.6567,
] as const

/**
 * The shape of forgetting.
 *
 * FSRS-5 fixes the decay rather than fitting it. `FACTOR` is derived
 * from it so that retrievability is exactly 0.9 when elapsed time
 * equals stability -- which is what makes stability readable as "how
 * long this lasts" rather than as an abstract parameter.
 */
const DECAY = -0.5
const FACTOR = 0.9 ** (1 / DECAY) - 1

/** How likely the reader is to hold the card, requested of a schedule. */
export const REQUEST_RETENTION = 0.9

/** Nothing is ever scheduled further out than a century. */
const MAX_INTERVAL_DAYS = 36500

/**
 * How long a missed card waits before it is offered again.
 *
 * One step rather than a ladder. A ladder of learning steps is a
 * feature of a drilling app, where a sitting is half an hour long; this
 * is a garden that is tended for two minutes at a time, and a card that
 * came back in a minute would simply be answered from short-term memory
 * and learned nothing.
 */
const RELEARN_MINUTES = 10

const MS_PER_DAY = 86_400_000

const clamp = (n: number, low: number, high: number) => Math.min(Math.max(n, low), high)

/** Difficulty stays on its scale however many easy answers it is given. */
const clampDifficulty = (d: number) => clamp(d, 1, 10)

/** Stability never falls below a tenth of a day, or the curve divides by nothing. */
const clampStability = (s: number) => Math.max(s, 0.01)

/**
 * How likely a memory of stability `s` is to be there after `days`.
 *
 * The forgetting curve itself. A power law rather than the exponential
 * the older schedulers used: measured, memory has a much longer tail
 * than an exponential allows, which is why an exponential scheduler
 * keeps asking for things the reader plainly still holds.
 */
export function retrievability(days: number, s: number): number {
  if (s <= 0) return 0
  return (1 + (FACTOR * Math.max(days, 0)) / s) ** DECAY
}

/**
 * How long to wait for a given chance of still holding it.
 *
 * The inverse of the curve. At the default 0.9 this returns exactly the
 * stability, which is the property the constants above are chosen for.
 */
export function intervalFor(s: number, retention = REQUEST_RETENTION): number {
  const days = (s / FACTOR) * (retention ** (1 / DECAY) - 1)
  return clamp(Math.round(days), 1, MAX_INTERVAL_DAYS)
}

/** Stability a card starts at, by how the first answer went. */
const initialStability = (rating: Rating, w: Weights) => clampStability(w[rating - 1])

/** Difficulty a card starts at, by how the first answer went. */
const initialDifficulty = (rating: Rating, w: Weights) =>
  clampDifficulty(w[4] - Math.exp(w[5] * (rating - 1)) + 1)

/**
 * Difficulty after an answer.
 *
 * A miss makes a card harder and an easy answer makes it easier, both
 * by less the nearer difficulty already is to its ceiling. Then it is
 * pulled back towards the difficulty an easy first answer would have
 * given it -- the mean reversion -- so that a run of bad days does not
 * permanently condemn a card the reader has in fact learned.
 */
function nextDifficulty(d: number, rating: Rating, w: Weights): number {
  const moved = d - w[6] * (rating - 3) * ((10 - d) / 9)
  return clampDifficulty(w[7] * initialDifficulty(EASY, w) + (1 - w[7]) * moved)
}

/**
 * Stability after an answer the reader got right.
 *
 * The gain is larger when the card was nearly forgotten (there was
 * something to learn), smaller when stability is already long (the
 * curve flattens), and smaller for a hard card than an easy one.
 */
function stabilityOnRecall(
  s: number,
  d: number,
  r: number,
  rating: Rating,
  w: Weights
): number {
  const hard = rating === HARD ? w[15] : 1
  const easy = rating === EASY ? w[16] : 1
  const gain =
    Math.exp(w[8]) *
    (11 - d) *
    s ** -w[9] *
    (Math.exp(w[10] * (1 - r)) - 1) *
    hard *
    easy
  return clampStability(s * (1 + gain))
}

/**
 * Stability after an answer the reader got wrong.
 *
 * Capped at the stability the card already had: forgetting something
 * never leaves it better remembered than before, and without the cap
 * the formula can say so for a card with very low stability.
 */
function stabilityOnLapse(s: number, d: number, r: number, w: Weights): number {
  const lapsed =
    w[11] * d ** -w[12] * ((s + 1) ** w[13] - 1) * Math.exp(w[14] * (1 - r))
  return clampStability(Math.min(lapsed, s))
}

/**
 * Stability after an answer given the same day as the last one.
 *
 * FSRS-5's addition. The ordinary formulas are fitted on reviews a day
 * or more apart and read a same-day answer as a miraculous gain; this
 * one moves stability by a little, in the direction the answer points.
 */
function stabilityShortTerm(s: number, rating: Rating, w: Weights): number {
  return clampStability(s * Math.exp(w[17] * (rating - 3 + w[18])))
}

const isoPlusDays = (from: Date, days: number) =>
  new Date(from.getTime() + days * MS_PER_DAY).toISOString()

const isoPlusMinutes = (from: Date, minutes: number) =>
  new Date(from.getTime() + minutes * 60_000).toISOString()

/** A card nobody has answered yet, wanted from the moment it exists. */
export function freshMemory(now: Date = new Date()): Memory {
  return {
    stability: null,
    difficulty: null,
    state: 'new',
    reps: 0,
    lapses: 0,
    due: now.toISOString(),
    lastReviewedAt: null,
  }
}

/**
 * Answer a card, and say when it is wanted next.
 *
 * The one entry point. Everything above is in service of it, and
 * nothing above is exported because it is useful on its own -- it is
 * exported where a sheet wants to *print* a figure (how likely the
 * reader is to hold this, how long the next wait is) without claiming
 * to have answered anything.
 */
export function review(
  memory: Memory,
  rating: Rating,
  now: Date = new Date(),
  weights: Weights = DEFAULT_WEIGHTS
): Reviewed {
  const w = weights.length >= 19 ? weights : DEFAULT_WEIGHTS
  const missed = rating === AGAIN

  // A card that has never been answered, or one whose numbers were lost
  // -- the second cannot happen through this module, but a row is a row
  // and reading it as new is better than dividing by null.
  if (memory.stability === null || memory.difficulty === null || memory.state === 'new') {
    const stability = initialStability(rating, w)
    const difficulty = initialDifficulty(rating, w)
    const intervalDays = missed ? RELEARN_MINUTES / 1440 : intervalFor(stability)

    return {
      elapsedDays: 0,
      // Nothing was known about it, so nothing was remembered of it.
      retrievability: 0,
      intervalDays,
      memory: {
        stability,
        difficulty,
        state: missed ? 'learning' : 'review',
        reps: memory.reps + 1,
        lapses: memory.lapses + (missed ? 1 : 0),
        due: missed
          ? isoPlusMinutes(now, RELEARN_MINUTES)
          : isoPlusDays(now, intervalDays),
        lastReviewedAt: now.toISOString(),
      },
    }
  }

  const last = memory.lastReviewedAt ? new Date(memory.lastReviewedAt) : now
  const elapsedDays = Math.max(0, (now.getTime() - last.getTime()) / MS_PER_DAY)
  const r = retrievability(elapsedDays, memory.stability)
  const difficulty = nextDifficulty(memory.difficulty, rating, w)

  // Under a day since the last answer is a second look, not a review.
  const stability =
    elapsedDays < 1
      ? stabilityShortTerm(memory.stability, rating, w)
      : missed
        ? stabilityOnLapse(memory.stability, difficulty, r, w)
        : stabilityOnRecall(memory.stability, difficulty, r, rating, w)

  const intervalDays = missed ? RELEARN_MINUTES / 1440 : intervalFor(stability)

  return {
    elapsedDays,
    retrievability: r,
    intervalDays,
    memory: {
      stability,
      difficulty,
      state: missed ? 'relearning' : 'review',
      reps: memory.reps + 1,
      lapses: memory.lapses + (missed ? 1 : 0),
      due: missed ? isoPlusMinutes(now, RELEARN_MINUTES) : isoPlusDays(now, intervalDays),
      lastReviewedAt: now.toISOString(),
    },
  }
}

/**
 * How long the next wait is, in words a reader can read.
 *
 * Printed on the answer buttons before they are pressed, so the reader
 * is choosing between consequences rather than between adjectives.
 */
export function waitPhrase(days: number): string {
  if (days < 1 / 24) return `${Math.max(1, Math.round(days * 1440))} min`
  if (days < 1) return `${Math.round(days * 24)} h`
  if (days < 30) return `${Math.round(days)} d`
  if (days < 365) return `${Math.round(days / 30)} mo`
  const years = days / 365
  return `${years < 10 ? years.toFixed(1) : Math.round(years)} yr`
}
