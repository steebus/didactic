'use client'

import { useMemo, useState } from 'react'
import { acceptsAnswer, allCorrect, parseBlanks } from '@didactic/core/answers'
import { useQuestion, type AnswerOutcome } from './answering'
import { Scored } from './Scored'
import styles from './blocks.module.css'

interface Gap {
  /** Everything that counts as right. The first is the one printed
   *  back when the reader gets it wrong. */
  accept?: string[]
  why?: string
}

export interface BlankData {
  question?: string
  /** The sentence, with `{{1}}`, `{{2}}` where the gaps go. */
  text?: string
  blanks?: Gap[]
  caption?: string
}

/**
 * A sentence with the load-bearing words taken out.
 *
 * The difference between this and `check` is what it asks of the
 * reader: picking the right option out of four is recognition, and
 * producing the word from nothing is recall. A term that has just been
 * defined is worth asking for this way, once -- it is the cheapest
 * possible test of whether the definition landed as a word or only as
 * a sentence that made sense at the time.
 *
 * Answered as a whole rather than gap by gap: partial credit on a
 * boost this small would be noise, and checking each gap as it is
 * typed turns the sentence into a guessing game against the machine
 * rather than a question.
 */
export function Blank({ data }: { data: BlankData }) {
  const blanks = useMemo(() => data.blanks ?? [], [data.blanks])
  const pieces = useMemo(
    () => (data.text ? parseBlanks(data.text, blanks.length) : null),
    [data.text, blanks.length]
  )

  const [typed, setTyped] = useState<string[]>(() => blanks.map(() => ''))
  const [checked, setChecked] = useState(false)
  const [outcome, setOutcome] = useState<AnswerOutcome | null>(null)
  const { already, record } = useQuestion(data.question)

  // A payload whose sentence and answers do not agree is not printed as
  // a broken question: the parser says so and the block stands down.
  if (!data.question || !pieces || blanks.length === 0) return null

  const marks = blanks.map((gap, i) => acceptsAnswer(typed[i] ?? '', gap.accept ?? []))
  const right = allCorrect(marks)

  function check() {
    setChecked(true)
    if (already) return
    void record(right).then(setOutcome)
  }

  function again() {
    setChecked(false)
    setTyped(blanks.map(() => ''))
  }

  return (
    <div className={styles.check}>
      <p className={styles.checkQuestion}>{data.question}</p>

      <p className={styles.blankSentence}>
        {pieces.map((piece, i) =>
          piece.kind === 'text' ? (
            <span key={i}>{piece.text}</span>
          ) : (
            <input
              key={i}
              type="text"
              className={styles.blankGap}
              data-state={
                !checked ? undefined : marks[piece.at] ? 'right' : 'wrong'
              }
              // Wide enough for the answer it wants without giving its
              // length away to the character: a box cut to the word is
              // half the answer.
              size={Math.min(Math.max((blanks[piece.at].accept?.[0]?.length ?? 8) + 4, 8), 24)}
              value={typed[piece.at] ?? ''}
              onChange={e =>
                setTyped(t => t.map((v, j) => (j === piece.at ? e.target.value : v)))
              }
              onKeyDown={e => e.key === 'Enter' && !checked && check()}
              disabled={checked}
              aria-label={`Gap ${piece.at + 1} of ${blanks.length}`}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
            />
          )
        )}
      </p>

      {!checked ? (
        <p className={styles.checkFoot}>
          <button
            type="button"
            className={styles.checkAgain}
            onClick={check}
            disabled={typed.every(t => !t.trim())}
          >
            Check it
          </button>
        </p>
      ) : (
        <>
          {/* What the gaps were, and why -- for the ones that were got
              wrong, and for any the writer explained. Getting it right
              is not a reason to withhold the reasoning. */}
          <ul className={styles.blankAnswers}>
            {blanks.map((gap, i) =>
              marks[i] && !gap.why ? null : (
                <li key={i} className={styles.blankAnswer}>
                  <span className={styles.blankMark} aria-hidden="true">
                    {marks[i] ? '✓' : '✗'}
                  </span>
                  <span>
                    <span className={styles.blankWord}>{gap.accept?.[0] ?? '—'}</span>
                    {gap.why && <span className={styles.checkWhy}>{gap.why}</span>}
                  </span>
                </li>
              )
            )}
          </ul>

          <p className={styles.checkFoot}>
            {right ? 'Right.' : 'Not quite — the words above are the ones to take away.'}{' '}
            <button type="button" className={styles.checkAgain} onClick={again}>
              Try it again
            </button>
          </p>
          <Scored outcome={outcome} correct={right} already={already} />
        </>
      )}

      {data.caption && <p className={styles.caption}>{data.caption}</p>}
    </div>
  )
}
