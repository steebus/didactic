import type { Api } from './client'
import type { Highlight } from '@didactic/core/types'

/** What an entry's reading wrote, and what can be taken back. */
export interface DiaryExposure {
  id: string
  depth: string
  reason: string
  topic: { id: string; title: string } | null
}

export const diary = (api: Api) => ({
  /**
   * Write an entry. `topicId` is where the reader was standing, kept as
   * a starting point; what the entry is about is what it names.
   */
  create: (body: { note: string; topicId?: string | null }) =>
    api.post<{ entry: Highlight }>('/api/diary', body),

  /**
   * Read it back for what it shows about the topics it names.
   *
   * Its own call rather than part of saving: it is a model call over
   * prose, and the reader has closed the sheet by the time it starts.
   * Driven from the bench, like the other work someone walks away from.
   */
  read: (id: string) =>
    api.post<{ recorded: number; exposures: DiaryExposure[] }>(`/api/diary/${id}/read`, {}),

  /** What an entry wrote, for one being read long after. */
  exposures: (id: string) =>
    api.get<{ exposures: DiaryExposure[] }>(`/api/diary/${id}/read`),

  /** Take one of them back. The figure recomputes without it. */
  revoke: (exposureId: string) =>
    api.del<{ ok: true }>(`/api/diary/exposures/${exposureId}`),
})
