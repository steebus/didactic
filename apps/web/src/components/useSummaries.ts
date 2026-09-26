'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { didactic, type SummaryOf } from '@didactic/api'
import type { Highlight } from '@didactic/core/types'
import { sectionKey, summaryOf } from '@didactic/core/summaries'
import { UNSAVED } from '@didactic/core/marks'

const api = didactic()

/**
 * The summaries of one reading, held for the sheet that is writing them.
 *
 * Kept the way a mark is: the summary is on the page the moment it is
 * written and saved behind the reader, and a failure takes it back and
 * says why rather than leaving the page claiming something the server
 * does not hold. One summary per section, so saving replaces whatever
 * stood against the same section -- here as on the server.
 */
export function useSummaries(of: SummaryOf, initial: Highlight[]) {
  const [summaries, setSummaries] = useState<Highlight[]>(initial)
  const [problem, setProblem] = useState<string | null>(null)
  const key = of.lessonId ?? of.resourceId ?? ''

  // Another reading is another set. The sheet's own re-read of the
  // lesson hands a fresh `initial` too, and that is the truth once it
  // lands -- but only between writes, or it would put back a summary
  // this session has just replaced.
  const writing = useRef(0)
  useEffect(() => {
    if (writing.current === 0) setSummaries(initial)
  }, [key, initial])

  const save = useCallback(
    async (section: string | null, sectionAt: number | null, note: string) => {
      const held = sectionKey(section)
      const now = new Date().toISOString()
      let before: Highlight | undefined

      setProblem(null)
      setSummaries(current => {
        before = summaryOf(current, held)
        const draft: Highlight = before
          ? { ...before, note: note.trim(), updated_at: now }
          : {
              id: `${UNSAVED}${crypto.randomUUID()}`,
              user_id: '',
              kind: 'summary',
              lesson_id: of.lessonId ?? null,
              resource_id: of.resourceId ?? null,
              topic_id: null,
              quote: '',
              prefix: null,
              note: note.trim(),
              section: held,
              section_at: held === null ? null : sectionAt,
              created_at: now,
              updated_at: now,
            }
        return [...current.filter(s => sectionKey(s.section) !== held), draft]
      })

      writing.current++
      const { ok, body, error } = await api.summaries.save(of, {
        section: held,
        sectionAt: held === null ? null : sectionAt,
        note,
      })
      writing.current--

      if (!ok) {
        setSummaries(current => [
          ...current.filter(s => sectionKey(s.section) !== held),
          ...(before ? [before] : []),
        ])
        setProblem(`That summary was not kept: ${error ?? 'something went wrong'}.`)
        return false
      }

      setSummaries(current => [
        ...current.filter(s => sectionKey(s.section) !== held),
        body.summary,
      ])
      return true
    },
    // `of` is a fresh object on every render; what it names is `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key]
  )

  const remove = useCallback(async (id: string) => {
    let taken: Highlight | undefined
    setProblem(null)
    setSummaries(current => {
      taken = current.find(s => s.id === id)
      return current.filter(s => s.id !== id)
    })

    writing.current++
    const { ok, error } = await api.summaries.remove(id)
    writing.current--

    if (!ok) {
      if (taken) setSummaries(current => [...current, taken!])
      setProblem(`That summary was not removed: ${error ?? 'something went wrong'}.`)
    }
  }, [])

  return { summaries, save, remove, problem }
}
