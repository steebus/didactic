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

/** The column everything starts in, and the only one that is not an
 *  answer. Named rather than numbered so the code reads as the board. */
const UNPLACED = 'Not yet placed'

/**
 * Put each of these in the right column.
 *
 * The question `check` cannot ask. A multiple choice asks about one
 * thing at a time, so a rule with five instances under it becomes five
 * blocks or, worse, one block that tests whether the reader can spot
 * the odd one out. Sorting asks the thing itself: here is the rule,
 * here are five cases, which side does each fall on.
 *
 * A board since 050, where it was a list of rows each carrying a set of
 * group buttons. Two things were wrong with that. The reader could not
 * see their own answer: the groups were the small repeated thing and
 * the items were the list, so *which things did I call cacheable* meant
 * reading five rows and remembering. And the shape said nothing -- a
 * sort is a question about where things end up, and a list of rows is
 * not a picture of where anything ended up.
 *
 * Now the groups are the columns and the items are cards in them, so
 * the answer is the arrangement, readable at a glance and wrong in a
 * way you can see before you are told.
 *
 * Arrows on the card rather than dragging. A drag is the obvious
 * gesture and the wrong one: awkward on a phone, hostile to a keyboard,
 * essentially unusable with a screen reader, and it buys a reader
 * choosing between three columns nothing they do not already have. Each
 * arrow is an ordinary button that says where it would put the card.
 */
export function Sort({ data }: { data: SortData }) {
  const groups = data.groups ?? []
  const items = data.items ?? []

  // Which column each item is in, by item index. Absent means unplaced,
  // which is where everything starts.
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

  /** The board, left to right. The holding column is not an answer, so
   *  it is not one of the groups; it is where the answering starts. */
  const columns = [UNPLACED, ...groups]

  function move(index: number, by: 1 | -1) {
    setPlaced(p => {
      const at = columns.indexOf(p[index] ?? UNPLACED)
      const to = columns[at + by]
      if (to === undefined) return p
      if (to === UNPLACED) {
        // Back to the holding column is the absence of a placing, not a
        // placing called "unplaced": `done` asks whether every item has
        // one, and a card sent back must make that false again.
        const rest = { ...p }
        delete rest[index]
        return rest
      }
      return { ...p, [index]: to }
    })
  }

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

      <div className={styles.board}>
        {columns.map(column => {
          const held = items
            .map((item, i) => ({ item, i }))
            .filter(({ i }) => (placed[i] ?? UNPLACED) === column)

          return (
            <section
              key={column}
              className={styles.boardColumn}
              data-holding={column === UNPLACED || undefined}
              aria-label={column}
            >
              <h4 className={styles.boardName}>{column}</h4>

              <ul className={styles.boardStack}>
                {held.map(({ item, i }) => {
                  const at = columns.indexOf(column)
                  const state = !checked ? undefined : marks[i] ? 'right' : 'wrong'

                  return (
                    <li key={i} className={styles.boardCard} data-state={state}>
                      <div className={styles.boardCardText}>
                        {checked && (
                          <span className={styles.boardMark} aria-hidden="true">
                            {marks[i] ? '✓' : '✗'}
                          </span>
                        )}
                        <Rich text={item.text} />
                      </div>

                      {/* Once checked the card stays where the reader
                          put it and is told where it belonged, rather
                          than sliding to the right column on its own:
                          the board is their answer, and an answer that
                          corrects itself is one they never see. */}
                      {checked && !marks[i] && (
                        <p className={styles.boardBelonged}>
                          Belonged in <strong>{item.group}</strong>
                          {item.why ? <> — <Rich as="span" text={item.why} /></> : null}
                        </p>
                      )}

                      {!checked && (
                        <div className={styles.boardWays}>
                          <button
                            type="button"
                            className={styles.boardWay}
                            data-way="back"
                            disabled={at === 0}
                            aria-label={
                              at === 0
                                ? `“${item.text}” is already in ${column}`
                                : `Move “${item.text}” to ${columns[at - 1]}`
                            }
                            onClick={() => move(i, -1)}
                          />
                          <button
                            type="button"
                            className={styles.boardWay}
                            data-way="on"
                            disabled={at === columns.length - 1}
                            aria-label={
                              at === columns.length - 1
                                ? `“${item.text}” is already in ${column}`
                                : `Move “${item.text}” to ${columns[at + 1]}`
                            }
                            onClick={() => move(i, 1)}
                          />
                        </div>
                      )}
                    </li>
                  )
                })}

                {held.length === 0 && (
                  <li className={styles.boardEmpty} aria-hidden="true" />
                )}
              </ul>
            </section>
          )
        })}
      </div>

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
          {!done && <span> — move each one out of “{UNPLACED}” first.</span>}
        </p>
      ) : (
        <>
          <p className={styles.checkFoot}>
            {right
              ? 'All in the right column.'
              : `${marks.filter(Boolean).length} of ${items.length} — each card that is out says where it belonged.`}{' '}
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
