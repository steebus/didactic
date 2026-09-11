'use client'

import { useState } from 'react'
import styles from './blocks.module.css'

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
 * It is answered in place and never recorded. Exposure is written when
 * a lesson is worked through, and it is deliberately not scored on
 * this: a question you got wrong and then understood is the one that
 * taught you something, and a block that quietly moved your figure
 * would make guessing expensive. So the reward for answering is the
 * explanation, including the explanation for why the answer you nearly
 * picked was wrong.
 */
export function Check({ data }: { data: CheckData }) {
  const [picked, setPicked] = useState<number | null>(null)
  const options = data.options ?? []
  if (!data.question || options.length < 2) return null

  const answered = picked !== null

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
                onClick={() => setPicked(i)}
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
        <p className={styles.checkFoot}>
          {options[picked]?.correct
            ? 'Right.'
            : 'Not this time — the marked answer is the one to take away.'}{' '}
          <button type="button" className={styles.checkAgain} onClick={() => setPicked(null)}>
            Ask again
          </button>
        </p>
      )}
    </div>
  )
}
