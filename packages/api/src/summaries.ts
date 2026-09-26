import type { Api } from './client'
import type { Highlight } from '@didactic/core/types'

/**
 * Where a summary is written: a lesson, or a resource read in the app.
 * Exactly one of the two.
 */
export type SummaryOf = { lessonId: string; resourceId?: never } | { resourceId: string; lessonId?: never }

export interface NewSummary {
  /** The heading of the section it says back, as the reader saw it.
   *  Null for a summary of the whole lesson or resource. */
  section: string | null
  /** Which heading that is, counting from nought, so a list of them can
   *  run in the order the reading does. Null for the whole. */
  sectionAt: number | null
  note: string
}

/** What keeping a summary answers with: the row, and whether it was the
 *  first said about that section or replaced one already there. */
export interface KeptSummary {
  summary: Highlight
  created: boolean
}

export const summaries = (api: Api) => ({
  /** Every summary written against one lesson or resource. */
  list: (of: SummaryOf) =>
    api.get<{ summaries: Highlight[] }>('/api/summaries', {
      lessonId: of.lessonId,
      resourceId: of.resourceId,
    }),
  /** Keep a summary, replacing whatever was said about that section. */
  save: (of: SummaryOf, body: NewSummary) =>
    api.post<KeptSummary>('/api/summaries', { ...of, ...body }),
  remove: (id: string) => api.del<{ ok: true }>('/api/summaries', { id }),
})
