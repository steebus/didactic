'use client'

import { useState } from 'react'
import styles from './blocks.module.css'
import { useQuestion, type AnswerOutcome } from './answering'
import { Scored } from './Scored'

interface Option {
  text: string
  correct?: boolean
  why?: string
}

export interface CheckData {
  question?: string
  options?: Option[]
}

/**
 * A question with a right answer, asked in the middle of the prose.
 *
 * The reward for answering is still the explanation, including the
 * explanation for why the answer you nearly picked was wrong. A right
 * answer is now also worth a small boost to the topic's figure.
 *
 * The original objection to scoring these -- that it makes guessing
 * expensive and turns a teaching device into a test -- is answered
 * rather than dropped. Only the first answer counts, so "Ask again" is
 * for understanding and never for the figure; a wrong answer subtracts
 * nothing; and what it was worth is printed under the question rather
 * than moving a number somewhere else on the reader's behalf.
 */
export function Check({ data }: { data: CheckData }) {
  const [picked, setPicked] = useState<number | null>(null)
  const [outcome, setOutcome] = useState<AnswerOutcome | null>(null)
  const { already, record } = useQuestion(data.question)
  const options = data.options ?? []
  if (!data.question || options.length < 2) return null

  const answered = picked !== null

  /** Pick one, and enter it if this is the first time. */
  function pick(i: number) {
    setPicked(i)
    if (already) return
    void record(options[i]?.correct === true).then(setOutcome)
  }

  return (
    <div className={styles.check}>
      <p className={styles.checkQuestion}>{data.question}</p>

      <ul className={styles.checkOptions}>
        {options.map((option, i) => {
          const chosen = picked === i
          // Once answered, the right one is marked whether or not it was
          // the one chosen: the point is to leave knowing which it was.
          const state = !answered
            ? 'idle'
            : option.correct
              ? 'right'
              : chosen
                ? 'wrong'
                : 'idle'
          return (
            <li key={i}>
              <button
                type="button"
                className={`${styles.checkOption} ${styles[`check_${state}`]}`}
                onClick={() => pick(i)}
                disabled={answered}
                aria-pressed={chosen}
              >
                <span className={styles.checkMark} aria-hidden="true">
                  {state === 'right' ? '✓' : state === 'wrong' ? '✗' : '○'}
                </span>
                <span>{option.text}</span>
              </button>
              {answered && (chosen || option.correct) && option.why && (
                <p className={styles.checkWhy}>{option.why}</p>
              )}
            </li>
          )
        })}
      </ul>

      {answered && (
        <>
          <p className={styles.checkFoot}>
            {options[picked]?.correct
              ? 'Right.'
              : 'Not this time — the marked answer is the one to take away.'}{' '}
            {/* Asking again is for understanding, never for the figure:
                the answer is already entered and a second one counts
                for nothing, which the note below says. */}
            <button type="button" className={styles.checkAgain} onClick={() => setPicked(null)}>
              Ask again
            </button>
          </p>
          <Scored
            outcome={outcome}
            correct={options[picked]?.correct === true}
            already={already}
          />
        </>
      )}
    </div>
  )
}
