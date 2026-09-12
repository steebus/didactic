import type { Api, Result } from './client'
import { roundPhrase } from '@didactic/core/copy'
import type { LessonLink } from '@didactic/core/lessonLinks'
import type { SourceLink } from '@didactic/core/sourceLinks'
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
   * Every document this lesson may cite, with its length. Resolved when
   * the lesson is read for the same reason `links` is: a document taken
   * off the shelf should turn its citations into stubs rather than
   * leave them looking like citations that still reach something. A
   * page past the end of one is refused too, because a citation the
   * agent invented reads exactly like one it did not.
   *
   * Additive: a client that has never heard of it prints every
   * citation as a stub, which is the honest reading for a client that
   * cannot open one.
   */
  sources: SourceLink[]
  /**
   * The lessons either side of this one in its route, for the way on at
   * the foot of the reading. Derived from the route's own order rather
   * than stored, so reshaping the route reorders these with it.
   *
   * Additive: a client that has never heard of it reads the lesson
   * exactly as before.
   */
  neighbours: LessonNeighbours
  /**
   * Which of this lesson's questions the reader has already answered,
   * by `questionKey`, and whether they got each right. Only the first
   * answer to a question counts, so a block needs this to know whether
   * it may still offer a boost.
   */
  answered: Record<string, boolean>
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

/**
 * One round of a lesson: the prose so far, and whether that is all of
 * it.
 *
 * A lesson takes longer to generate than a serverless function is
 * allowed to run, so it is written a round at a time and each round is
 * saved. `done` false means come back for more; the body on the row is
 * real prose either way, just unfinished.
 */
export interface Written {
  body: string
  cached: boolean
  /** False while there is more of the lesson still to write. */
  done: boolean
  /** Which round this was, counting every one ever written for it. */
  round: number
  /** Roughly how many words are down, for telling the reader. */
  words: number
  /** Said when a lesson ran past the round cap and was stopped. */
  warning?: string
}

/**
 * What answering a question inside a lesson was worth.
 *
 * `counted` is false where the question had already been answered --
 * the first answer is the only one that moves anything, so the page can
 * say "you have already answered this" rather than implying a boost it
 * did not earn. A wrong first answer counts (the question is closed)
 * but writes no exposure.
 */
export interface Answered {
  counted: boolean
  exposureWritten: boolean
  topicTitle: string | null
  abilityBefore: number | null
  abilityAfter: number | null
}

/**
 * A lesson written all the way through, however many rounds it took.
 *
 * `warnings` carries the one thing a finished body may still have to
 * say: that it ran past the round cap and was stopped where it stands.
 */
export interface WrittenWhole {
  lessonId: string
  body: string
  /** How many rounds it took, counting every one ever written for it. */
  rounds: number
  warnings: string[]
}

export const lessons = (api: Api) => {
  const writeBody = (id: string, regenerate = false) =>
    api.post<Written>(`/api/lessons/${id}/body`, { regenerate })

  /**
   * Write a lesson, however many rounds it takes.
   *
   * The loop that drives the rounds, composed here rather than in a
   * front end because three callers set the same work going now -- the
   * topic sheet's control, the lesson's own first open, and the opening
   * of a freshly sown bed -- and a loop written three times is a cap
   * enforced three times and a progress note worded three times.
   *
   * What it is not is a retry. A round that fails ends it; only a round
   * that succeeds and says there is more goes round again. The cap
   * itself is the server's (`ROUNDS_MAX`), which answers `done` with a
   * warning rather than going round for ever, so there is no second
   * ceiling here to disagree with it.
   */
  const writeWhole = async (
    id: string,
    report: (progress: string) => void = () => {}
  ): Promise<Result<WrittenWhole>> => {
    for (;;) {
      const round = await writeBody(id)
      if (!round.ok) {
        return { ok: false, status: round.status, body: {} as WrittenWhole, error: round.error }
      }

      if (round.body.done) {
        return {
          ok: true,
          status: round.status,
          error: null,
          body: {
            lessonId: id,
            body: round.body.body,
            rounds: round.body.round,
            warnings: round.body.warning ? [round.body.warning] : [],
          },
        }
      }

      report(roundPhrase(round.body.round, round.body.words))
    }
  }

  return {
    get: (id: string) => api.get<LessonDetail>(`/api/lessons/${id}`),

    /** `action: 'complete'` at a depth is an exposure. */
    patch: (id: string, body: LessonPatch) =>
      api.patch<Completion>(`/api/lessons/${id}`, body),
    remove: (id: string) => api.del<{ ok: true }>(`/api/lessons/${id}`),

    /** Write the body, or write it again. One round. */
    writeBody,

    /** Every round of it, reporting as it goes. */
    writeWhole,

    /**
     * Answer one of the lesson's questions. `key` is `questionKey` of the
     * question's own text, so it survives everything but a rewrite of
     * the question itself.
     */
    answer: (id: string, key: string, correct: boolean) =>
      api.post<Answered>(`/api/lessons/${id}/answers`, { key, correct }),
  }
}
