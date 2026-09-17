import type { Api } from './client'
import type { CardKind, Cloze, ClozeCard, ClozeCount } from '@didactic/core/clozes'
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
  /** Why a reading planted nothing, where it planted nothing. Null when
   *  cards were planted and the count says it. */
  note?: string | null
}

export interface NewCloze {
  lessonId: string
  /**
   * Which shape. Omitted means `cloze`, which is what the maker in the
   * reading sends: it exists to turn a passage the reader selected into
   * a card, and a passage with a hole in it is the only thing it makes.
   */
  kind?: CardKind
  /** cloze: the passage, as the lesson writes it. */
  text?: string
  /** cloze: the words inside it to take out. */
  blank?: string
  /** cloze: where they start in `text`, for a word that appears twice. */
  blankStart?: number
  /** qa / truefalse: the question, term, or statement to judge. */
  question?: string
  /** qa: the answer or definition. truefalse: `True` or `False`. */
  answer?: string
  /** truefalse: one line saying why, shown with the back. */
  note?: string | null
  /** The lesson sentence this came out of, for the wash in the reading.
   *  Checked against the body server-side and dropped where it is not
   *  found, so a card is never refused for a bad anchor. */
  anchor?: string | null
  hint?: string | null
}

export interface ClozeEdit {
  text?: string
  blank?: string
  blankStart?: number
  question?: string
  answer?: string
  note?: string | null
  anchor?: string | null
  hint?: string | null
}

export const clozes = (api: Api) => {
  const sow = (lessonId: string, more = false) =>
    api.post<SownClozes>(`/api/lessons/${lessonId}/clozes`, { more })

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

    /** Every card against one lesson: what the reading washes on the
     *  prose, and what "Tend this lesson" lists to be read over. */
    inLesson: (lessonId: string) =>
      api.get<{ clozes: ClozeCard[] }>('/api/clozes', { mode: 'lesson', lessonId }),

    /** What is waiting. Cheap enough for a nav on every sheet. */
    count: () => api.get<ClozeCount>('/api/clozes/count'),

    /** Make one by hand: a passage the reader chose, or a question and
     *  an answer they wrote. */
    create: (body: NewCloze) => api.post<{ cloze: ClozeCard }>('/api/clozes', body),

    /** Rewrite one, or move its blank. Never resets the schedule, and
     *  never changes its kind: a question is not a passage with a hole
     *  in it, and turning one into the other would leave a row the
     *  database refuses. Pull it up and write the other. */
    patch: (id: string, body: ClozeEdit) =>
      api.patch<{ cloze: ClozeCard }>(`/api/clozes/${id}`, body),

    remove: (id: string) => api.del<{ ok: true }>(`/api/clozes/${id}`),

    /** Answer one, on FSRS's own four-rung scale. */
    review: (id: string, rating: Rating) =>
      api.post<Tended>(`/api/clozes/${id}/review`, { rating }),

    /** Read a worked lesson and plant its trackers. `more` asks for
     *  another reading, which **adds**: nothing standing is removed. */
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
    tend: async (lessonId: string, more = false) => {
      const sown = await sow(lessonId, more)
      if (!sown.ok) return { ...sown, body: { ...sown.body, said: '' } }

      const cards = sown.body.concepts.reduce((n, c) => n + c.clozes, 0)

      // A reading that planted nothing says why, in the words the
      // reading itself came back with. It used to assert a reason --
      // "already asked every way it can be" -- that the app had no way
      // of knowing: the same sentence was printed whether the model
      // found no concepts, wrote cards that every rule refused, or had
      // its rows turned down by the database, and those want opposite
      // fixes. The fallbacks below are what is said when a reading
      // somehow comes back with nothing to say for itself.
      const said = sown.body.already
        ? 'Already in the garden.'
        : cards === 0
          ? (sown.body.note ??
            (more
              ? 'Nothing new could be asked of this lesson.'
              : 'Nothing in this lesson could be asked back.'))
          : `${sown.body.concepts.length} ${
              sown.body.concepts.length === 1 ? 'concept' : 'concepts'
            } tracked, ${cards} ${cards === 1 ? 'card' : 'cards'} planted.`

      return { ...sown, body: { ...sown.body, said } }
    },
  }
}
