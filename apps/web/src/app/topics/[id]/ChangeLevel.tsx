'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { didactic } from '@didactic/api'
import type { Suggestion } from '@didactic/core/mentionSearch'
import type { TopicEvidence } from '@didactic/core/shapes'
import { holdings } from '@didactic/core/adjudication'
import styles from './page.module.css'

const api = didactic()

/**
 * A topic is sometimes the wrong size.
 *
 * Ingestion files what it reads at one level and cannot know which of
 * those is a bed you will spend a year in and which is a paragraph
 * inside something else. "Economic history" arrives as a topic beside
 * "Defensive vs Enterprising Investor"; one is a subject and the other
 * is a lesson. Until now the only remedies were merging two topics or
 * grubbing one out, and neither changes what level a thing sits at.
 *
 * Both moves are refused while the topic carries a route, and the gate
 * is in the database (`044`) rather than here: a curriculum is a plan
 * someone approved and is working, with lessons written and completed
 * against it, and rehoming that is a different and much larger
 * operation. This block says so rather than hiding the controls, since
 * "why can I not do this" is the question a hidden control provokes.
 *
 * Promoting is additive and reversible. Demoting is not, so it is two
 * presses and the second is only offered once the sheet can say what
 * the first would move — the same shape as grubbing out a bed.
 */
export function ChangeLevel({
  topicId,
  topicTitle,
  hasRoute,
  routeId,
  evidence,
}: {
  topicId: string
  topicTitle: string
  /** Whether a curriculum runs through it. */
  hasRoute: boolean
  /** The route, so the refusal can point at the thing it names. */
  routeId: string | null
  /** What a demote would carry onto the target, for the reckoning. */
  evidence: TopicEvidence
}) {
  const [mode, setMode] = useState<'shut' | 'promote' | 'demote'>('shut')
  const [term, setTerm] = useState('')
  const [found, setFound] = useState<Suggestion[]>([])
  const [target, setTarget] = useState<Suggestion | null>(null)
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  if (hasRoute) {
    return (
      <section className={styles.block}>
        <h2 className={styles.blockTitle}>Its level</h2>
        <p className={styles.blockNote}>
          This topic carries a route, so it cannot be made a subject or folded
          into another topic. A route is a plan you approved and are working,
          with lessons written against it.{' '}
          {routeId && (
            <>
              Archive or delete{' '}
              <Link href={`/curriculum/${routeId}`} className={styles.inlineLink}>
                the route
              </Link>{' '}
              first.
            </>
          )}
        </p>
      </section>
    )
  }

  /** Topics only. A lesson is not somewhere a topic can be folded into:
   *  what a demote writes *is* a lesson, and it needs a route to join. */
  async function look(q: string) {
    setTerm(q)
    setTarget(null)
    const { ok, body } = await api.mentions.search(q)
    if (ok) setFound(body.suggestions.filter(s => s.kind === 'topic' && s.id !== topicId))
  }

  async function promote() {
    setBusy(true)
    setError(null)
    setNote(null)

    const { ok, body, error: failed } = await api.topics.promote(topicId)
    if (!ok) {
      setError(failed ?? 'Could not promote it.')
      setBusy(false)
      return
    }

    // Straight to the bed it just became. The sheet the reader was on is
    // still there, but the thing they made is the thing to look at.
    router.push(`/subjects/${body.subjectId}`)
    router.refresh()
  }

  async function demote() {
    if (!target) return
    setBusy(true)
    setError(null)
    setNote(null)

    const { ok, body, error: failed } = await api.topics.demote(topicId, target.id)
    if (!ok) {
      setError(failed ?? 'Could not fold it in.')
      setBusy(false)
      return
    }

    // This sheet no longer exists: the topic row is gone and its name is
    // a lesson in the route it joined.
    router.push(`/topics/${body.intoTopicId}`)
    router.refresh()
  }

  return (
    <section className={styles.block}>
      <h2 className={styles.blockTitle}>Its level</h2>

      {mode === 'shut' && (
        <>
          <p className={styles.blockNote}>
            A topic that turned out to be a whole field can become a subject; one
            that turned out to be a paragraph can be folded into another topic as
            a lesson.
          </p>
          <div className={styles.filingButtons}>
            <button
              type="button"
              className={styles.filingAction}
              onClick={() => setMode('promote')}
            >
              Make it a subject
            </button>
            <button
              type="button"
              className={styles.filingAction}
              onClick={() => setMode('demote')}
            >
              Fold it into a topic
            </button>
          </div>
        </>
      )}

      {mode === 'promote' && (
        <>
          <p className={styles.blockNote}>
            Creates a subject called <strong>{topicTitle}</strong> and files this
            topic there, along with everything sitting under it in the outline.
            It keeps every subject it is already in — take it out of those
            separately if it should no longer sit in them.
          </p>
          <p className={styles.blockNote}>
            The topic itself stays, because it can be carrying a reading log and
            a subject is not something you can have read. You will see the name
            twice until you fold or rename it.
          </p>
          <div className={styles.filingButtons}>
            <button
              type="button"
              className={styles.filingAction}
              onClick={promote}
              disabled={busy}
            >
              {busy ? 'Promoting…' : 'Make it a subject'}
            </button>
            <button
              type="button"
              className={styles.quiet}
              onClick={() => setMode('shut')}
              disabled={busy}
            >
              Cancel
            </button>
          </div>
        </>
      )}

      {mode === 'demote' && (
        <>
          <label className={styles.filingLabel} htmlFor="demote-into">
            Fold it into
          </label>
          <input
            id="demote-into"
            className={styles.filingSelect}
            value={target ? target.title : term}
            onChange={e => look(e.target.value)}
            placeholder="Start typing a topic"
            autoComplete="off"
          />

          {!target && found.length > 0 && (
            <ul className={styles.suggestions}>
              {found.map(s => (
                <li key={s.id}>
                  <button
                    type="button"
                    className={styles.suggestion}
                    onClick={() => setTarget(s)}
                  >
                    {s.title}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {target && (
            <>
              {/* The reckoning. A demote cannot be undone, so the second
                  press is only offered once the sheet can say what the
                  first would move. */}
              <p className={styles.reckoning}>
                <strong>{topicTitle}</strong> becomes a lesson in{' '}
                <strong>{target.title}</strong>’s route. Everything it holds —{' '}
                {holdings(evidence).toLowerCase()} — moves onto{' '}
                {target.title} first, so nothing is lost but the name, and the
                name becomes the lesson’s title. This topic is then removed.
              </p>
              <p className={styles.blockNote}>This cannot be undone.</p>
            </>
          )}

          <div className={styles.filingButtons}>
            <button
              type="button"
              className={styles.filingAction}
              onClick={demote}
              disabled={!target || busy}
            >
              {busy ? 'Folding it in…' : 'Fold it in'}
            </button>
            <button
              type="button"
              className={styles.quiet}
              onClick={() => {
                setMode('shut')
                setTarget(null)
                setTerm('')
              }}
              disabled={busy}
            >
              Cancel
            </button>
          </div>
        </>
      )}

      {note && <p className={styles.filingNote}>{note}</p>}
      {error && <p className={styles.filingProblem}>{error}</p>}
    </section>
  )
}
