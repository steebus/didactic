/**
 * The subject sheet's own reading of its bed's order.
 *
 * Kept apart from `subject.ts` on purpose: that module reaches the
 * database and cannot cross into a client bundle, and this ordering runs
 * in the client component that draws the outline. It depends only on the
 * data already in hand, so it lives here where both sides can import it.
 */

import { routeProgress } from './progress'
import type { SubjectTopicRow, TopicTreeNode } from './subject'

/** How complex a stage reads, for ordering siblings simpler-first. */
const STAGE_RANK: Record<string, number> = { introductory: 0, core: 1, advanced: 2 }

/**
 * Where the bed itself said this topic falls, simplest first.
 *
 * Written when the bed was laid out: the sowing asks for the topics in
 * the order they should be met, and keeps the answer. It is the better
 * of the two complexity signals here and so it is read first — it is a
 * judgement about this topic's place in *this* subject, made with the
 * whole bed in view, which is exactly the question being asked.
 *
 * Null sorts last rather than at nought. A topic added by hand, or one
 * in a bed sown before the order was kept, has not been placed at the
 * introductory end; it has not been placed at all, and claiming the
 * front of the list for it would be an invention.
 */
function sownRank(topic: SubjectTopicRow): number {
  return topic.position ?? Number.POSITIVE_INFINITY
}

/**
 * How complex a topic reads, loosely: the mean stage of the lessons on
 * its route. A topic with no lessons has no signal and sits neutral.
 *
 * This is the weaker reading and now the second one: the stages of the
 * lessons inside a route describe that route's own arc, not where the
 * topic sits in the subject. It still separates siblings the bed never
 * put in an order — a bed grown by hand, or sown before the order was
 * kept — which is where it was always doing the real work.
 */
function complexityRank(topic: SubjectTopicRow): number {
  const lessons = topic.curricula.flatMap(c => c.lessons)
  if (lessons.length === 0) return 1
  return lessons.reduce((sum, l) => sum + (STAGE_RANK[l.stage] ?? 1), 0) / lessons.length
}

/**
 * How much attention a topic is getting now, worst-to-best floated: a
 * route mid-work rises highest, then anything recently tended, then the
 * rest. This is the "bring what I am active in to the top" reading.
 */
function activityRank(topic: SubjectTopicRow): number {
  if (routeProgress(topic.curricula).state === 'in-progress') return 0
  // In season, by the same 0.6 threshold the condition bar uses.
  if (topic.last_exposure_at !== null && topic.freshness >= 0.6) return 1
  return 2
}

/**
 * Reorder a subject's fixed outline so what is being worked rises to the
 * top and siblings run simpler-first.
 *
 * The nesting is left exactly as `buildTopicTree` drew it — only the
 * order of siblings at each depth changes, and a branch keeps its
 * subtree when it floats. The result is still a pure function of the
 * data: activity, then where the bed put it, then what its lessons say,
 * then title as the final tie-break, so the same bed prints the same way
 * twice. This is the subject sheet's own reading; the generic tree stays
 * title-sorted for every other caller.
 */
export function orderSubjectOutline(tree: TopicTreeNode[]): TopicTreeNode[] {
  return [...tree]
    .sort((a, b) => {
      const activity = activityRank(a.topic) - activityRank(b.topic)
      if (activity !== 0) return activity
      const sown = sownRank(a.topic) - sownRank(b.topic)
      // Two unplaced topics subtract to NaN rather than to nought, and a
      // NaN comparator silently leaves the list in whatever order it
      // arrived. Asked as a question instead, so unplaced siblings fall
      // through to the readings below rather than to chance.
      if (sown !== 0 && !Number.isNaN(sown)) return sown
      const complexity = complexityRank(a.topic) - complexityRank(b.topic)
      if (complexity !== 0) return complexity
      return a.topic.title.localeCompare(b.topic.title)
    })
    .map(node => ({ ...node, children: orderSubjectOutline(node.children) }))
}
