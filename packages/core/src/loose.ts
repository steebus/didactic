/**
 * Loose stock: topics filed under no subject at all.
 *
 * The sheet deals with them in handfuls, which means the question it has
 * to answer is not "what does this topic hold" but "what do these
 * fourteen hold between them" — and a delete that could not say that
 * would be asking the reader to approve a cost nobody has counted.
 *
 * Pure, and here rather than in the sheet, because the phone will print
 * the same handful and a total that added up differently on two
 * platforms would be two different accounts of the same loss.
 */

import type { TopicEvidence } from './shapes'

/** A handful holding nothing at all. */
export const RECKONING_EMPTY: TopicEvidence = {
  subjects: [],
  sources: [],
  resources: 0,
  lessons: 0,
  marks: 0,
  exposures: 0,
}

/**
 * What a handful of topics holds between them.
 *
 * Counts add. Subjects and sources do not: a loose topic is by
 * definition filed under no subject, so the subject list is always
 * empty here, and naming the sources of fourteen topics is a page rather
 * than a reckoning — the counts are what the decision turns on.
 *
 * Resources are summed rather than deduplicated, and that overstates a
 * handful drawn from one article. It is the honest direction to be wrong
 * in: this number is printed above a delete, and a reckoning that
 * undercounted what it was about to destroy would be the one mistake
 * that matters.
 */
export function reckon(each: TopicEvidence[]): TopicEvidence {
  return each.reduce<TopicEvidence>(
    (total, one) => ({
      subjects: [],
      sources: [],
      resources: total.resources + one.resources,
      lessons: total.lessons + one.lessons,
      marks: total.marks + one.marks,
      exposures: total.exposures + one.exposures,
    }),
    RECKONING_EMPTY
  )
}
