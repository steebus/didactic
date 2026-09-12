'use client'

import { useCallback } from 'react'
import { didactic } from '@didactic/api'
import { useBench } from './Bench'

const api = didactic()

/**
 * Write a lesson, however many rounds it takes.
 *
 * The loop itself is `api.lessons.writeWhole`, because three callers
 * set the same work going -- the topic sheet's control, the lesson's
 * own first open, and the opening of a freshly sown bed -- and a loop
 * written three times is a cap enforced three times and a progress note
 * worded three times. What is left here is the part that is React: the
 * bench job around it.
 *
 * That job is what makes the whole thing hold together: it owns the
 * loop, so the rounds carry on across a navigation, and it stays
 * `running` from the first round to the last so no sheet reads a
 * half-written lesson as a finished one. The sheets learn it landed the
 * same way they learn anything landed -- when the job reaches `done`.
 */
export function useWriteLesson() {
  const { start } = useBench()

  return useCallback(
    (lesson: { id: string; title: string }) =>
      start({ kind: 'writing', id: lesson.id, name: lesson.title }, async report => {
        const { ok, body, error } = await api.lessons.writeWhole(lesson.id, report)
        if (!ok) throw new Error(error ?? 'The lesson could not be written.')

        return {
          href: `/lesson/${lesson.id}`,
          text: body.body,
          warnings: body.warnings,
        }
      }),
    [start]
  )
}
