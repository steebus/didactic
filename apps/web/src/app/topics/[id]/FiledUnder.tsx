'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { didactic } from '@didactic/api'
import type { Subject } from '@didactic/core/types'
import type { LooseClaim } from '@didactic/core/shapes'
import { WhereItLooks } from '@/components/WhereItLooks'
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
 * bed exactly as it sorts a newly sown one.
 *
 * That placement is a model call over the whole bed, so the answer is
 * seconds away — and the decision was made when the button was pressed.
 * The filing is therefore shown at once and reconciled behind, the way
 * the adjudication queue drops a decided row: the subject appears in the
 * list immediately, marked as still settling, and the reader can leave.
 * A failure puts the list back as it was and says what went wrong,
 * because a sheet that quietly loses a decision is worse than a slow
 * one.
 */
export function FiledUnder({
  topicId,
  topicTitle,
  subjects,
  primarySubjectId,
  nearby,
}: {
  topicId: string
  topicTitle: string
  subjects: Filed[]
  /** The topic's home: what the graph colours it by, and what it falls
   *  back to when it is filed nowhere else. */
  primarySubjectId: string | null
  /** Where the bed says it goes, for a topic sitting on no bed. */
  nearby: LooseClaim[]
}) {
  const [open, setOpen] = useState(false)
  const [all, setAll] = useState<Subject[] | null>(null)
  const [chosen, setChosen] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  /**
   * The filing as this reader has left it, ahead of the server.
   *
   * `settling` is what has been filed but not yet placed; `gone` is what
   * has been taken out. Both are cleared by the refresh that follows,
   * and both are put back on a failure.
   */
  const [settling, setSettling] = useState<Filed[]>([])
  const [gone, setGone] = useState<string[]>([])
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

  // What the block prints: the server's answer, plus what this reader
  // has just done to it and the server has not caught up with.
  const here = [...subjects.filter(s => !gone.includes(s.id)), ...settling]
    .filter((s, i, all) => all.findIndex(o => o.id === s.id) === i)

  const elsewhere = (all ?? []).filter(s => !here.some(filed => filed.id === s.id))

  async function fileIt(move: boolean) {
    const subject = elsewhere.find(s => s.id === chosen)
    if (!subject) return

    // Shown before it is saved. The placement behind this is a model
    // call over the whole bed, and waiting on it would hold the reader
    // at a sheet whose decision they have already made.
    const leaving = move ? here.map(s => s.id) : []
    setSettling(rows => [...rows, { id: subject.id, title: subject.title }])
    setGone(ids => [...ids, ...leaving])
    setChosen('')
    setError(null)
    setNote(
      move && here.length > 0
        ? `Moving to ${subject.title}, out of ${here.map(s => s.title).join(' and ')}…`
        : `Filing under ${subject.title}…`
    )

    const undo = () => {
      setSettling(rows => rows.filter(r => r.id !== subject.id))
      setGone(ids => ids.filter(id => !leaving.includes(id)))
      setNote(null)
    }

    setBusy(move ? 'move' : 'file')

    // Filed first, and only then taken out of the old beds. The other
    // order has a window in which the topic is filed nowhere, and a
    // request that fails inside it leaves it there.
    const { ok, body, error: failed } = await api.subjects.fileTopic(subject.id, topicId)
    if (!ok) {
      undo()
      setError(failed ?? 'Could not file it there.')
      setBusy(null)
      return
    }

    const left: string[] = []
    if (move) {
      for (const old of subjects.filter(s => leaving.includes(s.id))) {
        const { ok: out } = await api.subjects.removeTopic(old.id, topicId)
        if (out) {
          left.push(old.title)
        } else {
          // It is filed in the new bed and still in the old one. Put
          // that one back on the sheet rather than showing a move that
          // only half happened.
          setGone(ids => ids.filter(id => id !== old.id))
          setError(`Filed under ${subject.title}, but it could not be taken out of ${old.title}.`)
        }
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
    startTransition(() => router.refresh())
    setBusy(null)
  }

  /**
   * File it where the bed says, in one press.
   *
   * The same write as choosing that subject from the list below and
   * pressing *File it here too* — `subjects.fileTopic`, which places it
   * against what is already in the bed — so the note it leaves is the
   * same note. The press exists because the reasoning is here: a reader
   * who has just read "every one of its 5 filed neighbours sits in
   * Shares and Stocks" should not have to go and find Shares and Stocks
   * in a dropdown to agree with it.
   */
  async function fileWhereItLooks(claim: LooseClaim) {
    setBusy('file')
    setError(null)
    setSettling(rows => [...rows, { id: claim.subjectId, title: claim.subjectTitle }])
    setNote(`Filing under ${claim.subjectTitle}…`)

    const { ok, body, error: failed } = await api.subjects.fileTopic(claim.subjectId, topicId)
    if (!ok) {
      setSettling(rows => rows.filter(r => r.id !== claim.subjectId))
      setNote(null)
      setError(failed ?? `Could not file it under ${claim.subjectTitle}.`)
      setBusy(null)
      return
    }

    const placed = body.placed ?? 0
    setNote(
      [
        `Filed under ${claim.subjectTitle}.`,
        placed > 0 ? `Related to ${placed} ${placed === 1 ? 'topic' : 'topics'} there.` : '',
        ...(body.warnings ?? []),
      ].filter(Boolean).join(' ')
    )
    startTransition(() => router.refresh())
    setBusy(null)
  }

  async function takeOut(subject: Filed) {
    setBusy(subject.id)
    setError(null)
    setNote(null)
    setGone(ids => [...ids, subject.id])

    const { ok, body, error: failed } = await api.subjects.removeTopic(subject.id, topicId)
    if (ok) {
      setNote(
        body.loose
          ? `Out of ${subject.title}. It keeps everything filed against it and is now loose stock — file it somewhere to put it back on a bed.`
          : `Out of ${subject.title}. It is still filed under the others it sits in.`
      )
      startTransition(() => router.refresh())
    } else {
      setGone(ids => ids.filter(id => id !== subject.id))
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

      {here.length === 0 ? (
        <>
          <p className={styles.empty}>
            Loose stock — this topic sits on no bed. It keeps everything filed
            against it; file it below to put it back on one.
          </p>
          {/* The bed usually has an opinion, and this block used to send
              the reader to a select box to supply one it already held.
              A topic's subjects are settled when it is made and its
              edges are drawn afterwards, so the evidence that places it
              arrives too late for anything to read — and this is the
              sheet where someone is looking straight at the topic that
              happened to. */}
          <WhereItLooks
            claims={nearby}
            onFile={fileWhereItLooks}
            busy={busy !== null}
            tone="block"
          />
        </>
      ) : (
        <ul className={styles.filing}>
          {here.map(subject => (
            <li key={subject.id} className={styles.filingRow}>
              <span className={styles.filingName}>
                <Link href={`/subjects/${subject.id}`}>{subject.title}</Link>
                {subject.id === primarySubjectId && (
                  <span className={styles.filingHome}>home</span>
                )}
                {/* Filed, but the bed has not been asked what it sits
                    under yet. Said rather than spun: the filing is real
                    and only the placement is outstanding. */}
                {settling.some(r => r.id === subject.id) && (
                  <span className={styles.filingSettling}>settling</span>
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
            {here.length > 0 && (
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
            {here.length > 1
              ? 'Moving takes it out of all the beds it currently sits in. Filing it leaves those as they are.'
              : 'Moving takes it out of the bed it is in now. Filing it leaves that one as it is.'}{' '}
            Either way it keeps its lessons, marks and history, and is placed
            against what is already in the new bed — which takes a moment.
          </p>
        </div>
      )}

      {note && <p className={styles.filingNote}>{note}</p>}
      {error && <p className={styles.filingProblem}>{error}</p>}

      {/* Loose stock is a sheet, not an action: everything filed under
          no subject at all, where several can be dealt with at once
          rather than one topic sheet at a time. */}
      <p className={styles.blockNote}>
        <Link href="/loose" className={styles.looseLink}>
          Loose stock
        </Link>{' '}
        — everything filed under no subject, in one place.
      </p>
    </section>
  )
}
