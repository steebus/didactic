'use client'

import { useCallback } from 'react'
import { didactic } from '@didactic/api'
import { useBench } from './Bench'
import { saidTended } from './TendTally'

const api = didactic()

/**
 * Read a worked lesson back for what is worth keeping.
 *
 * Set going when a lesson is marked read or worked -- not skimmed,
 * which is by definition not an exposure worth asking about -- and
 * never awaited by the sheet that started it. The reader has just
 * pressed the button that says they are finished with this lesson;
 * making them stand and watch a model read it back would be the app
 * taking the last thing they did and turning it into a wait.
 *
 * So it is a bench job like the others: it outlives the sheet, reports
 * from the corner of wherever they went next, and puts itself away
 * afterwards -- there is nowhere to send anyone. The cards are due
 * immediately, but answering them two seconds after reading the
 * sentences they are cut from would teach nothing; the Tend link in the
 * running head is where they are met, tomorrow.
 *
 * Idempotent on the server. A lesson marked worked, un-marked and
 * marked again finds its concepts already standing and asks the model
 * nothing, so there is no guard needed here beyond the bench's own key.
 *
 * `more` is the other caller: the reader pressing *Write some more*
 * under "Tend this lesson", who is standing there and did ask for a
 * model call. It goes through the same bench job for the same reason
 * the first one does -- it is a minute of reading and they may well
 * turn the page mid-way -- and it **adds** rather than replaces, so
 * pressing it twice is two more sets of cards and never a deck thrown
 * away. Answers what the bench answered, so the caller can read the
 * list again once it has landed.
 */
export function useTendLesson() {
  const { start, running } = useBench()

  return useCallback(
    (lesson: { id: string; title: string }, more = false) => {
      if (running('tending', lesson.id)) return Promise.resolve({ kind: 'joined' as const })

      return start({ kind: 'tending', id: lesson.id, name: lesson.title }, async () => {
        const { ok, body, error } = await api.clozes.tend(lesson.id, more)
        if (!ok) throw new Error(error ?? 'The lesson could not be read back.')

        // The tally in every running head has just moved.
        saidTended()
        return { href: null, warnings: body.said ? [body.said] : [] }
      })
    },
    [start, running]
  )
}
