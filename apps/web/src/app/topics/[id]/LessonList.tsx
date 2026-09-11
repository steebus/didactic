'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { didactic } from '@didactic/api'
import { lessonStandings, LESSON_LABEL, LESSON_NOTE } from '@didactic/core/lessonState'
import type { LessonRow } from '@didactic/core/shapes'
import { useLabour, WRITINGS } from '@/components/useLabour'
import styles from './page.module.css'

const api = didactic()

/**
 * The lessons of a topic, each carrying its own standing.
 *
 * The bed prints every topic's route as a stamp, so a subject can be
 * read at a glance. One level down the same list said "worked" in small
 * type against the lessons that were finished and nothing at all
 * against the rest, which left the sheet where the work actually
 * happens as the one that had to be read line by line to find out where
 * you were. The stamp here is the bed's stamp: the word is the carrier,
 * the tick and the colour repeat it.
 *
 * It is a client component for the sake of one control -- writing a
 * lesson that has not been written. That is a model call the reader
 * does not need to watch, so it is offered here rather than only on the
 * lesson's own sheet, where the only way to ask for it was to open the
 * lesson and wait on it.
 */
export function LessonList({
  lessons,
  routeId,
  goal,
  draft,
}: {
  lessons: LessonRow[]
  routeId: string
  /** What the route is for, printed after the way into it. */
  goal: string | null
  /** A draft counts for nothing until it is approved, so its lessons
   *  are printed without the "up next" mark: there is no next in a
   *  route nobody has agreed to yet. */
  draft: boolean
}) {
  const router = useRouter()
  // The lesson being written, and the one the reader is being asked to
  // confirm. Writing is a minute of somebody else's compute and cannot
  // be taken back, so it is asked for twice -- the same two presses the
  // lesson sheet asks for before it rewrites a body.
  const [writing, setWriting] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const labour = useLabour(writing !== null, WRITINGS)
  const [, startTransition] = useTransition()

  const standings = lessonStandings(lessons)

  /**
   * Write a lesson from here.
   *
   * The body is written by the route and stored on the row, so nothing
   * about this needs the reader's attention once it has started: the
   * sheet is re-read when it lands and the lesson's stamp moves from
   * "Not written" to "Ready". What it does need is for the tab to stay
   * open -- the body is saved in one piece at the end, so a request cut
   * off half way saves nothing and the lesson is simply still
   * unwritten.
   */
  async function write(lesson: LessonRow) {
    setWriting(lesson.id)
    setConfirming(null)
    setError(null)
    setNote(null)

    const { ok, error: failed } = await api.lessons.writeBody(lesson.id)
    if (ok) {
      setNote(`“${lesson.title}” is written and ready to open.`)
      startTransition(() => router.refresh())
    } else {
      setError(failed ?? `Could not write “${lesson.title}”.`)
    }
    setWriting(null)
  }

  return (
    <>
      <ol className={styles.lessons}>
        {lessons.map((lesson, i) => {
          const { state, next } = standings[i]
          const busy = writing === lesson.id
          const asking = confirming === lesson.id

          return (
            <li key={lesson.id} className={styles.lessonItem}>
              <Link
                href={`/lesson/${lesson.id}`}
                className={styles.lesson}
                data-worked={lesson.completed_at ? 'true' : undefined}
                // The one to pick up, marked on the row itself rather
                // than only in the stamp: it is the answer to "where am
                // I", which is a question about the list, not about any
                // one lesson in it.
                data-next={next && !draft ? 'true' : undefined}
              >
                {/* The position is the sequence, printed as a catalogue
                    prints a line number. */}
                <span className={styles.lessonNumber} aria-hidden="true">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span className={styles.lessonBody}>
                  <span className={styles.lessonTitle}>{lesson.title}</span>
                  <span className={styles.lessonMeta}>
                    {lesson.stage}
                    {lesson.minutes ? ` · about ${lesson.minutes} min` : ''}
                    {lesson.marks > 0 &&
                      ` · ${lesson.marks} ${lesson.marks === 1 ? 'mark' : 'marks'}`}
                  </span>
                </span>

                <span className={styles.lessonFlags}>
                  {next && !draft && <span className={styles.lessonNext}>Up next</span>}
                  {/* The stamp: the word carries it, the tick and the
                      colour only make it quicker to find. */}
                  <span
                    className={styles.lessonStamp}
                    data-lesson={state}
                    title={LESSON_NOTE[state]}
                  >
                    <span className={styles.lessonTick} aria-hidden="true">
                      {state === 'worked' ? '●' : state === 'started' ? '◐' : '○'}
                    </span>
                    <span className={styles.lessonWord}>{LESSON_LABEL[state]}</span>
                  </span>
                </span>
              </Link>

              {/* Offered under the row rather than inside the link:
                  a button inside an anchor is not a thing a browser
                  or a screen reader can make sense of. */}
              {state === 'unwritten' && (
                <div className={styles.lessonAsk}>
                  {asking ? (
                    <>
                      <p className={styles.lessonAskNote}>
                        This asks the model to write “{lesson.title}” now. It takes
                        up to a minute and you do not have to watch it — but leave
                        this sheet open, because a request cut off part way saves
                        nothing.
                      </p>
                      <div className={styles.lessonAskRow}>
                        <button
                          type="button"
                          className={styles.lessonWrite}
                          onClick={() => write(lesson)}
                          disabled={writing !== null}
                        >
                          Yes, write it
                        </button>
                        <button
                          type="button"
                          className={styles.lessonWrite}
                          onClick={() => setConfirming(null)}
                        >
                          Leave it
                        </button>
                      </div>
                    </>
                  ) : (
                    <button
                      type="button"
                      className={styles.lessonWrite}
                      onClick={() => setConfirming(lesson.id)}
                      disabled={writing !== null}
                    >
                      {busy ? labour : 'Write this lesson'}
                    </button>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ol>

      {note && <p className={styles.lessonNote}>{note}</p>}
      {error && <p className={styles.lessonProblem}>{error}</p>}

      <p className={styles.routeLink}>
        <Link href={`/curriculum/${routeId}`} className={styles.inlineLink}>
          Reshape the route
        </Link>
        {goal ? ` — ${goal}` : ''}
      </p>
    </>
  )
}
