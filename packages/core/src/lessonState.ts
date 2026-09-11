/**
 * Lesson standing: the same question the route chip answers, asked one
 * level down.
 *
 * A subject's bed prints every topic's route as a stamp -- the word,
 * with the tick and the colour behind it -- so a reader can see what is
 * being worked without reading a figure. A topic's own sheet printed a
 * small "worked" beside the lessons that were done and nothing at all
 * beside the rest, which meant the one place the work actually happens
 * was the one place it could not be seen at a glance.
 *
 * Four states, worked-least first, derived rather than stored so they
 * can never disagree with the lessons themselves:
 *
 *   unwritten  nothing has been written yet; opening it writes it
 *   ready      written and waiting, with no sign of anyone in it
 *   started    marked passages in it, so it has been worked in
 *   worked     finished, and the figure moved
 *
 * `started` rests on marks because marks are the only evidence this app
 * actually holds that a reader was inside a lesson rather than past it.
 * It under-reports -- someone can read closely and mark nothing -- so it
 * is never the carrier on its own: `next` is what answers "where am I
 * up to", and it answers it from position and completion, which are
 * exact.
 */

export type LessonState = 'unwritten' | 'ready' | 'started' | 'worked'

export interface LessonStanding {
  state: LessonState
  /**
   * The one to pick up. The first lesson in the route that is not
   * worked -- which is where the reader is, whether they have opened it
   * or not. Exactly one lesson in a route carries it, and none does
   * once every lesson is worked.
   */
  next: boolean
}

export interface LessonLike {
  /** Null where the lesson has not been finished. */
  completed_at: string | null
  /** Whether a body has been written. Never the body itself: the topic
   *  sheet lists sixteen of these and none of them needs the prose. */
  has_body: boolean
  /** Marked passages taken in this lesson. */
  marks: number
}

export function lessonState(lesson: LessonLike): LessonState {
  if (lesson.completed_at) return 'worked'
  if (!lesson.has_body) return 'unwritten'
  return lesson.marks > 0 ? 'started' : 'ready'
}

/**
 * Every lesson's standing, in the order they were handed over -- which
 * is the route's own order, because `next` is meaningless in any other.
 */
export function lessonStandings(lessons: LessonLike[]): LessonStanding[] {
  const next = lessons.findIndex(l => !l.completed_at)
  return lessons.map((lesson, i) => ({
    state: lessonState(lesson),
    next: i === next,
  }))
}

/** The word. Removing it is the regression; colour only makes it
 *  quicker to read. */
export const LESSON_LABEL: Record<LessonState, string> = {
  unwritten: 'Not written',
  ready: 'Ready',
  started: 'Started',
  worked: 'Worked',
}

/** What the state means, for the title on the stamp. */
export const LESSON_NOTE: Record<LessonState, string> = {
  unwritten: 'Nothing written yet — opening it writes it',
  ready: 'Written and waiting',
  started: 'You have marked passages in this one',
  worked: 'Finished, and the figure moved',
}

/** Least worked first, the same direction as ROUTE_ORDER and
 *  STOCK_ORDER, so a list can float what needs attention. */
export const LESSON_ORDER: LessonState[] = ['unwritten', 'ready', 'started', 'worked']

/**
 * A lesson's neighbours in its route.
 *
 * The way on, at the foot of the reading. A lesson is the end of a
 * navigation -- the reader arrived from a topic sheet, a link in another
 * lesson's prose, or a bookmark -- and having finished it the only ways
 * onward were the browser's back button or the topic sheet, which is a
 * detour through a list to reach the row directly under the one you came
 * from.
 *
 * Position order, because that is the order the route is meant to be
 * worked in and the order the topic sheet prints. Neither neighbour is
 * gated on the other being finished: nothing in this app is locked, and
 * a prerequisite not yet met is said out loud on the lesson's own sheet
 * rather than enforced by hiding the way there.
 */
export interface LessonNeighbour {
  id: string
  title: string
}

export interface LessonNeighbours {
  previous: LessonNeighbour | null
  next: LessonNeighbour | null
}

export function lessonNeighbours(
  route: Array<{ id: string; title: string }>,
  lessonId: string
): LessonNeighbours {
  const at = route.findIndex(l => l.id === lessonId)
  // A lesson that is not in the route it was handed has no neighbours
  // in it. That is a real case -- the list arrives from one query and
  // the lesson from another -- and guessing an end to start from would
  // put the reader somewhere arbitrary.
  if (at === -1) return { previous: null, next: null }

  const cell = (i: number): LessonNeighbour | null => {
    const l = route[i]
    return l ? { id: l.id, title: l.title } : null
  }

  return { previous: cell(at - 1), next: cell(at + 1) }
}
