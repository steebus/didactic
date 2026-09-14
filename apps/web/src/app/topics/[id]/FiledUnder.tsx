'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { didactic } from '@didactic/api'
import type { Subject } from '@didactic/core/types'
import styles from './page.module.css'

const api = didactic()

interface Filed {
  id: string
  title: string
  colour?: string | null
}

/**
 * Where a topic is filed, and moving it.
 *
 * A topic belongs to every subject it genuinely sits under — exposure is
 * needed by portrait photography and by landscape photography, and
 * JavaScript by front-end and by app development. The schema has said so
 * since `012`; the sheets never did. A topic could be typed into a bed
 * by name and taken out of one from the bed's own edit mode, and that
 * was the whole vocabulary: to move one you retyped its name somewhere
 * else and hoped the resolver landed on the same row, which it does not
 * always do.
 *
 * So the filing is stated here, on the topic itself, where the question
 * is actually asked — and the three things you can do to it are three
 * things rather than a side effect of typing:
 *
 * - **file it here too**, which adds a subject and keeps the rest;
 * - **move it here**, which is the same write followed by taking it out
 *   of the others, in that order so a failure leaves it filed somewhere
 *   rather than nowhere;
 * - **take it out**, which unfiles without destroying anything the topic
 *   holds — a topic filed nowhere is loose stock, not a deletion.
 *
 * Filing places, too. A topic arriving in a bed with no edges into it
 * prints as one more root at the foot of the outline and floats beside
 * everything it belongs to on the graph, so the route sorts it into the
 * bed exactly as it sorts a newly sown one. That is a model call, which
 * is why this says it is thinking rather than pretending to be instant.
 */
export function FiledUnder({
  topicId,
  topicTitle,
  subjects,
  primarySubjectId,
}: {
  topicId: string
  topicTitle: string
  subjects: Filed[]
  /** The topic's home: what the graph colours it by, and what it falls
   *  back to when it is filed nowhere else. */
  primarySubjectId: string | null
}) {
  const [open, setOpen] = useState(false)
  const [all, setAll] = useState<Subject[] | null>(null)
  const [chosen, setChosen] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [, startTransition] = useTransition()
  const router = useRouter()

  /** The stock list, read once the reader asks to file rather than on
   *  every topic sheet: most visits never open this. */
  async function openFiling() {
    setOpen(true)
    if (all) return
    const { ok, body, error: failed } = await api.subjects.list()
    if (ok) setAll(body.subjects)
    else setError(failed ?? 'Could not read the subjects.')
  }

  const elsewhere = (all ?? []).filter(s => !subjects.some(filed => filed.id === s.id))

  async function fileIt(move: boolean) {
    const subject = elsewhere.find(s => s.id === chosen)
    if (!subject) return

    setBusy(move ? 'move' : 'file')
    setError(null)
    setNote(null)

    // Filed first, and only then taken out of the old beds. The other
    // order has a window in which the topic is filed nowhere, and a
    // request that fails inside it leaves it there.
    const { ok, body, error: failed } = await api.subjects.fileTopic(subject.id, topicId)
    if (!ok) {
      setError(failed ?? 'Could not file it there.')
      setBusy(null)
      return
    }

    const left: string[] = []
    if (move) {
      for (const old of subjects) {
        const { ok: out } = await api.subjects.removeTopic(old.id, topicId)
        if (out) left.push(old.title)
        else setError(`Filed under ${subject.title}, but it could not be taken out of ${old.title}.`)
      }
    }

    const placed = body.placed ?? 0
    setNote(
      [
        body.action === 'already-filed'
          ? `"${topicTitle}" is already filed under ${subject.title}.`
          : left.length > 0
            ? `Moved to ${subject.title}, out of ${left.join(' and ')}.`
            : `Also filed under ${subject.title}.`,
        placed > 0
          ? `Related to ${placed} ${placed === 1 ? 'topic' : 'topics'} there.`
          : '',
        ...(body.warnings ?? []),
      ].filter(Boolean).join(' ')
    )
    setChosen('')
    startTransition(() => router.refresh())
    setBusy(null)
  }

  async function takeOut(subject: Filed) {
    setBusy(subject.id)
    setError(null)
    setNote(null)

    const { ok, body, error: failed } = await api.subjects.removeTopic(subject.id, topicId)
    if (ok) {
      setNote(
        body.loose
          ? `Out of ${subject.title}. It keeps everything filed against it and is now loose stock — file it somewhere to put it back on a bed.`
          : `Out of ${subject.title}. It is still filed under the others it sits in.`
      )
      startTransition(() => router.refresh())
    } else {
      setError(failed ?? 'Could not take it out.')
    }
    setBusy(null)
  }

  /** Which subject the graph colours it by. A topic in three subjects
   *  still has to be drawn in one ink. */
  async function makeHome(subject: Filed) {
    setBusy(`home-${subject.id}`)
    setError(null)
    setNote(null)

    const { ok, error: failed } = await api.topics.patch(topicId, {
      primary_subject_id: subject.id,
    })
    if (ok) {
      setNote(`${subject.title} is its home now — that is the ink the graph draws it in.`)
      startTransition(() => router.refresh())
    } else {
      setError(failed ?? 'Could not change its home.')
    }
    setBusy(null)
  }

  return (
    <section className={styles.block}>
      <h2 className={styles.blockTitle}>Filed under</h2>

      {subjects.length === 0 ? (
        <p className={styles.empty}>
          Loose stock — this topic sits on no bed. It keeps everything filed
          against it; file it below to put it back on one.
        </p>
      ) : (
        <ul className={styles.filing}>
          {subjects.map(subject => (
            <li key={subject.id} className={styles.filingRow}>
              <span className={styles.filingName}>
                <Link href={`/subjects/${subject.id}`}>{subject.title}</Link>
                {subject.id === primarySubjectId && (
                  <span className={styles.filingHome}>home</span>
                )}
              </span>
              <span className={styles.filingActions}>
                {subject.id !== primarySubjectId && (
                  <button
                    type="button"
                    className={styles.quiet}
                    onClick={() => makeHome(subject)}
                    disabled={busy !== null}
                  >
                    Make home
                  </button>
                )}
                <button
                  type="button"
                  className={`${styles.quiet} ${styles.destructive}`}
                  onClick={() => takeOut(subject)}
                  disabled={busy !== null}
                  aria-label={`Take ${topicTitle} out of ${subject.title}`}
                >
                  {busy === subject.id ? 'Taking out…' : 'Take out'}
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* A topic sitting in several subjects is the ordinary case rather
          than an oddity, and the sheet says so where someone is about to
          ask. */}
      <p className={styles.blockNote}>
        A topic sits under every subject it genuinely belongs to, not just the
        one it was entered through.
      </p>

      {!open ? (
        <button type="button" className={styles.action} onClick={openFiling}>
          File it elsewhere
        </button>
      ) : (
        <div className={styles.filingForm}>
          <label className={styles.filingLabel} htmlFor="file-under">
            Another subject
          </label>
          <select
            id="file-under"
            className={styles.filingSelect}
            value={chosen}
            onChange={e => setChosen(e.target.value)}
            disabled={all === null || busy !== null}
          >
            <option value="">
              {all === null
                ? 'Reading the stock list…'
                : elsewhere.length === 0
                  ? 'It is already in every subject'
                  : 'Choose one'}
            </option>
            {elsewhere.map(subject => (
              <option key={subject.id} value={subject.id}>
                {subject.title}
              </option>
            ))}
          </select>

          <div className={styles.filingButtons}>
            <button
              type="button"
              className={styles.filingAction}
              onClick={() => fileIt(false)}
              disabled={!chosen || busy !== null}
            >
              {busy === 'file' ? 'Filing…' : 'File it here too'}
            </button>
            {subjects.length > 0 && (
              <button
                type="button"
                className={styles.filingAction}
                onClick={() => fileIt(true)}
                disabled={!chosen || busy !== null}
              >
                {busy === 'move' ? 'Moving…' : 'Move it here'}
              </button>
            )}
          </div>
          <p className={styles.blockNote}>
            {subjects.length > 1
              ? 'Moving takes it out of all the beds it currently sits in. Filing it leaves those as they are.'
              : 'Moving takes it out of the bed it is in now. Filing it leaves that one as it is.'}{' '}
            Either way it keeps its lessons, marks and history, and is placed
            against what is already in the new bed — which takes a moment.
          </p>
        </div>
      )}

      {note && <p className={styles.filingNote}>{note}</p>}
      {error && <p className={styles.filingProblem}>{error}</p>}
    </section>
  )
}
