/**
 * Cache tags.
 *
 * One user, and every write goes through this app's own route
 * handlers, so a cached read is safe exactly as long as the route that
 * changes it says so. These names are the contract between the two:
 * a reader tags what it built from, a writer drops what it touched.
 *
 * Kept in one file because the failure is silent. A tag written one
 * way in a page and another way in a route does not error -- it just
 * serves yesterday's map, which is the worst outcome for an app whose
 * whole claim is being an honest record.
 */
export const tags = {
  /** The stock list, and anything counting subjects or totals. */
  subjects: 'subjects',
  /** One subject's bed: its topics, their nesting, what is filed. */
  subject: (id: string) => `subject:${id}`,
  /** One topic sheet: its lessons, marks, material, neighbours. */
  topic: (id: string) => `topic:${id}`,
  /** Any topic sheet. Used when a write could touch several at once. */
  topics: 'topics',
  /** The library, and the inbox's view of it. */
  resources: 'resources',
  /** Marked passages, wherever they are listed. */
  highlights: 'highlights',
  /** One route through a topic, and its lessons. */
  curriculum: (id: string) => `curriculum:${id}`,
  /** The learning plans: the reasoning behind a course's shape and the
   *  log of what its lessons taught (`049`). Its own tag rather than the
   *  curriculum's, because the two move on completely different rhythms
   *  -- a plan gains a line on every lesson written, and dropping the
   *  whole route's cache for a document no sheet of the route prints
   *  would re-read the lessons to redraw nothing.
   *
   *  Flat rather than per-course, because `ENDPOINTS` carries static
   *  names and a second invalidation mechanism for one route would cost
   *  more than this does: no sheet on the map reads a plan, so dropping
   *  every plan drops one sheet nobody else is looking at. */
  plans: 'plans',
  /** The adjudication queue. */
  pending: 'pending',
  /** The garden: what is due, and what stands against a lesson. */
  clozes: 'clozes',
} as const
