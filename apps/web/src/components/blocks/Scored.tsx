'use client'

import styles from './blocks.module.css'
import type { AnswerOutcome } from './answering'

/**
 * What a question was worth, said out loud under it.
 *
 * The reason questions went unscored for so long was a good one: a
 * block that quietly moved your figure would make guessing expensive
 * and turn a teaching device into a test. Scoring them without saying
 * so is exactly the version of this that was worth avoiding -- so the
 * page says it, every time, including when the answer was worth
 * nothing and why.
 *
 * Shared by all three question blocks so the wording cannot drift
 * between them: three sentences about the same rule, written three
 * times, is three chances to describe it differently.
 */
export function Scored({
  outcome,
  correct,
  already,
}: {
  /** Null until the server has answered. */
  outcome: AnswerOutcome | null
  correct: boolean
  /** Whether this question had been answered before today. */
  already: boolean
}) {
  if (already) {
    return (
      <p className={styles.scored}>
        You have answered this one before, so it counts for nothing now — the
        first answer is the only one that moves anything.
      </p>
    )
  }

  if (!correct) {
    return (
      <p className={styles.scored}>
        Nothing lost: a wrong answer never subtracts. The explanation is the
        thing to take away.
      </p>
    )
  }

  if (!outcome) return <p className={styles.scored}>Entering it…</p>

  if (!outcome.counted) {
    return (
      <p className={styles.scored}>
        Already answered, so this one counts for nothing.
      </p>
    )
  }

  return (
    <p className={styles.scored} data-paid={outcome.paid ? 'true' : undefined}>
      {outcome.paid
        ? 'Entered in the ledger — a little viability for the topic.'
        : 'Counted. This lesson teaches no single topic, so there is no figure for it to move.'}
    </p>
  )
}
