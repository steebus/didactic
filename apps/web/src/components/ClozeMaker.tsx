'use client'

import { useMemo, useState } from 'react'
import { didactic } from '@didactic/api'
import type { ClozeCard } from '@didactic/core/clozes'
import { clozeProblem } from '@didactic/core/clozes'
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
  onPlanted,
  onCancel,
}: {
  lessonId: string
  quote: string
  prefix: string | null
  onPlanted: (cloze: ClozeCard) => void
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
  const [busy, setBusy] = useState(false)
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

  async function plant() {
    if (!blank) {
      setError('Press the words to take out.')
      return
    }
    if (problem) {
      setError(problem)
      return
    }

    setBusy(true)
    const { ok, body, error: failed } = await api.clozes.create({
      lessonId,
      text: quote,
      blank,
      blankStart,
      hint: null,
    })
    setBusy(false)
    if (!ok) {
      setError(failed ?? 'That cloze was not planted.')
      return
    }
    saidTended()
    onPlanted(body.cloze)
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
          onClick={() => void plant()}
          disabled={busy || !blank || Boolean(problem)}
        >
          {busy ? 'Planting…' : 'Plant it'}
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
