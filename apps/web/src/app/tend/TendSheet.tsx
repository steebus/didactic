'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { didactic } from '@didactic/api'
import type { ClozeCard as Card } from '@didactic/core/clozes'
import { tendPhrase } from '@didactic/core/clozes'
import { ClozeCard } from '@/components/ClozeCard'
import { Setting } from '@/components/Setting'
import styles from './page.module.css'

const api = didactic()

/**
 * A sitting: one card, then the next, until there are none.
 *
 * The whole queue is read once and worked through here rather than a
 * card at a time from the server. A sitting is two minutes long and
 * forty cards is one small response; asking again between every card
 * would put a network round trip between the reader and the next
 * question, which is exactly where a round trip is most felt.
 *
 * An answered card leaves the queue and does not come back in this
 * sitting, even when the scheduler put it ten minutes out. Ten minutes
 * is the scheduler's way of saying *not now*; showing it again in the
 * same two minutes would be answering from short-term memory, which
 * teaches nothing and tells the schedule a lie.
 */
export function TendSheet({
  subjectId,
  topicId,
  lessonId,
  random,
}: {
  subjectId: string | null
  topicId: string | null
  lessonId: string | null
  random: boolean
}) {
  const [queue, setQueue] = useState<Card[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(0)
  const [drawing, setDrawing] = useState(false)

  const scope = {
    ...(subjectId ? { subjectId } : {}),
    ...(topicId ? { topicId } : {}),
    ...(lessonId ? { lessonId } : {}),
  }
  const narrowed = Boolean(subjectId || topicId || lessonId)
  // Held as a string so the read effect below depends on the scope's
  // value rather than on an object built fresh on every render.
  const key = JSON.stringify(scope)

  const draw = useCallback(async () => {
    setDrawing(true)
    setError(null)
    const { ok, body, error: failed } = await api.clozes.random(JSON.parse(key))
    setDrawing(false)
    if (!ok) {
      setError(failed ?? 'Could not draw one.')
      return
    }
    if (body.clozes.length === 0) {
      setError('There is nothing planted here yet. Work a lesson and it will fill.')
      return
    }
    setQueue(body.clozes)
  }, [key])

  useEffect(() => {
    let cancelled = false

    void (async () => {
      const reading = random
        ? api.clozes.random(JSON.parse(key))
        : api.clozes.due(JSON.parse(key))
      const { ok, body, error: failed } = await reading
      if (cancelled) return
      if (!ok) {
        setError(failed ?? 'Could not read the garden.')
        setQueue([])
        return
      }
      setQueue(body.clozes)
    })()

    return () => {
      cancelled = true
    }
  }, [key, random])

  /** Take the card off the front, whatever became of it. */
  const pass = useCallback(() => {
    setQueue(q => (q ? q.slice(1) : q))
  }, [])

  if (queue === null) {
    return <Setting label="Looking over the garden" shape="panel" />
  }

  const card = queue[0]

  if (!card) {
    return (
      <section className={styles.rest}>
        <h2 className={styles.restTitle}>
          {done > 0 ? 'That is the lot.' : 'Nothing is due.'}
        </h2>
        <p className={styles.restNote}>
          {done > 0
            ? `${done} ${done === 1 ? 'cloze' : 'clozes'} tended. The rest are not due yet — a
               thing asked for before you were going to forget it teaches nothing, which is
               the whole point of waiting.`
            : `Nothing is asking for you. Clozes are planted when you mark a lesson read or
               worked, and they come back on their own schedule.`}
        </p>
        {error && <p className={styles.problem}>{error}</p>}
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.action}
            onClick={() => void draw()}
            disabled={drawing}
          >
            {drawing ? 'Drawing…' : narrowed ? 'A random one from here' : 'A random one'}
          </button>
          {narrowed && (
            <Link className={styles.quietAction} href="/tend">
              Tend everything
            </Link>
          )}
          <Link className={styles.quietAction} href="/">
            Back to the stock list
          </Link>
        </div>
      </section>
    )
  }

  return (
    <>
      <div className={styles.standing}>
        <span className={styles.left}>
          {random ? 'One at random' : tendPhrase(queue.length)}
        </span>
        {done > 0 && <span className={styles.scope}>{done} tended</span>}
        {narrowed && (
          <Link className={styles.scopeLink} href="/tend">
            Tend everything
          </Link>
        )}
      </div>

      <ClozeCard
        // A new card is a new question: keyed so nothing of the last
        // one -- least of all whether its answer was showing -- is
        // carried into it.
        key={card.id}
        cloze={card}
        onAnswered={() => setDone(n => n + 1)}
        onNext={pass}
        onRemoved={pass}
        onEdited={next => setQueue(q => (q ? [next, ...q.slice(1)] : q))}
      />

      <div className={styles.tail}>
        <button type="button" className={styles.quietAction} onClick={pass}>
          Skip this one
        </button>
        <button
          type="button"
          className={styles.quietAction}
          onClick={() => void draw()}
          disabled={drawing}
        >
          {drawing ? 'Drawing…' : 'A random one instead'}
        </button>
        {error && <span className={styles.problem}>{error}</span>}
      </div>
    </>
  )
}
