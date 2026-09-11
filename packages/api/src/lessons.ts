import type { Api } from './client'
import type { LessonLink } from '@didactic/core/lessonLinks'
import type { LessonNeighbours } from '@didactic/core/lessonState'
import type {
  Curriculum,
  ExposureDepth,
  Highlight,
  Lesson,
  LessonStage,
  Resource,
} from '@didactic/core/types'

export interface LessonPatch {
  action?: 'complete' | 'uncomplete'
  depth?: ExposureDepth
  title?: string
  summary?: string | null
  body?: string
  stage?: LessonStage
  position?: number
  estimated_minutes?: number | null
}

export interface LessonDetail {
  lesson: Lesson
  curriculum: Pick<Curriculum, 'id' | 'title' | 'goal' | 'topic_id' | 'status'> | null
  topic: { id: string; title: string } | null
  resources: Array<{ relevance: number; resources: Resource }>
  highlights: Highlight[]
  requires: Array<{ id: string; title: string; completed_at: string | null }>
  /**
   * Every lesson this one may point at: the rest of its topic first,
   * then the topics its subjects hold. Resolved when the lesson is
   * read rather than frozen into the body when it was written, so a
   * `lesson:` name whose target has gone prints as a stub instead of
   * a dead end.
   */
  links: LessonLink[]
  /**
   * The lessons either side of this one in its route, for the way on at
   * the foot of the reading. Derived from the route's own order rather
   * than stored, so reshaping the route reorders these with it.
   *
   * Additive: a client that has never heard of it reads the lesson
   * exactly as before.
   */
  neighbours: LessonNeighbours
  /** Derived, so the sheet never has to trust a stored flag. */
  available: boolean
}

/**
 * What completing a lesson answers with: the figure before and after.
 *
 * Held for the visit only — it is an acknowledgement, not a record. The
 * record is the exposure log.
 */
export interface Completion {
  ok: true
  exposureWritten?: boolean
  topicTitle?: string | null
  abilityBefore?: number | null
  abilityAfter?: number | null
}

/** The body, and whether it was already written. */
export interface Written {
  body: string
  cached: boolean
}

export const lessons = (api: Api) => ({
  get: (id: string) => api.get<LessonDetail>(`/api/lessons/${id}`),

  /** `action: 'complete'` at a depth is an exposure. */
  patch: (id: string, body: LessonPatch) =>
    api.patch<Completion>(`/api/lessons/${id}`, body),
  remove: (id: string) => api.del<{ ok: true }>(`/api/lessons/${id}`),

  /** Write the body, or write it again. */
  writeBody: (id: string, regenerate = false) =>
    api.post<Written>(`/api/lessons/${id}/body`, { regenerate }),
})
