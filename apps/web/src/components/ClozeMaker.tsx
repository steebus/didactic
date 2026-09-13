'use client'

import { useMemo, useState } from 'react'
import { didactic } from '@didactic/api'
import type { ClozeCard } from '@didactic/core/clozes'
import { clozeProblem, memoryColumns } from '@didactic/core/clozes'
import { UNSAVED } from '@didactic/core/marks'
import { freshMemory } from '@didactic/core/fsrs'
import { saidTended } from './TendTally'
import styles from './ClozeMaker.module.css'

const api = didactic()

/**
 * Making a cloze out of a passage the reader chose.
 *
 * The same thing the agent does when a lesson is marked worked, with
 * the reader holding the pen. It is offered from the composer that
 * already has the passage in hand, so the whole gesture is: select a
 * sentence, press *Make a cloze*, press the words to take out, plant.
 *
 * The blank is chosen by pressing words rather than by typing
 * underscores or dragging a second selection inside the first. A cloze
 * is a passage *and* a span inside it, and pressing the words that
 * should disappear is the thing itself -- it also works on a phone,
 * where a second selection inside a selection is not a gesture anyone
 * can make.
 *
 * Pressing two words apart takes everything between them. That is
 * almost always what was meant: a reader pressing "compound" and then
 * "interest" wants the phrase, not two holes with a word standing
 * between them.
 */
export function ClozeMaker({
  lessonId,
  quote,
  prefix,
  topicId = null,
  onPlanted,
  onSettled,
  onCancel,
}: {
  lessonId: string
  quote: string
  prefix: string | null
  /** What the lesson teaches, for the draft the page draws at once. */
  topicId?: string | null
  /**
   * Planted — called on the press, before the server has been asked,
   * with a draft carrying an unsaved id. The caller closes the maker
   * and draws the plum there and then.
   */
  onPlanted: (cloze: ClozeCard) => void
  /**
   * What the server made of it. The real row under the id the rest of
   * the app knows it by, or null and a sentence where the write failed
   * and the plum has to come back off.
   */
  onSettled?: (draftId: string, cloze: ClozeCard | null, error: string | null) => void
  onCancel: () => void
}) {
  /** The words of the passage, with where each one starts in it. */
  const words = useMemo(() => {
    const found: Array<{ text: string; at: number }> = []
    const pattern = /\S+/g
    let match: RegExpExecArray | null
    while ((match = pattern.exec(quote))) found.push({ text: match[0], at: match.index })
    return found
  }, [quote])

  /** The two ends of the run, as indices into `words`. */
  const [ends, setEnds] = useState<[number, number] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const span = ends
    ? { from: Math.min(...ends), to: Math.max(...ends) }
    : null

  const blank = span
    ? quote.slice(words[span.from].at, words[span.to].at + words[span.to].text.length)
    : ''
  const blankStart = span ? words[span.from].at : 0

  function press(index: number) {
    setError(null)
    setEnds(before => {
      if (!before) return [index, index]
      const [first, second] = before
      // Pressing the one word already taken puts it back.
      if (first === second && first === index) return null
      // A second press extends the run; a third starts again, which is
      // how a reader gets out of a run they did not mean.
      return first === second ? [first, index] : [index, index]
    })
  }

  const problem = blank ? clozeProblem(quote, blank, blankStart) : null

  /**
   * Plant it, and close on the press.
   *
   * Drawn and out of the way first, the way keeping a mark is: the
   * reader chose a sentence and some words in it, and the rest -- a
   * row, a schedule, a first due date -- is not work they should be
   * made to stand and watch. A draft under an unsaved id is enough for
   * the plum to appear on the words immediately, because drawing a
   * tended passage needs only the passage and its prefix.
   *
   * What the draft cannot know is its real id and the prefix the server
   * re-finds against the lesson body, so the row that comes back
   * replaces it. A failure takes the plum back off rather than leaving
   * a cloze that exists only on this screen.
   */
  function plant() {
    if (!blank) {
      setError('Press the words to take out.')
      return
    }
    if (problem) {
      setError(problem)
      return
    }

    const now = new Date().toISOString()
    const draft: ClozeCard = {
      id: `${UNSAVED}${crypto.randomUUID()}`,
      concept_id: null,
      lesson_id: lessonId,
      topic_id: topicId,
      text: quote,
      prefix,
      blank,
      blank_start: blankStart,
      blank_end: blankStart + blank.length,
      hint: null,
      created_by: 'user',
      ...memoryColumns(freshMemory(new Date(now))),
      created_at: now,
      updated_at: now,
      concept: null,
      lesson: null,
      topic: null,
    }

    onPlanted(draft)

    void (async () => {
      const { ok, body, error: failed } = await api.clozes.create({
        lessonId,
        text: quote,
        blank,
        blankStart,
        hint: null,
      })
      if (!ok) {
        onSettled?.(draft.id, null, `${failed ?? 'That cloze was not planted'}. Select the passage again to try once more.`)
        return
      }
      saidTended()
      onSettled?.(draft.id, body.cloze, null)
    })()
  }

  return (
    <div className={styles.maker}>
      <p className={styles.about}>Press the words to take out</p>

      <p className={styles.passage}>
        {words.map((word, i) => (
          <button
            key={`${word.at}-${i}`}
            type="button"
            className={styles.word}
            data-taken={span && i >= span.from && i <= span.to ? 'true' : undefined}
            onClick={() => press(i)}
            aria-pressed={Boolean(span && i >= span.from && i <= span.to)}
          >
            {word.text}
          </button>
        ))}
      </p>

      {/* What the card will actually ask, before it is planted. A
          reader should not have to imagine the thing they are making. */}
      {blank && (
        <p className={styles.reading}>
          {quote.slice(0, blankStart)}
          <span className={styles.hole} aria-label="the blank" />
          {quote.slice(blankStart + blank.length)}
        </p>
      )}

      {(error ?? problem) && <p className={styles.problem}>{error ?? problem}</p>}

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.plant}
          onClick={plant}
          disabled={!blank || Boolean(problem)}
        >
          Plant it
        </button>
        <button type="button" className={styles.cancel} onClick={onCancel}>
          Cancel
        </button>
      </div>

      {prefix === null && (
        <p className={styles.note}>
          It will be due straight away, and again on its own schedule after that.
        </p>
      )}
    </div>
  )
}
