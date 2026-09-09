import { cacheTag } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { computeFreshness, subjectAggregate } from './scoring'
import type { CurriculumStatus, Resource, Subject } from './types'
import { tags } from './tags'
import { supabaseAdmin } from './supabase'

export interface SubjectTopicRow {
  id: string
  title: string
  summary: string | null
  ability: number
  ability_confidence: number
  freshness: number
  last_exposure_at: string | null
  state: string
  /** Subjects other than this one that the topic is also filed under. */
  alsoIn: Array<{ id: string; title: string }>
  resources: Array<Pick<Resource, 'id' | 'title' | 'kind' | 'status' | 'url'>>
  curricula: Array<{
    id: string
    title: string
    status: CurriculumStatus
    total: number
    complete: number
    lessons: Array<{ id: string; title: string; completed: boolean }>
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
export function buildTopicTree<T extends { id: string; title: string }>(
  topics: T[],
  edges: EdgeRow[]
): Array<{ topic: T; children: Array<{ topic: T; children: unknown[] }> }> {
  const byId = new Map(topics.map(t => [t.id, t]))
  const ordered = [...topics].sort((a, b) => a.title.localeCompare(b.title))

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

export interface SubjectArea {
  subject: Subject
  tree: TopicTreeNode[]
  topics: SubjectTopicRow[]
  /** The subject's own figures, aggregated from its members. */
  ability: number
  freshness: number
  confidence: number
  lastExposureAt: string | null
  counts: { topics: number; resources: number; unread: number; curricula: number }
  /** What the user said when they sowed it, if it was sown here. */
  sowing: Sowing | null
}

/** The app's reading of the sowing answers, beside the user's own. */
export interface Assessment {
  level: number
  note: string
  shown: string[]
  missing: string[]
  answered: number
  asked: number
}

export interface Sowing {
  roots: number | null
  confident: string | null
  gaps: string | null
  depth: string | null
  qualifiers: Array<{ prompt: string; level: number; answer: string }>
  evidence: Array<{ title: string; kind: string }>
  assessment: Assessment | null
  created_at: string
}

/**
 * How the app's reading sits against the user's own figure.
 *
 * Derived from the two numbers rather than asked of the model, so the
 * verdict can never disagree with the figures printed beside it. A
 * single rung is inside the noise of one conversation, so it is only
 * called a difference at two.
 */
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
export async function getSubjectArea(subjectId: string): Promise<SubjectArea | null> {
  'use cache'
  cacheTag(tags.subject(subjectId), tags.subjects)
  // The client is built in here rather than passed in: an argument
  // crossing a `use cache` boundary is serialised, and a Supabase
  // client does not survive that.
  return readSubjectArea(supabaseAdmin(), subjectId)
}

export async function readSubjectArea(
  db: SupabaseClient,
  subjectId: string
): Promise<SubjectArea | null> {
  const { data: subject } = await db
    .from('subjects').select('id, title, colour').eq('id', subjectId).single()
  if (!subject) return null

  const { data: memberships } = await db
    .from('topic_subjects').select('topic_id').eq('subject_id', subjectId)
  const topicIds = (memberships ?? []).map(m => m.topic_id)

  if (topicIds.length === 0) {
    return {
      subject,
      tree: [],
      topics: [],
      ability: 0,
      freshness: 0,
      confidence: 0,
      lastExposureAt: null,
      counts: { topics: 0, resources: 0, unread: 0, curricula: 0 },
      sowing: await getSowing(db, subjectId),
    }
  }

  const [
    { data: topics },
    { data: edges },
    { data: links },
    { data: curricula },
    { data: alsoIn },
  ] = await Promise.all([
    db.from('topics')
      .select('id, title, summary, ability, ability_confidence, last_exposure_at, state')
      .in('id', topicIds),
    // Both ends must be inside the subject to nest anything, so the
    // filter can be applied here rather than after the fetch.
    db.from('edges').select('from_topic, to_topic, kind, weight')
      .in('from_topic', topicIds).in('to_topic', topicIds),
    db.from('resource_topics')
      .select('topic_id, resources(id, title, kind, status, url)')
      .in('topic_id', topicIds),
    db.from('curricula').select('id, topic_id, title, status')
      .in('topic_id', topicIds).order('created_at', { ascending: false }),
    db.from('topic_subjects').select('topic_id, subjects(id, title)')
      .in('topic_id', topicIds).neq('subject_id', subjectId),
  ])

  const curriculumIds = (curricula ?? []).map(c => c.id)
  const { data: lessons } = curriculumIds.length
    ? await db.from('lessons')
        .select('id, curriculum_id, title, position, completed_at')
        .in('curriculum_id', curriculumIds)
        .order('position')
    : { data: [] }

  const resourcesFor = new Map<string, SubjectTopicRow['resources']>()
  for (const link of links ?? []) {
    const resource = link.resources as unknown as SubjectTopicRow['resources'][number] | null
    if (!resource) continue
    const list = resourcesFor.get(link.topic_id)
    if (list) list.push(resource)
    else resourcesFor.set(link.topic_id, [resource])
  }

  const alsoFor = new Map<string, Array<{ id: string; title: string }>>()
  for (const row of alsoIn ?? []) {
    const other = row.subjects as unknown as { id: string; title: string } | null
    if (!other) continue
    const list = alsoFor.get(row.topic_id)
    if (list) list.push(other)
    else alsoFor.set(row.topic_id, [other])
  }

  const rows: SubjectTopicRow[] = (topics ?? []).map(t => {
    const ability = Number(t.ability)
    const own = (curricula ?? []).filter(c => c.topic_id === t.id)
    return {
      id: t.id,
      title: t.title,
      summary: t.summary,
      ability,
      ability_confidence: Number(t.ability_confidence),
      freshness: computeFreshness(t.last_exposure_at, ability),
      last_exposure_at: t.last_exposure_at,
      state: t.state,
      alsoIn: alsoFor.get(t.id) ?? [],
      resources: (resourcesFor.get(t.id) ?? []).sort((a, b) => a.title.localeCompare(b.title)),
      curricula: own.map(c => {
        const mine = (lessons ?? []).filter(l => l.curriculum_id === c.id)
        return {
          id: c.id,
          title: c.title,
          status: c.status as CurriculumStatus,
          total: mine.length,
          complete: mine.filter(l => l.completed_at !== null).length,
          lessons: mine.map(l => ({
            id: l.id,
            title: l.title,
            completed: l.completed_at !== null,
          })),
        }
      }),
    }
  })

  const active = rows.filter(r => r.state === 'active')
  const tended = active
    .map(r => r.last_exposure_at)
    .filter((d): d is string => d !== null)
    .sort()

  const allResources = rows.flatMap(r => r.resources)
  const uniqueResources = new Set(allResources.map(r => r.id))
  const unread = new Set(
    allResources.filter(r => r.status === 'queued').map(r => r.id)
  )

  return {
    subject,
    tree: buildTopicTree(rows, edges ?? []) as unknown as TopicTreeNode[],
    topics: rows,
    confidence: active.length
      ? active.reduce((sum, r) => sum + r.ability_confidence, 0) / active.length
      : 0,
    lastExposureAt: tended.at(-1) ?? null,
    counts: {
      topics: active.length,
      resources: uniqueResources.size,
      unread: unread.size,
      curricula: rows.reduce((sum, r) => sum + r.curricula.length, 0),
    },
    sowing: await getSowing(db, subjectId),
    ...subjectAggregate(active),
  }
}

export async function getSowing(
  db: SupabaseClient,
  subjectId: string
): Promise<Sowing | null> {
  const { data } = await db
    .from('subject_sowings')
    .select('roots, confident, gaps, depth, qualifiers, evidence, assessment, created_at')
    .eq('subject_id', subjectId)
    .maybeSingle()

  if (!data) return null

  const assessment = data.assessment as Assessment | null
  return {
    roots: data.roots === null ? null : Number(data.roots),
    confident: data.confident,
    gaps: data.gaps,
    depth: data.depth,
    qualifiers: Array.isArray(data.qualifiers) ? data.qualifiers : [],
    evidence: Array.isArray(data.evidence) ? data.evidence : [],
    // Sown before the reading existed, or sown with nothing to read.
    assessment:
      assessment && Number.isFinite(assessment.level)
        ? {
            level: Number(assessment.level),
            note: typeof assessment.note === 'string' ? assessment.note : '',
            shown: Array.isArray(assessment.shown) ? assessment.shown : [],
            missing: Array.isArray(assessment.missing) ? assessment.missing : [],
            answered: Number(assessment.answered) || 0,
            asked: Number(assessment.asked) || 0,
          }
        : null,
    created_at: data.created_at,
  }
}
