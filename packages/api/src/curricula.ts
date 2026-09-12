import type { Api, Result } from './client'
import { lessons } from './lessons'
import { routePhrase } from '@didactic/core/copy'
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

/**
 * A topic with a route through it and its first lesson written: what a
 * freshly sown bed is opened at.
 *
 * `drafted` says whether the route was laid now or already stood. A
 * topic sits under every subject it genuinely belongs to, so the most
 * introductory thing in a new bed can be something already worked
 * elsewhere on the map, and drafting a second route through it would be
 * noise rather than a head start.
 */
export interface Opened {
  curriculumId: string
  drafted: boolean
  lessonId: string
  lessonTitle: string
  warnings: string[]
}

export const curricula = (api: Api) => {
  const create = (topicId: string, goal?: string, sourceResourceIds?: string[]) =>
    api.post<Drafted>('/api/curricula', { topicId, goal, sourceResourceIds })

  const get = (id: string) => api.get<CurriculumDetail>(`/api/curricula/${id}`)

  /**
   * Lay a route through a topic and write its first lesson.
   *
   * Three calls rather than one because the middle of it must not go
   * through a single function: drafting a route is a model call at the
   * ceiling of a function's minute, and a lesson body is written a
   * round at a time for the same reason. Composed here so neither front
   * end has to know that, and so both do it the same way.
   *
   * `report` is handed the one honest thing each stage can say. The
   * drafting says nothing -- it is one request with nothing reporting
   * out of it, which is what the waiting phrases are for -- and from
   * the route onwards there are real figures.
   *
   * Nothing here approves anything. The route lands as a draft, exactly
   * as one drafted by hand does, and counts for nothing until the
   * reader approves it: what this saves them is the blank page, not the
   * decision.
   */
  const draftAndOpen = async (
    topic: { id: string; curriculumId?: string | null },
    {
      report = () => {},
      onRoute = () => {},
    }: {
      report?: (progress: string) => void
      /**
       * The route, the moment it is known and before a word of it is
       * written.
       *
       * The lesson about to be written does not exist when this starts,
       * so nothing outside can know to leave it alone -- and a reader
       * who opens that lesson while it is being written would set a
       * second write of the same body going. This is the one moment at
       * which that can be prevented, so it is announced rather than
       * only returned at the end.
       */
      onRoute?: (route: { curriculumId: string; lessonId: string; lessonTitle: string }) => void
    } = {}
  ): Promise<Result<Opened>> => {
    const warnings: string[] = []
    let curriculumId = topic.curriculumId ?? null
    const drafted = curriculumId === null

    if (curriculumId === null) {
      const draft = await create(topic.id)
      if (!draft.ok) {
        return { ok: false, status: draft.status, body: {} as Opened, error: draft.error }
      }
      curriculumId = draft.body.curriculumId
      // A draft that looped back on itself lost its ordering, and the
      // reader has to be told so they can set it themselves.
      if (draft.body.droppedPrereqs) warnings.push(draft.body.droppedPrereqs)
    }

    const detail = await get(curriculumId)
    if (!detail.ok) {
      return { ok: false, status: detail.status, body: {} as Opened, error: detail.error }
    }

    // `lessons` comes back tiered then in position order, so the first
    // of them is the first of the route by the route's own reckoning
    // rather than by the order the rows happened to be written.
    const first = detail.body.lessons[0]
    if (!first) {
      return {
        ok: false,
        status: 502,
        body: {} as Opened,
        error: 'The route came back with no lessons in it, so there was no first one to write.',
      }
    }

    onRoute({
      curriculumId,
      lessonId: first.lesson.id,
      lessonTitle: first.lesson.title,
    })
    report(routePhrase(detail.body.lessons.length))

    const written = await lessons(api).writeWhole(first.lesson.id, report)
    if (!written.ok) {
      return {
        ok: false,
        status: written.status,
        body: {} as Opened,
        // The route stands whatever happened next, and saying so is the
        // difference between "nothing came of this" and "there is a
        // route waiting, and one page of it to write".
        error: drafted
          ? `The route was drafted, but its first lesson could not be written: ${written.error}`
          : written.error,
      }
    }

    return {
      ok: true,
      status: written.status,
      error: null,
      body: {
        curriculumId,
        drafted,
        lessonId: first.lesson.id,
        lessonTitle: first.lesson.title,
        warnings: [...warnings, ...written.body.warnings],
      },
    }
  }

  return {
    create,
    get,
    draftAndOpen,

    patch: (id: string, body: CurriculumPatch) =>
      api.patch<{ ok: true }>(`/api/curricula/${id}`, body),
    remove: (id: string) => api.del<{ ok: true }>(`/api/curricula/${id}`),
    addLesson: (id: string, body: NewLesson) =>
      api.post<{ lesson: Lesson }>(`/api/curricula/${id}/lessons`, body),
  }
}
