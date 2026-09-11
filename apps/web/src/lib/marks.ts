/**
 * What the rest of the app needs to know about a mark, apart from how
 * it is drawn.
 *
 * Small enough to sit in one place rather than be reached for through
 * the component that paints them: the list on the lesson and the
 * painter both need the same two answers, and neither should have to
 * import the other to get them.
 */

import type { Highlight as Mark } from './types'

/** A mark kept in this session but not yet confirmed by the server.
 *  It is drawn like any other; what it cannot do is be edited or
 *  removed, because there is nothing on the other end to edit yet. */
export const UNSAVED = 'unsaved:'

export const isUnsaved = (id: string) => id.startsWith(UNSAVED)

/**
 * The marks of a lesson, in the order the lesson reads.
 *
 * A list of marks sorted by when they were kept is a list in the order
 * the reader happened to wander through the text, which is no order at
 * all a week later. What is wanted is the order they come in the
 * reading, and the only thing that knows that is the page: `paintMarks`
 * says which marks it drew and where they landed, and that is what
 * `order` carries.
 *
 * Anything not drawn keeps the order it arrived in and follows: a note
 * on the lesson belongs to no passage, and a passage whose words have
 * been rewritten away has no place in the text to sit at.
 */
export function inReadingOrder(marks: Mark[], order: string[]): Mark[] {
  const place = new Map(order.map((id, i) => [id, i]))
  const drawn = marks.filter(m => place.has(m.id))
  const rest = marks.filter(m => !place.has(m.id))

  drawn.sort((a, b) => (place.get(a.id) ?? 0) - (place.get(b.id) ?? 0))
  return [...drawn, ...rest]
}
