/**
 * A subject's bed, as shape rather than as a query.
 *
 * The reads that fill these in stay in `apps/web`: they reach the
 * database and carry Next's cache tags. What is here is the part both
 * platforms compute for themselves -- the fixed outline, and the reading
 * of how a sown depth compares with an assessed one.
 */

import type { CurriculumStatus, Resource } from './types'

export interface SubjectTopicRow {
  id: string
  title: string
  summary: string | null
  ability: number
  ability_confidence: number
  freshness: number
  last_exposure_at: string | null
  state: string
  /**
   * Where this topic falls in the order its bed was laid out in,
   * simplest first. Null where the bed never said -- a topic added by
   * hand afterwards, or a bed sown before the sowing recorded an order.
   */
  position: number | null
  /**
   * Which group this topic sits in within this bed, or null where it
   * sits loose between the boxes. Ungrouped is ordinary: a topic that
   * belongs with nothing else here is not a topic filed wrongly.
   */
  group_id: string | null
  /** Subjects other than this one that the topic is also filed under. */
  alsoIn: Array<{ id: string; title: string }>
  resources: Array<Pick<Resource, 'id' | 'title' | 'kind' | 'status' | 'url'>>
  curricula: Array<{
    id: string
    title: string
    status: CurriculumStatus
    total: number
    complete: number
    lessons: Array<{ id: string; title: string; stage: string; completed: boolean }>
  }>
}

export interface TopicTreeNode {
  topic: SubjectTopicRow
  children: TopicTreeNode[]
}

interface EdgeRow {
  from_topic: string
  to_topic: string
  kind: string
  weight?: number | null
}

/** Which edge kinds put one topic under another, strongest first.
 *  `specialises` runs general → narrower, so it is a containment;
 *  `prereq` runs earlier → later, which reads as foundation and branch.
 *  Nothing else nests: `related` and `alternative` are sideways. */
const NESTING_KINDS = ['specialises', 'prereq']

/**
 * The order a bed prints in: simplest first.
 *
 * `position` is what the sowing said -- introductory ground before
 * advanced -- written onto the membership because a topic is
 * introductory in one subject and advanced in another. It was recorded
 * from the start and the outline sorted by title anyway, so a bed that
 * knew where to start printed "Aperture, Composition, Zone System".
 *
 * Null sorts last rather than as nought: it means the bed never stated
 * where this one falls -- a topic added by hand, or one sown before the
 * order existed -- and guessing it is introductory would put it above
 * topics the bed actually placed. Title breaks the tie, so the same
 * data prints the same way twice.
 */
function bySimplestFirst(
  a: { title: string; position?: number | null },
  b: { title: string; position?: number | null }
): number {
  const left = a.position ?? Infinity
  const right = b.position ?? Infinity
  if (left !== right) return left - right
  return a.title.localeCompare(b.title)
}

/**
 * Arrange a subject's topics into one fixed tree.
 *
 * Fixed means deterministic, which is the whole point of it: the graph
 * already exists for the view where position is emergent and every
 * reload looks different. This is the other reading of the same data —
 * an outline you can scan, and find in the same place tomorrow.
 *
 * A topic may sit under several parents in the graph, but only one in
 * an outline, so the strongest single relationship wins and the rest
 * are left to the graph. Anything with no parent inside this subject is
 * a root, which means an unconnected subject prints as a flat list
 * rather than as nothing.
 */
export function buildTopicTree<
  T extends { id: string; title: string; position?: number | null },
>(
  topics: T[],
  edges: EdgeRow[]
): Array<{ topic: T; children: Array<{ topic: T; children: unknown[] }> }> {
  const byId = new Map(topics.map(t => [t.id, t]))
  const ordered = [...topics].sort(bySimplestFirst)

  // Only edges wholly inside this subject nest anything. A prerequisite
  // that lives in another subject is real, but it cannot be drawn in an
  // outline of this one.
  const usable = edges.filter(
    e =>
      NESTING_KINDS.includes(e.kind) &&
      byId.has(e.from_topic) &&
      byId.has(e.to_topic) &&
      e.from_topic !== e.to_topic
  )

  const candidates = new Map<string, EdgeRow[]>()
  for (const edge of usable) {
    const list = candidates.get(edge.to_topic)
    if (list) list.push(edge)
    else candidates.set(edge.to_topic, [edge])
  }

  const parentOf = new Map<string, string>()

  const wouldCycle = (child: string, parent: string) => {
    let cursor: string | undefined = parent
    const seen = new Set<string>()
    while (cursor) {
      if (cursor === child) return true
      if (seen.has(cursor)) return true
      seen.add(cursor)
      cursor = parentOf.get(cursor)
    }
    return false
  }

  for (const topic of ordered) {
    const options = (candidates.get(topic.id) ?? []).sort((a, b) => {
      const kind = NESTING_KINDS.indexOf(a.kind) - NESTING_KINDS.indexOf(b.kind)
      if (kind !== 0) return kind
      const weight = Number(b.weight ?? 0) - Number(a.weight ?? 0)
      if (weight !== 0) return weight
      return byId.get(a.from_topic)!.title.localeCompare(byId.get(b.from_topic)!.title)
    })

    for (const option of options) {
      if (!wouldCycle(topic.id, option.from_topic)) {
        parentOf.set(topic.id, option.from_topic)
        break
      }
    }
  }

  const childrenOf = new Map<string, T[]>()
  for (const topic of ordered) {
    const parent = parentOf.get(topic.id)
    if (!parent) continue
    const list = childrenOf.get(parent)
    if (list) list.push(topic)
    else childrenOf.set(parent, [topic])
  }

  const build = (topic: T): TopicTreeNode =>
    ({
      topic,
      children: (childrenOf.get(topic.id) ?? []).map(build),
    }) as unknown as TopicTreeNode

  return ordered
    .filter(t => !parentOf.has(t.id))
    .map(build) as unknown as Array<{
    topic: T
    children: Array<{ topic: T; children: unknown[] }>
  }>
}

export type Verdict = 'above' | 'below' | 'matching' | 'unstated'

export function readVerdict(roots: number | null, assessed: number | null): Verdict {
  if (roots === null || assessed === null) return 'unstated'
  const gap = assessed - roots
  if (gap >= 2) return 'above'
  if (gap <= -2) return 'below'
  return 'matching'
}

/**
 * Everything the subject sheet shows: the bed as an outline, with the
 * material and the routes filed under each topic in it.
 */
