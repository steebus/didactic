import type { Api } from './client'
import type { HighlightRow } from '@didactic/core/shapes'
import type { Highlight } from '@didactic/core/types'

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

/**
 * What keeping a mark answers with.
 *
 * The row itself, under the id the rest of the app knows it by, so the
 * mark drawn optimistically can be replaced with the real one without a
 * reload. A mark is the lightest exposure, so the figure it moved comes
 * back with it.
 */
export interface Kept {
  highlight: Highlight
  abilityBefore: number | null
  abilityAfter: number | null
}

export const highlights = (api: Api) => ({
  /** Search, or browse when there is nothing to search for. */
  list: (q?: string) => api.get<{ highlights: HighlightRow[] }>('/api/highlights', { q }),
  create: (body: NewHighlight) => api.post<Kept>('/api/highlights', body),
  patch: (id: string, note: string | null) =>
    api.patch<{ ok: true }>('/api/highlights', { id, note }),
  remove: (id: string) => api.del<{ ok: true }>('/api/highlights', { id }),
})
