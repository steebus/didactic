'use client'

import { useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { didactic } from '@didactic/api'
import type { ClozeCard as Card } from '@didactic/core/clozes'
import {
  BLANK_MARK,
  TENDING,
  clozeFace,
  clozeProblem,
  memoryOf,
} from '@didactic/core/clozes'
import { isUnsaved } from '@didactic/core/marks'
import { review, waitPhrase, type Rating } from '@didactic/core/fsrs'
import { saidTended } from './TendTally'
import styles from './ClozeCard.module.css'

const api = didactic()

/**
 * One cloze, face down and then face up.
 *
 * The same card wherever it is met: on the Tend sheet, where they come
 * one after another, and in the lesson, where pressing a purple passage
 * opens the card that was taken from it. Two renderings of a flashcard
 * would be two sets of answer buttons that could come to mean different
 * things, which is the one thing a scheduler cannot survive.
 *
 * A new card is a new question, so every caller keys this on the
 * cloze's id: the state that matters here is whether the answer is
 * showing, and carrying that from one card to the next would hand the
 * reader the next answer before they had read the question. A key is
 * the right instrument for that -- resetting five pieces of state in an
 * effect is the same thing said worse, and a render later.
 *
 * What a card must never do is give the answer away before it is asked
 * for. So the blank is a rule of the right length rather than the word
 * greyed out, the gist above it is written not to contain the answer,
 * and the answer is not in the DOM until the reader asks for it.
 */
export function ClozeCard({
  cloze,
  onAnswered,
  onSettled,
  onRemoved,
  onEdited,
  where = 'sheet',
}: {
  cloze: Card
  /**
   * Answered — called on the press, before the server has been asked.
   *
   * The caller moves on at once: the next card, or the panel closing.
   * Nothing about answering is work the reader should be made to watch,
   * and a card that lingers while a request goes out invites a second
   * press on a question already answered.
   */
  onAnswered?: (cloze: Card, rating: Rating) => void
  /**
   * What the server made of it, once it has said.
   *
   * `cloze` is what the row should now be — the real one where the
   * write landed, the row as it stood before where it did not — and
   * `error` is the sentence to show when something is owed to the
   * reader. Both together mean *put it back and say so*.
   */
  onSettled?: (id: string, cloze: Card | null, error: string | null) => void
  onRemoved?: (id: string) => void
  onEdited?: (cloze: Card) => void
  /** `lesson` drops the "where this came from" line: you are there. */
  where?: 'sheet' | 'lesson'
}) {
  const [shown, setShown] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [confirming, setConfirming] = useState(false)

  const face = clozeFace(cloze)

  /**
   * What each answer would cost, before it is pressed.
   *
   * The scheduler is pure and shared, so the sheet can simply ask it
   * rather than wait to be told: the reader chooses between *three
   * days* and *two months* instead of between two adjectives. It is the
   * same arithmetic the server will run, from the same module, so the
   * figure printed on the button is the figure that lands.
   */
  const waits = useMemo(() => {
    const memory = memoryOf(cloze)
    return TENDING.map(rung => waitPhrase(review(memory, rung.rating).intervalDays))
  }, [cloze])

  /**
   * Answer, and be gone.
   *
   * The caller is told on the press and moves on there and then; the
   * writing happens behind the reader, the way keeping a mark does.
   * Answering a cloze is not work anyone is waiting on -- they have
   * made their judgement and want the next question -- and the wait the
   * answer buys was already printed on the button they pressed, so
   * there is nothing left to confirm afterwards.
   *
   * A failure is not silent, but nor does it drag the card back: the
   * schedule was never moved, so the cloze is still due and comes round
   * again on the next read. What is owed is a sentence saying so.
   */
  function answer(rating: Rating) {
    onAnswered?.(cloze, rating)

    void (async () => {
      const { ok, body, error: failed } = await api.clozes.review(cloze.id, rating)
      if (!ok) {
        onSettled?.(
          cloze.id,
          cloze,
          `${failed ?? 'That answer was not written down'}. It is still due, and will come round again.`
        )
        return
      }
      // Only once it has landed: the tally reads the server's own
      // count, and asking for it early would print the figure the
      // answer was meant to change.
      saidTended()
      onSettled?.(cloze.id, { ...cloze, ...body.cloze }, null)
    })()
  }

  async function remove() {
    setBusy(true)
    const { ok, error: failed } = await api.clozes.remove(cloze.id)
    setBusy(false)
    if (!ok) {
      setError(failed ?? 'That cloze was not pulled up.')
      return
    }
    saidTended()
    onRemoved?.(cloze.id)
  }

  if (editing) {
    return (
      <ClozeEditor
        cloze={cloze}
        onDone={next => {
          setEditing(false)
          if (next) onEdited?.(next)
        }}
        onSettled={onSettled}
      />
    )
  }

  return (
    <article className={styles.card} data-where={where} aria-label="A cloze">
      {cloze.concept && (
        <p className={styles.eyebrow}>
          {cloze.concept.name}
          {cloze.created_by === 'user' && <span className={styles.own}> · yours</span>}
        </p>
      )}
      {!cloze.concept && cloze.created_by === 'user' && (
        <p className={styles.eyebrow}>Your own</p>
      )}

      {cloze.concept?.gist && <p className={styles.gist}>{cloze.concept.gist}</p>}

      <p className={styles.passage} data-shown={shown || undefined}>
        {face.before}
        {face.blank ? (
          shown ? (
            <strong className={styles.answer}>{face.blank}</strong>
          ) : (
            <span
              className={styles.blank}
              /* Wide enough to be a word and never wide enough to be
                 the word: the length of a blank is a hint, and a hint
                 nobody asked for. */
              aria-label="the missing words"
            >
              {BLANK_MARK}
            </span>
          )
        ) : null}
        {face.after}
      </p>

      {cloze.hint && !shown && (
        <p className={styles.hint}>
          <span className={styles.hintLabel}>Nudge</span> {cloze.hint}
        </p>
      )}

      {error && <p className={styles.problem}>{error}</p>}

      {shown ? (
        <div className={styles.answerRow}>
          {TENDING.map((rung, i) => (
            <button
              key={rung.rating}
              type="button"
              className={styles.answerButton}
              data-rung={rung.rating}
              onClick={() => answer(rung.rating)}
              title={rung.note}
            >
              <span className={styles.answerLabel}>{rung.label}</span>
              <span className={styles.answerWait}>{waits[i]}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className={styles.answers}>
          <button
            type="button"
            className={styles.show}
            onClick={() => setShown(true)}
            disabled={busy}
          >
            Show it
          </button>
        </div>
      )}

      <div className={styles.quiet}>
        {confirming ? (
          <>
            <span className={styles.quietNote}>
              Pull this one up? Its answers go with it.
            </span>
            <button
              type="button"
              className={styles.quietAction}
              onClick={() => void remove()}
              disabled={busy}
            >
              Yes, pull it up
            </button>
            <button
              type="button"
              className={styles.quietAction}
              onClick={() => setConfirming(false)}
            >
              Leave it
            </button>
          </>
        ) : (
          <>
            {/* A cloze still being written down has nothing on the
                other end to edit or pull up yet. It is answerable --
                the question is right there -- and it can be changed in
                a moment. */}
            <button
              type="button"
              className={styles.quietAction}
              onClick={() => setEditing(true)}
              disabled={isUnsaved(cloze.id)}
            >
              Edit
            </button>
            <button
              type="button"
              className={styles.quietAction}
              onClick={() => setConfirming(true)}
              disabled={isUnsaved(cloze.id)}
            >
              Pull up
            </button>
            {where === 'sheet' && cloze.lesson && (
              <Link className={styles.quietLink} href={`/lesson/${cloze.lesson.id}`}>
                {cloze.lesson.title}
              </Link>
            )}
            {where === 'sheet' && cloze.topic && (
              <Link className={styles.quietLink} href={`/topics/${cloze.topic.id}`}>
                {cloze.topic.title}
              </Link>
            )}
          </>
        )}
      </div>
    </article>
  )
}

/**
 * Rewriting a cloze, and moving its blank.
 *
 * The blank is set by selecting inside the passage and pressing the
 * button, rather than by typing underscores into the text: a cloze is
 * a passage *and* a span inside it, and asking the reader to encode a
 * span in punctuation is asking them to do the parsing. Selecting what
 * should disappear is the thing itself.
 *
 * Editing never resets the schedule. The reader is correcting a card,
 * not declaring they have forgotten it, and its history is the only
 * evidence of what they hold.
 */
function ClozeEditor({
  cloze,
  onDone,
  onSettled,
}: {
  cloze: Card
  onDone: (next: Card | null) => void
  onSettled?: (id: string, cloze: Card | null, error: string | null) => void
}) {
  const [text, setText] = useState(cloze.text)
  const [blank, setBlank] = useState(cloze.blank)
  const [at, setAt] = useState(cloze.blank_start)
  const [hint, setHint] = useState(cloze.hint ?? '')
  const [error, setError] = useState<string | null>(null)
  const field = useRef<HTMLTextAreaElement>(null)

  /** Take the selection inside the passage as the new blank. */
  function blankTheSelection() {
    const box = field.current
    if (!box) return
    const from = box.selectionStart
    const to = box.selectionEnd
    if (from === to) {
      setError('Select the words to take out, then press this.')
      return
    }
    setBlank(text.slice(from, to))
    setAt(from)
    setError(null)
  }

  const problem = clozeProblem(text, blank, at)

  /**
   * Save, and close on the press.
   *
   * The edit is applied here from what the reader typed rather than
   * waited for: every field the card draws from is one of the four on
   * this form, so the row can be built locally and is right unless the
   * write fails. A form that sits there saying "Saving…" over an edit
   * the reader has finished making is the app asking them to supervise
   * its network.
   *
   * The prefix is the one field only the server can set -- it is
   * re-found against the lesson body -- so the real row replaces this
   * one when it arrives. A failure puts back the row as it stood.
   */
  function save() {
    if (problem) {
      setError(problem)
      return
    }

    const written = { text: text.trim(), blank, blankStart: at, hint: hint.trim() || null }
    onDone({
      ...cloze,
      text: written.text,
      blank,
      blank_start: at,
      blank_end: at + blank.length,
      hint: written.hint,
    })

    void (async () => {
      const { ok, body, error: failed } = await api.clozes.patch(cloze.id, written)
      if (!ok) {
        onSettled?.(cloze.id, cloze, `${failed ?? 'That edit was not saved'}. It is as it was.`)
        return
      }
      onSettled?.(cloze.id, body.cloze, null)
    })()
  }

  return (
    <article className={styles.card} aria-label="Rewriting a cloze">
      <p className={styles.eyebrow}>Rewriting</p>

      <label className={styles.label} htmlFor={`cloze-text-${cloze.id}`}>
        The passage
      </label>
      <textarea
        id={`cloze-text-${cloze.id}`}
        ref={field}
        className={styles.field}
        value={text}
        rows={4}
        onChange={e => setText(e.target.value)}
      />

      <div className={styles.editRow}>
        <button type="button" className={styles.quietAction} onClick={blankTheSelection}>
          Blank the selection
        </button>
        <span className={styles.blankNow}>
          {blank ? (
            <>
              Blanked: <strong>{blank}</strong>
            </>
          ) : (
            'Nothing blanked yet'
          )}
        </span>
      </div>

      <label className={styles.label} htmlFor={`cloze-hint-${cloze.id}`}>
        A nudge, if it needs one
      </label>
      <input
        id={`cloze-hint-${cloze.id}`}
        className={styles.field}
        value={hint}
        onChange={e => setHint(e.target.value)}
        placeholder="Optional"
      />

      {(error ?? problem) && <p className={styles.problem}>{error ?? problem}</p>}

      <div className={styles.answers}>
        <button
          type="button"
          className={styles.show}
          onClick={save}
          disabled={Boolean(problem)}
        >
          Save
        </button>
        <button type="button" className={styles.quietAction} onClick={() => onDone(null)}>
          Cancel
        </button>
      </div>
    </article>
  )
}
