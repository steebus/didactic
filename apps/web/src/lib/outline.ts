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
 * How complex a topic reads, loosely: the mean stage of the lessons on
 * its route. A topic with no lessons has no signal and sits neutral, so
 * the order is "simpler first where the lessons say so, title otherwise"
 * rather than a false precision.
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
 * data: activity, then complexity, then title as the final tie-break, so
 * the same bed prints the same way twice. This is the subject sheet's own
 * reading; the generic tree stays title-sorted for every other caller.
 */
export function orderSubjectOutline(tree: TopicTreeNode[]): TopicTreeNode[] {
  return [...tree]
    .sort((a, b) => {
      const activity = activityRank(a.topic) - activityRank(b.topic)
      if (activity !== 0) return activity
      const complexity = complexityRank(a.topic) - complexityRank(b.topic)
      if (complexity !== 0) return complexity
      return a.topic.title.localeCompare(b.topic.title)
    })
    .map(node => ({ ...node, children: orderSubjectOutline(node.children) }))
}
