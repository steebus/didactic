'use client'

import { useState } from 'react'
import { allCorrect } from '@didactic/core/answers'
import { useQuestion, type AnswerOutcome } from './answering'
import { Scored } from './Scored'
import { Rich } from '../Rich'
import styles from './blocks.module.css'

interface Item {
  text: string
  /** The name of the group it belongs in. */
  group?: string
  why?: string
}

export interface SortData {
  question?: string
  groups?: string[]
  items?: Item[]
  caption?: string
}

/**
 * Put each of these in the right bucket.
 *
 * The question `check` cannot ask. A multiple choice asks about one
 * thing at a time, so a rule with five instances under it becomes five
 * blocks or, worse, one block that tests whether the reader can spot
 * the odd one out. Sorting asks the thing itself: here is the rule,
 * here are five cases, which side does each fall on.
 *
 * Buttons rather than dragging. A drag is the obvious gesture and the
 * wrong one: it is awkward on a phone, hostile to a keyboard, and
 * essentially unusable with a screen reader, and none of that buys
 * anything a reader picking a group does not already have.
 */
export function Sort({ data }: { data: SortData }) {
  const groups = data.groups ?? []
  const items = data.items ?? []

  // Which group each item has been put in, by item index.
  const [placed, setPlaced] = useState<Record<number, string>>({})
  const [checked, setChecked] = useState(false)
  const [outcome, setOutcome] = useState<AnswerOutcome | null>(null)
  const { already, record } = useQuestion(data.question)

  // Two groups at least, or there is no sorting to do; and every item
  // has to name a group that exists, or the question cannot be got
  // right however carefully it is answered.
  const sound =
    Boolean(data.question) &&
    groups.length >= 2 &&
    items.length >= 2 &&
    items.every(i => i.group && groups.includes(i.group))
  if (!sound) return null

  const marks = items.map((item, i) => placed[i] === item.group)
  const right = allCorrect(marks)
  const done = items.every((_, i) => placed[i] !== undefined)

  function check() {
    setChecked(true)
    if (already) return
    void record(right).then(setOutcome)
  }

  function again() {
    setChecked(false)
    setPlaced({})
  }

  return (
    <div className={styles.check}>
      <Rich as="p" className={styles.checkQuestion} text={data.question} />

      <ul className={styles.sortItems}>
        {items.map((item, i) => (
          <li key={i} className={styles.sortItem}>
            <span
              className={styles.sortText}
              data-state={!checked ? undefined : marks[i] ? 'right' : 'wrong'}
            >
              {checked && (
                <span className={styles.sortMark} aria-hidden="true">
                  {marks[i] ? '✓' : '✗'}
                </span>
              )}
              <Rich text={item.text} />
            </span>

            {/* A radio group in all but name: one choice per item, and
                the whole set reachable by keyboard in one tab stop's
                worth of arrows. */}
            <span
              className={styles.sortGroups}
              role="radiogroup"
              aria-label={`Which group for “${item.text}”`}
            >
              {groups.map(group => (
                <button
                  key={group}
                  type="button"
                  role="radio"
                  aria-checked={placed[i] === group}
                  className={styles.sortGroup}
                  data-chosen={placed[i] === group ? 'true' : undefined}
                  // Once checked, the right bucket is shown whether or
                  // not it was the one chosen: the point is to leave
                  // knowing where each one belonged.
                  data-answer={checked && item.group === group ? 'true' : undefined}
                  disabled={checked}
                  onClick={() => setPlaced(p => ({ ...p, [i]: group }))}
                >
                  {group}
                </button>
              ))}
            </span>

            {checked && !marks[i] && item.why && (
              <Rich as="p" className={styles.checkWhy} text={item.why} />
            )}
          </li>
        ))}
      </ul>

      {!checked ? (
        <p className={styles.checkFoot}>
          <button
            type="button"
            className={styles.checkAgain}
            onClick={check}
            disabled={!done}
          >
            Check them
          </button>
          {!done && (
            <span className={styles.sortWaiting}>
              {' '}
              — put each one somewhere first.
            </span>
          )}
        </p>
      ) : (
        <>
          <p className={styles.checkFoot}>
            {right
              ? 'All in the right place.'
              : `${marks.filter(Boolean).length} of ${items.length} — the marked bucket is where each one belonged.`}{' '}
            <button type="button" className={styles.checkAgain} onClick={again}>
              Try them again
            </button>
          </p>
          <Scored outcome={outcome} correct={right} already={already} />
        </>
      )}

      {data.caption && <Rich as="p" className={styles.caption} text={data.caption} />}
    </div>
  )
}
