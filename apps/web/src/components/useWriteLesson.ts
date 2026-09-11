'use client'

import { useCallback } from 'react'
import { didactic } from '@didactic/api'
import { useBench } from './Bench'

const api = didactic()

/**
 * Write a lesson, however many rounds it takes.
 *
 * The loop that drives the rounds, in one place because two sheets set
 * the same work going -- the topic sheet's control and the lesson's own
 * first open -- and a loop written twice is a cap enforced twice and a
 * progress note worded twice.
 *
 * It runs inside a bench job, which is what makes the whole thing hold
 * together: the job owns the loop, so the rounds carry on across a
 * navigation, and the job stays `running` from the first round to the
 * last so no sheet reads a half-written lesson as a finished one. The
 * sheets learn it landed the same way they learn anything landed --
 * when the job reaches `done`.
 *
 * What it is not is a retry. A round that fails ends the job; only a
 * round that succeeds and says there is more goes round again.
 */
export function useWriteLesson() {
  const { start } = useBench()

  return useCallback(
    (lesson: { id: string; title: string }) =>
      start({ kind: 'writing', id: lesson.id, name: lesson.title }, async report => {
        for (;;) {
          const { ok, body, error } = await api.lessons.writeBody(lesson.id)
          if (!ok) throw new Error(error ?? 'The lesson could not be written.')

          if (body.done) {
            return {
              href: `/lesson/${lesson.id}`,
              text: body.body,
              warnings: body.warning ? [body.warning] : [],
            }
          }

          // What it can honestly say: the round it has finished and the
          // words that are down. Not an ETA -- nothing here knows how
          // much lesson is left -- but enough that a reader can see it
          // moving.
          report(`Round ${body.round} done · about ${body.words} words so far`)
        }
      }),
    [start]
  )
}
