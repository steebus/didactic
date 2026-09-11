import type { Api } from './client'
import type {
  Curriculum,
  CurriculumShape,
  CurriculumStatus,
  Lesson,
  LessonStage,
} from '@didactic/core/types'
import type { CurriculumProgress, LessonView } from '@didactic/core/curriculum'

export interface CurriculumPatch {
  action?: string
  title?: string
  goal?: string | null
  shape?: CurriculumShape
  status?: CurriculumStatus
  lessonOrder?: string[]
  prereqs?: Array<{ lesson_id: string; requires_lesson_id: string }>
}

export interface NewLesson {
  title: string
  summary?: string | null
  stage?: LessonStage
  position?: number
  estimated_minutes?: number | null
  requires?: string[]
  scaffolding?: boolean
}

/**
 * What drafting answers with. A draft is a proposal and counts for
 * nothing until approved — PRODUCT.md principle 5.
 *
 * `droppedPrereqs` is a sentence rather than a flag: a draft that looped
 * back on itself had its ordering left out, and the reader has to be
 * told so they can set it themselves.
 */
export interface Drafted {
  curriculumId: string
  lessonsCreated: number
  shape: CurriculumShape
  droppedPrereqs: string | null
}

export interface CurriculumDetail {
  curriculum: Curriculum
  topic: {
    id: string
    title: string
    ability: number
    ability_confidence: number
    last_exposure_at: string | null
  } | null
  sources: Array<{
    note: string | null
    resources: { id: string; title: string; kind: string; url: string | null }
  }>
  /** Availability derived rather than stored, so it cannot go stale. */
  lessons: LessonView[]
  prereqs: Array<{ lesson_id: string; requires_lesson_id: string }>
  progress: CurriculumProgress
}

export const curricula = (api: Api) => ({
  create: (topicId: string, goal?: string, sourceResourceIds?: string[]) =>
    api.post<Drafted>('/api/curricula', { topicId, goal, sourceResourceIds }),

  get: (id: string) => api.get<CurriculumDetail>(`/api/curricula/${id}`),

  patch: (id: string, body: CurriculumPatch) =>
    api.patch<{ ok: true }>(`/api/curricula/${id}`, body),
  remove: (id: string) => api.del<{ ok: true }>(`/api/curricula/${id}`),
  addLesson: (id: string, body: NewLesson) =>
    api.post<{ lesson: Lesson }>(`/api/curricula/${id}/lessons`, body),
})
