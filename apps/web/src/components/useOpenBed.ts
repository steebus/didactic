'use client'

import { useCallback } from 'react'
import { didactic, type FirstOfBed } from '@didactic/api'
import { useBench } from './Bench'

const api = didactic()

/**
 * Open a bed that has just been laid: a route through its most
 * introductory topic, and that route's first lesson written.
 *
 * A sown subject used to arrive as twenty topics and nothing to read.
 * Everything the reader might do next was a decision — which topic,
 * what to ask a route for, whether to write the lesson — and the
 * commonest answer to all three is "start at the beginning". So the app
 * answers them itself, once, for the first topic only: the rest of the
 * bed stays exactly as it was, untouched until someone asks.
 *
 * It is set down on the bench rather than held by the sheet that sowed,
 * because it takes a couple of minutes and the sheet it started on is
 * the one the reader is about to leave. Nothing is said while it runs
 * beyond the notice that it is running; the news is the finished
 * lesson, with the way to it.
 *
 * Nothing here is approved. The route lands as a draft exactly as one
 * drafted by hand does, and counts for nothing until the reader
 * approves it. What this removes is the blank page, not the decision.
 */
export function useOpenBed() {
  const { start } = useBench()

  return useCallback(
    (first: FirstOfBed | null | undefined) => {
      // A bed with nothing active in it, or a client answered by a
      // deploy that predates this. Neither is a failure: there is simply
      // nothing to open, and a notice saying so would be noise.
      if (!first) return

      // Deliberately not awaited. The caller is a sheet that is about to
      // navigate, and the whole point of the bench is that the work
      // outlives it. Failures are reported by the bench rather than
      // thrown here.
      void start({ kind: 'opening', id: first.id, name: first.title }, async (report, cover) => {
        const { ok, body, error } = await api.curricula.draftAndOpen(first, {
          report,
          // The lesson exists from here on, and the reader may well
          // open it -- the route is on the subject sheet by now. Taken
          // over so that opening it joins this job and waits, rather
          // than setting a second write of the same body going.
          onRoute: route => cover('writing', route.lessonId),
        })
        if (!ok) throw new Error(error ?? 'The first lesson could not be prepared.')

        return { href: `/lesson/${body.lessonId}`, warnings: body.warnings }
      })
    },
    [start]
  )
}
