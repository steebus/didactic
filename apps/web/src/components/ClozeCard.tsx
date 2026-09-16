'use client'

import { useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { didactic } from '@didactic/api'
import type { ClozeCard as Card } from '@didactic/core/clozes'
import {
  BLANK_MARK,
  FALSE_WORD,
  KIND_LABEL,
  TENDING,
  TRUE_WORD,
  cardProblem,
  cardTruth,
  clozeFace,
  clozeProblem,
  memoryOf,
} from '@didactic/core/clozes'
import { isUnsaved } from '@didactic/core/marks'
import { review, waitPhrase, type Rating } from '@didactic/core/fsrs'
import { Rich } from './Rich'
import { saidTended } from './TendTally'
import styles from './ClozeCard.module.css'

const api = didactic()

/**
 * One card, face down and then face up.
 *
 * The same card wherever it is met: on the Tend sheet, where they come
 * one after another; in the lesson, where pressing a plum passage opens
 * the card that was written from it; and in "Tend this lesson" at the
 * foot of the reading. Several renderings of a flashcard would be
 * several sets of answer buttons that could come to mean different
 * things, which is the one thing a scheduler cannot survive.
 *
 * Three shapes since 046, and the branch is deliberately shallow: what
 * differs between them is the **front** and the **back**, and nothing
 * else. The eyebrow, the nudge, *Show it*, the four rungs and
 * the quiet row underneath are the same furniture around all three, so
 * a reader meeting a true-or-false after a cloze is meeting a different
 * question and not a different instrument.
 *
 * A new card is a new question, so every caller keys this on the card's
 * id: the state that matters here is whether the answer is showing, and
 * carrying that from one card to the next would hand the reader the
 * next answer before they had read the question. A key is the right
 * instrument for that -- resetting five pieces of state in an effect is
 * the same thing said worse, and a render later.
 *
 * What a card must never do is give the answer away before it is asked
 * for, and everything face-down here is arranged around that. The blank
 * is a rule of the right length rather than the word greyed out. A
 * true-or-false prints no verdict until it is turned over. The
 * concept's gist is on the **back** (047) -- it belongs to a concept
 * carrying two to four cards, so no one sentence can be written to
 * avoid all their answers, and it handed one over often enough to be a
 * bug rather than an accident. None of the back is in the DOM until the
 * reader asks for it.
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

  const kind = cloze.kind ?? 'cloze'
  const face = clozeFace(cloze)
  const truth = cardTruth(cloze)

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
   * Answering a card is not work anyone is waiting on -- they have made
   * their judgement and want the next question -- and the wait the
   * answer buys was already printed on the button they pressed, so
   * there is nothing left to confirm afterwards.
   *
   * A failure is not silent, but nor does it drag the card back: the
   * schedule was never moved, so the card is still due and comes round
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
      setError(failed ?? 'That card was not pulled up.')
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
    <article
      className={styles.card}
      data-where={where}
      data-kind={kind}
      aria-label={KIND_LABEL[kind]}
    >
      <p className={styles.eyebrow}>
        {/* Which of the three this is, always and first: a reader about
            to answer needs to know whether they are recalling a word,
            producing a definition or judging a claim, and finding out
            from the shape of the sentence is a beat of confusion at
            exactly the wrong moment. */}
        <span className={styles.kind}>{KIND_LABEL[kind]}</span>
        {cloze.concept && <span className={styles.concept}>{cloze.concept.name}</span>}
        {cloze.created_by === 'user' && <span className={styles.own}>yours</span>}
      </p>

      {kind === 'cloze' ? (
        /* The passage in three pieces, each formatted in its own right.
           A card carries the lesson's emphasis and the lesson's
           notation -- printed raw, a card about an equation asks about
           a row of dollar signs.

           Rendering the pieces apart rather than the passage whole is
           what the blank makes necessary, and it is also why a blank
           may not be put inside a formula: half an equation either side
           of a hole is two broken formulas. `clozeProblem` refuses
           that. */
        <p className={styles.passage} data-shown={shown || undefined}>
          <Rich text={face.before} />
          {face.blank ? (
            shown ? (
              <Rich className={styles.answer} text={face.blank} />
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
          <Rich text={face.after} />
        </p>
      ) : (
        <Rich as="p" className={styles.passage} text={cloze.question ?? ''} />
      )}

      {/* The back, and nothing of it in the document until it is asked
          for. A true-or-false prints its verdict as a verdict rather
          than as a sentence -- it is the one answer in the app that is a
          single word, and burying it in prose would make the reader hunt
          for what they already half know.

          The gist is here rather than above the question, and that is
          the correction 047 makes. It was printed face up, on the
          reasoning that an answer should be recalled from something
          rather than guessed from nothing -- but a gist belongs to the
          *concept*, and a concept carries two to four cards. One
          sentence cannot be written to avoid the answer to all of them,
          so sooner or later it hands one over: "Jank is a stutter that
          happens when the work needed to produce a frame overruns the
          ~16.7ms budget", above a card asking what the frame budget is.

          Printing it only when it happens not to leak would be worse,
          not better. Absence is information: a reader who notices the
          gist missing has been told the answer is in the gist-shaped
          sentence they are not being shown. So it moves for every card,
          always, and becomes what it is actually good at -- the lesson's
          own words about the concept, read once the answer is in. What
          orients the reader beforehand is the concept's name in the
          eyebrow, which is a heading rather than a sentence. */}
      {shown && (kind !== 'cloze' || cloze.concept?.gist || cloze.note) && (
        <div className={styles.back}>
          {kind === 'truefalse' ? (
            <p className={styles.verdict} data-truth={truth === null ? undefined : String(truth)}>
              {truth === null ? cloze.answer : truth ? TRUE_WORD : FALSE_WORD}
            </p>
          ) : kind === 'qa' ? (
            <Rich as="p" className={styles.answerLine} text={cloze.answer ?? ''} />
          ) : null}
          {cloze.note && <Rich as="p" className={styles.note} text={cloze.note} />}
          {cloze.concept?.gist && (
            <Rich as="p" className={styles.gist} text={cloze.concept.gist} />
          )}
        </div>
      )}

      {cloze.hint && !shown && (
        <p className={styles.hint}>
          <span className={styles.hintLabel}>Nudge</span> <Rich text={cloze.hint} />
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
            {/* A card still being written down has nothing on the other
                end to edit or pull up yet. It is answerable -- the
                question is right there -- and it can be changed in a
                moment. */}
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
 * Rewriting a card.
 *
 * Two forms in one, because the three kinds are two shapes: a passage
 * with a span inside it, and a front with a back. A cloze's blank is
 * set by selecting inside the passage and pressing the button, rather
 * than by typing underscores into the text -- a cloze is a passage
 * *and* a span inside it, and asking the reader to encode a span in
 * punctuation is asking them to do the parsing. Selecting what should
 * disappear is the thing itself.
 *
 * The kind is not one of the fields. A question is not a passage with a
 * hole in it, and the row the two of them would share is one the
 * database refuses; the server ignores a kind sent here for the same
 * reason. A card that should have been the other shape is pulled up and
 * written again, which is two presses and no ambiguity.
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
  const kind = cloze.kind ?? 'cloze'
  const [text, setText] = useState(cloze.text ?? '')
  const [blank, setBlank] = useState(cloze.blank ?? '')
  const [at, setAt] = useState(cloze.blank_start ?? 0)
  const [question, setQuestion] = useState(cloze.question ?? '')
  const [answer, setAnswer] = useState(cloze.answer ?? '')
  const [note, setNote] = useState(cloze.note ?? '')
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

  /* The same judgement the server will make, from the same function in
     the shared package, so the form cannot come to disagree with the
     route about what a card is. */
  const problem =
    kind === 'cloze'
      ? clozeProblem(text, blank, at)
      : cardProblem({
          kind,
          text: null,
          blank: null,
          blank_start: null,
          blank_end: null,
          question,
          answer,
          note: note.trim() || null,
          anchor: cloze.anchor,
        })

  /**
   * Save, and close on the press.
   *
   * The edit is applied here from what the reader typed rather than
   * waited for: every field the card draws from is one of the few on
   * this form, so the row can be built locally and is right unless the
   * write fails. A form that sits there saying "Saving…" over an edit
   * the reader has finished making is the app asking them to supervise
   * its network.
   *
   * The prefix and the anchor are the fields only the server can
   * settle -- they are re-found against the lesson body -- so the real
   * row replaces this one when it arrives. A failure puts back the row
   * as it stood.
   */
  function save() {
    if (problem) {
      setError(problem)
      return
    }

    const written =
      kind === 'cloze'
        ? { text: text.trim(), blank, blankStart: at, hint: hint.trim() || null }
        : {
            question: question.trim(),
            answer: answer.trim(),
            note: note.trim() || null,
            hint: hint.trim() || null,
          }

    onDone({
      ...cloze,
      ...(kind === 'cloze'
        ? {
            text: text.trim(),
            blank,
            blank_start: at,
            blank_end: at + blank.length,
          }
        : {
            question: question.trim(),
            answer: answer.trim(),
            note: note.trim() || null,
          }),
      hint: hint.trim() || null,
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
    <article className={styles.card} aria-label="Rewriting a card">
      <p className={styles.eyebrow}>
        <span className={styles.kind}>Rewriting</span>
        <span className={styles.concept}>{KIND_LABEL[kind]}</span>
      </p>

      {kind === 'cloze' ? (
        <>
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
        </>
      ) : (
        <>
          <label className={styles.label} htmlFor={`card-question-${cloze.id}`}>
            {kind === 'truefalse' ? 'The statement' : 'The question'}
          </label>
          <textarea
            id={`card-question-${cloze.id}`}
            className={styles.field}
            value={question}
            rows={3}
            onChange={e => setQuestion(e.target.value)}
          />

          <label className={styles.label} htmlFor={`card-answer-${cloze.id}`}>
            {kind === 'truefalse' ? 'Does it hold?' : 'The answer'}
          </label>
          {kind === 'truefalse' ? (
            <div className={styles.verdictRow}>
              {[TRUE_WORD, FALSE_WORD].map(word => (
                <button
                  key={word}
                  type="button"
                  className={styles.verdictPick}
                  data-picked={answer.trim() === word || undefined}
                  onClick={() => setAnswer(word)}
                >
                  {word}
                </button>
              ))}
            </div>
          ) : (
            <textarea
              id={`card-answer-${cloze.id}`}
              className={styles.field}
              value={answer}
              rows={2}
              onChange={e => setAnswer(e.target.value)}
            />
          )}

          {/* Required on a true-or-false, and the reason is in the
              label: a statement judged false with no correction leaves
              the reader knowing they were wrong and not what is right. */}
          <label className={styles.label} htmlFor={`card-note-${cloze.id}`}>
            {kind === 'truefalse' ? 'Why, in one line' : 'A line of context, if it helps'}
          </label>
          <input
            id={`card-note-${cloze.id}`}
            className={styles.field}
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder={kind === 'truefalse' ? 'Shown with the answer' : 'Optional'}
          />
        </>
      )}

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
