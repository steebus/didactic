/**
 * One lesson pointing at another.
 *
 * A lesson is written knowing the others around it -- the rest of its
 * route, the rest of its topic, and the topics its subjects hold -- and
 * is asked to link them inline, on the words that make the point,
 * rather than listing them at the end. It writes those links against a
 * name it can be told (`lesson:settlement-and-custody`) rather than
 * against an id it would have to invent.
 *
 * The name is resolved when the lesson is read, not when it is
 * written, which is the whole reason this is a scheme and not a URL. A
 * body is written once and cached on the row; the map under it goes on
 * moving. A curriculum is reshaped, a lesson is grubbed out, another
 * one is sown in a neighbouring topic -- and a link that reached
 * something real in March has to be able to say, in June, that there
 * is nothing there now. A name that resolves is a link. A name that
 * does not is a stub: still printed, still saying what it was going to
 * say, marked as ground that has not been broken yet.
 *
 * Nothing here touches the DOM or the database, so every awkward part
 * -- two lessons of the same name, a lesson in another topic, a name
 * nobody has ever sown -- is written down as a test.
 */

import { slugFor } from './sections'

/** A lesson that can be reached from the one being read. */
export interface LessonLink {
  id: string
  title: string
  /** The topic it sits under, or null where it is scaffolding. */
  topicTitle: string | null
  /** True when it sits under the topic the reader is already in. */
  here: boolean
}

/** Where a name in the prose goes, once it is resolved. */
export interface LessonTarget {
  href: string
  /** What the link says on hover: the lesson, and where it sits. */
  label: string
}

/** How a lesson is named in prose: `lesson:` and the slug of its title. */
export const LESSON_SCHEME = /^lesson:([a-z0-9][a-z0-9-]*)$/i

/**
 * The name a lesson is reached by.
 *
 * The title, slugged the same way a heading is, so the model can write
 * the name from the title it was shown and two readings of the same
 * lesson always agree. Ids never enter the prose: a body outlives the
 * rows around it and a uuid in the text is a link that cannot be
 * re-checked.
 */
export function lessonSlug(title: string): string {
  return slugFor(title)
}

/**
 * Name every lesson within reach.
 *
 * Titles are not unique -- "Worked example" under three routes of one
 * subject is ordinary -- so a name that two lessons answer to goes to
 * the nearer one: the reader's own topic before a neighbouring one,
 * and the first given otherwise. The caller orders what it hands over;
 * this only refuses to let a far lesson take a near one's name.
 */
export function lessonRoster(lessons: LessonLink[]): Map<string, LessonLink> {
  const roster = new Map<string, LessonLink>()

  for (const lesson of lessons) {
    const slug = lessonSlug(lesson.title)
    const held = roster.get(slug)
    if (!held || (lesson.here && !held.here)) roster.set(slug, lesson)
  }

  return roster
}

/**
 * Where `lesson:<name>` goes, or null when nothing answers to it.
 *
 * A lesson one topic over is named as such on the way in, because
 * following it leaves the topic the reader is working and that is
 * worth knowing before the press rather than after it.
 */
export function resolveLesson(
  roster: Map<string, LessonLink>,
  slug: string
): LessonTarget | null {
  const lesson = roster.get(slug.toLowerCase())
  if (!lesson) return null

  return {
    href: `/lesson/${lesson.id}`,
    label: !lesson.here && lesson.topicTitle
      ? `${lesson.title} — in ${lesson.topicTitle}`
      : lesson.title,
  }
}
