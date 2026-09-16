'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { didactic } from '@didactic/api'
import type { ClozeCard as Card } from '@didactic/core/clozes'
import {
  KIND_LABEL,
  cardFront,
  cardsPhrase,
  isDue,
  shuffled,
} from '@didactic/core/clozes'
import { waitPhrase } from '@didactic/core/fsrs'
import { ClozeCard } from './ClozeCard'
import { useTendLesson } from './useTendLesson'
import styles from './TendLesson.module.css'

const api = didactic()

/**
 * Tend this lesson: the garden, at the foot of the reading it came from.
 *
 * The Tend sheet is the whole garden, and that is the right instrument
 * for the ordinary morning — everything due, in one sitting, shuffled,
 * without having to decide what to work on. What it cannot do is the
 * thing a reader wants the moment they finish reading something hard:
 * *ask me about this, now, and let me see what you decided to ask*.
 *
 * So this is three things in one small section, and deliberately not
 * more:
 *
 * - **a sitting** over this lesson's due cards, drawn shuffled and
 *   answered exactly as they would be on the Tend sheet, because it is
 *   literally the same card component and the same four rungs;
 * - **the deck**, listed, which is the only place in the app a reader
 *   can see everything that is being asked of them about one thing and
 *   fix it — a card they can see is wrong is a card they stop answering
 *   honestly, and until this there was nowhere to find one except by
 *   waiting for it to come round;
 * - **more cards**, which adds rather than replaces (046). Nothing
 *   standing is thrown away: the model is handed every question the
 *   lesson already asks and writes the ones it does not.
 *
 * The list is folded away by default and the sitting is not started
 * until it is asked for. A deck of thirty printed under every lesson is
 * a backlog on a page the reader came to for the prose, which is the
 * same reason the Tend sheet is one card and never a list.
 */
export function TendLesson({
  lessonId,
  title,
  /** Bumped by the sheet when a card is planted or pulled up in the
   *  reading, so the two views of one deck cannot disagree. */
  revision = 0,
}: {
  lessonId: string
  title: string
  revision?: number
}) {
  const [cards, setCards] = useState<Card[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** Which of the two is open. Never both: they are the same cards
   *  read two ways, and a sitting under its own inventory is noise. */
  const [open, setOpen] = useState<'none' | 'sitting' | 'list'>('none')
  const [queue, setQueue] = useState<Card[]>([])
  const [done, setDone] = useState(0)
  /** The card in the list the reader has opened to answer or fix. */
  const [reading, setReading] = useState<string | null>(null)
  const [writing, setWriting] = useState(false)
  const [said, setSaid] = useState<string | null>(null)

  const tend = useTendLesson()

  /**
   * The deck, read from the server.
   *
   * Written as a promise chain rather than as an awaited call inside
   * the effect, and the difference is not style: an `await` in an
   * effect body puts the first `setState` in the same synchronous pass
   * as the render that scheduled it, which is the cascading render
   * React warns about. The same shape the lesson sheet reads its own
   * cards in, for the same reason.
   */
  const read = useCallback(
    () =>
      api.clozes.inLesson(lessonId).then(({ ok, body, error: failed }) => {
        if (!ok) {
          setError(failed ?? 'The cards for this lesson could not be read.')
          setCards([])
          return
        }
        setError(null)
        setCards(body.clozes)
      }),
    [lessonId]
  )

  useEffect(() => {
    void read()
  }, [read, revision])

  const due = useMemo(() => (cards ?? []).filter(card => isDue(card)), [cards])
  /** When the soonest card that is not yet due is wanted, in words. */
  const soon = useMemo(() => nextUp(cards ?? []), [cards])

  /**
   * Start a sitting over this lesson.
   *
   * Shuffled, for the reason the Tend sheet's queue is: cards planted
   * together were read together, and answering them in that order is
   * answering each one with the last still in mind. Drawn from what is
   * in hand rather than asked for again — the whole deck is already
   * here, and a round trip between pressing the button and seeing the
   * first card is a round trip in the one place it is most felt.
   *
   * With nothing due, the whole deck is offered instead: a reader who
   * has just finished the prose and wants to be asked about it is not
   * asking the scheduler's permission, and answering early costs them
   * only the schedule they chose to skip.
   */
  function sit() {
    setQueue(shuffled(due.length > 0 ? due : (cards ?? [])))
    setDone(0)
    setOpen('sitting')
  }

  /** Read the lesson again for what it is not yet asking. */
  async function more() {
    setWriting(true)
    setSaid(null)
    const outcome = await tend({ id: lessonId, title }, true)
    setWriting(false)

    if (outcome.kind === 'done') {
      setSaid(outcome.made.warnings[0] ?? 'Read again.')
    } else if (outcome.kind === 'failed') {
      setSaid(outcome.reason || 'The lesson could not be read again.')
    }
    // Joined, done or failed: the deck may have moved either way, and
    // a list that disagrees with the database is worse than a wait.
    await read()
  }

  const card = queue[0]
  const standing = cards?.length ?? 0

  return (
    <section className={styles.garden} aria-label="Tend this lesson">
      <div className={styles.head}>
        <h2 className={styles.title}>Tend this lesson</h2>
        <p className={styles.standing}>
          {cards === null
            ? 'Looking…'
            : standing === 0
              ? 'Nothing planted here yet.'
              : due.length > 0
                ? `${cardsPhrase(standing)}, ${due.length} due`
                : `${cardsPhrase(standing)}, none due${soon ? ` — next in ${soon}` : ''}`}
        </p>
      </div>

      {error && <p className={styles.problem}>{error}</p>}

      <div className={styles.actions}>
        {standing > 0 && (
          <button
            type="button"
            className={styles.action}
            onClick={() => (open === 'sitting' ? setOpen('none') : sit())}
          >
            {open === 'sitting'
              ? 'Put them away'
              : due.length > 0
                ? `Tend ${due.length === standing ? 'these' : `the ${due.length} due`}`
                : 'Turn one over anyway'}
          </button>
        )}

        {standing > 0 && (
          <button
            type="button"
            className={styles.quietAction}
            onClick={() => setOpen(o => (o === 'list' ? 'none' : 'list'))}
          >
            {open === 'list' ? 'Close the list' : `All ${cardsPhrase(standing)}`}
          </button>
        )}

        {/* Additive, and the wording says so. "Regenerate" was the old
            word and the old behaviour, and both were wrong: it threw
            away the review history of every card it replaced. */}
        <button
          type="button"
          className={styles.quietAction}
          onClick={() => void more()}
          disabled={writing}
        >
          {writing
            ? 'Reading it again…'
            : standing === 0
              ? 'Write some cards'
              : 'Write some more'}
        </button>

        {standing > 0 && (
          <Link className={styles.quietLink} href={`/tend?lesson=${lessonId}`}>
            On its own sheet
          </Link>
        )}
      </div>

      {said && (
        <p className={styles.said} role="status">
          {said}
        </p>
      )}

      {open === 'sitting' &&
        (card ? (
          <div className={styles.sitting}>
            <ClozeCard
              // A new card is a new question: keyed so nothing of the
              // last one — least of all whether its answer was showing
              // — is carried into it.
              key={card.id}
              cloze={card}
              where="lesson"
              onAnswered={() => {
                setDone(n => n + 1)
                setQueue(q => q.slice(1))
              }}
              onRemoved={id => {
                setQueue(q => q.filter(c => c.id !== id))
                setCards(c => (c ?? []).filter(x => x.id !== id))
              }}
              onEdited={next => {
                setQueue(q => [next, ...q.slice(1)])
                setCards(c => (c ?? []).map(x => (x.id === next.id ? next : x)))
              }}
              onSettled={(id, settled, failed) => {
                if (failed) setSaid(failed)
                if (settled) setCards(c => (c ?? []).map(x => (x.id === id ? settled : x)))
              }}
            />
            <p className={styles.left}>
              {queue.length - 1 > 0
                ? `${queue.length - 1} more in this sitting`
                : 'Last one'}
            </p>
          </div>
        ) : (
          <p className={styles.rest}>
            {done > 0
              ? `${cardsPhrase(done)} tended. They come back on their own schedule.`
              : 'Nothing to turn over here.'}
          </p>
        ))}

      {open === 'list' && cards && (
        <ul className={styles.list}>
          {cards.map(entry => (
            <li key={entry.id} className={styles.row} data-open={entry.id === reading || undefined}>
              {entry.id === reading ? (
                /* The whole card, which is where Edit and Pull up already
                   live. A second set of controls written into this list
                   would be a second set that could come to disagree with
                   the first about what pulling a card up means. */
                <ClozeCard
                  cloze={entry}
                  where="lesson"
                  onAnswered={() => setReading(null)}
                  onRemoved={id => {
                    setReading(null)
                    setCards(c => (c ?? []).filter(x => x.id !== id))
                  }}
                  onEdited={next =>
                    setCards(c => (c ?? []).map(x => (x.id === next.id ? next : x)))
                  }
                  onSettled={(id, settled, failed) => {
                    if (failed) setSaid(failed)
                    if (settled) setCards(c => (c ?? []).map(x => (x.id === id ? settled : x)))
                  }}
                />
              ) : (
                <button
                  type="button"
                  className={styles.rowFace}
                  onClick={() => setReading(entry.id)}
                >
                  <span className={styles.rowKind}>{KIND_LABEL[entry.kind ?? 'cloze']}</span>
                  {/* The front, with the blank drawn as a short rule
                      rather than the word: a list of a lesson's cards
                      that printed every answer would be a list nobody
                      could read without being taught by it. */}
                  <span className={styles.rowFront}>{cardFront(entry, '————')}</span>
                  <span className={styles.rowWhen}>
                    {isDue(entry) ? 'due' : waitPhrase(daysUntil(entry.due))}
                  </span>
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** How long until the soonest card that is not yet due, in words. */
function nextUp(cards: Card[]): string | null {
  const waiting = cards
    .filter(card => !isDue(card))
    .map(card => daysUntil(card.due))
    .sort((a, b) => a - b)
  return waiting.length > 0 ? waitPhrase(waiting[0]) : null
}

/** Days from now until an instant, as the scheduler counts them. */
const daysUntil = (due: string) =>
  Math.max(0, (new Date(due).getTime() - Date.now()) / 86_400_000)
