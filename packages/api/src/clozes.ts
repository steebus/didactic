import type { Api } from './client'
import type { Cloze, ClozeCard, ClozeCount } from '@didactic/core/clozes'
import type { Rating } from '@didactic/core/fsrs'

/** Which clozes a question is about. All three are optional and all
 *  three narrow: nothing given means the whole site. */
export interface ClozeScope {
  subjectId?: string
  topicId?: string
  lessonId?: string
}

/** What answering one was worth, and when it is wanted next. */
export interface Tended {
  cloze: Cloze
  intervalDays: number
  /** How likely the reader was to hold it, just before they answered. */
  retrievability: number
  /** The wait in words — "3 d", "2 mo" — so no sheet rounds it twice. */
  wait: string
}

/** What planting a lesson's trackers came to. */
export interface SownClozes {
  concepts: Array<{ id: string; name: string; clozes: number }>
  total: number
  /** True when the lesson was already tended and nothing was asked of
   *  the model. The ordinary answer on a second visit. */
  already: boolean
}

export interface NewCloze {
  lessonId: string
  /** The passage, as the lesson writes it. */
  text: string
  /** The words inside it to take out. */
  blank: string
  /** Where they start in `text`, for a word that appears twice. */
  blankStart?: number
  hint?: string | null
}

export interface ClozeEdit {
  text?: string
  blank?: string
  blankStart?: number
  hint?: string | null
}

export const clozes = (api: Api) => {
  const sow = (lessonId: string, regenerate = false) =>
    api.post<SownClozes>(`/api/lessons/${lessonId}/clozes`, { regenerate })

  return {
    /** What is due now, oldest first, narrowed however the caller likes. */
    due: (scope: ClozeScope = {}, limit?: number) =>
      api.get<{ clozes: ClozeCard[] }>('/api/clozes', { mode: 'due', ...scope, limit }),

    /**
     * One at random, due or not.
     *
     * Answers an empty list rather than a 404 when the scope holds
     * none: asking a subject with no clozes for one is an ordinary
     * question with an ordinary answer, and the sheet says so in a
     * sentence rather than in a status code.
     */
    random: (scope: ClozeScope = {}) =>
      api.get<{ clozes: ClozeCard[] }>('/api/clozes', { mode: 'random', ...scope }),

    /** Every cloze taken from one lesson, for drawing on its prose. */
    inLesson: (lessonId: string) =>
      api.get<{ clozes: ClozeCard[] }>('/api/clozes', { mode: 'lesson', lessonId }),

    /** What is waiting. Cheap enough for a nav on every sheet. */
    count: () => api.get<ClozeCount>('/api/clozes/count'),

    /** Make one by hand, over a passage the reader chose. */
    create: (body: NewCloze) => api.post<{ cloze: ClozeCard }>('/api/clozes', body),

    /** Rewrite one, or move its blank. Never resets the schedule. */
    patch: (id: string, body: ClozeEdit) =>
      api.patch<{ cloze: ClozeCard }>(`/api/clozes/${id}`, body),

    remove: (id: string) => api.del<{ ok: true }>(`/api/clozes/${id}`),

    /** Answer one, on FSRS's own four-rung scale. */
    review: (id: string, rating: Rating) =>
      api.post<Tended>(`/api/clozes/${id}/review`, { rating }),

    /** Read a worked lesson and plant its trackers. */
    sow,

    /**
     * Plant a lesson's trackers, and say what came of it in a sentence.
     *
     * Composed here rather than in a front end for the reason
     * `lessons.writeWhole` is: two callers set this same work going --
     * the lesson sheet when the reader marks it worked, and the reader
     * asking for a lesson to be read again -- and a sentence worded
     * twice is a sentence that comes to disagree with itself.
     */
    tend: async (lessonId: string, regenerate = false) => {
      const sown = await sow(lessonId, regenerate)
      if (!sown.ok) return { ...sown, body: { ...sown.body, said: '' } }

      const cards = sown.body.concepts.reduce((n, c) => n + c.clozes, 0)
      const said = sown.body.already
        ? 'Already in the garden.'
        : cards === 0
          ? 'Nothing in this lesson could be asked back.'
          : `${sown.body.concepts.length} ${
              sown.body.concepts.length === 1 ? 'concept' : 'concepts'
            } tracked, ${cards} ${cards === 1 ? 'cloze' : 'clozes'} planted.`

      return { ...sown, body: { ...sown.body, said } }
    },
  }
}
