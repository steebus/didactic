import type { Api } from './client'
import type {
  Curriculum,
  ExposureDepth,
  Highlight,
  Lesson,
  LessonStage,
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
  resources: Array<{
    relevance: number
    resources: { id: string; title: string; kind: string; url: string | null; status: string }
  }>
  highlights: Highlight[]
  requires: Array<{ id: string; title: string; completed_at: string | null }>
  /** Derived, so the sheet never has to trust a stored flag. */
  available: boolean
}

/** What completing a lesson answers with: the figure before and after. */
export interface Completion {
  exposureWritten: boolean
  topicTitle?: string | null
  abilityBefore?: number | null
  abilityAfter?: number | null
}

export const lessons = (api: Api) => ({
  get: (id: string) => api.get<LessonDetail>(`/api/lessons/${id}`),

  /** `action: 'complete'` at a depth is an exposure. */
  patch: (id: string, body: LessonPatch) =>
    api.patch<Completion>(`/api/lessons/${id}`, body),
  remove: (id: string) => api.del<{ ok: true }>(`/api/lessons/${id}`),

  /** Write the body, or write it again. */
  writeBody: (id: string, regenerate = false) =>
    api.post<{ body: string }>(`/api/lessons/${id}/body`, { regenerate }),
})
