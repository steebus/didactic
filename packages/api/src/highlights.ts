import type { Api } from './client'
import type { HighlightRow } from '@didactic/core/shapes'

export interface NewHighlight {
  lessonId: string
  /**
   * Empty for a note on the lesson as a whole, which is a real thing to
   * want: the thought a lesson leaves you with is not always about one
   * of its sentences. What it cannot be is empty with no note either.
   */
  quote?: string
  prefix?: string | null
  note?: string | null
}

export const highlights = (api: Api) => ({
  /** Search, or browse when there is nothing to search for. */
  list: (q?: string) => api.get<{ highlights: HighlightRow[] }>('/api/highlights', { q }),
  create: (body: NewHighlight) => api.post<{ id: string }>('/api/highlights', body),
  patch: (id: string, note: string | null) =>
    api.patch<{ ok: true }>('/api/highlights', { id, note }),
  remove: (id: string) => api.del<{ ok: true }>('/api/highlights', { id }),
})
