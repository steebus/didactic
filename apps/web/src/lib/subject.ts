import { cacheTag } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { computeFreshness, subjectAggregate } from './scoring'
import type { CurriculumStatus, Resource } from '@didactic/core/types'
import type { SubjectTopicRow, TopicTreeNode } from '@didactic/core/subject'
import { buildTopicTree } from '@didactic/core/subject'
import { tags } from '@didactic/core/tags'
import { supabaseAdmin } from './supabase'

// The shape moved to `@didactic/core/shapes`, where the phone can name
// it too; the query that builds it needs a client and the cache, so it
// stays here. Re-exported so `@/lib/subject` still answers for both.
import type { SubjectArea, Assessment, Sowing } from '@didactic/core/shapes'
export type { SubjectArea, Assessment, Sowing } from '@didactic/core/shapes'


// The outline and the verdict moved to `@didactic/core`: both are pure
// and the phone draws the same bed. What stays here reaches the database
// and carries the cache tags. Re-exported so `@/lib/subject` still
// answers for both halves.
export * from '@didactic/core/subject'

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

  const subjectResources = await getSubjectResources(db, subjectId)

  const { data: memberships } = await db
    .from('topic_subjects').select('topic_id').eq('subject_id', subjectId)
  const topicIds = (memberships ?? []).map(m => m.topic_id)

  if (topicIds.length === 0) {
    return {
      subject,
      tree: [],
      topics: [],
      resources: subjectResources,
      ability: 0,
      freshness: 0,
      confidence: 0,
      lastExposureAt: null,
      counts: { topics: 0, resources: 0, unread: 0, curricula: 0, edges: 0 },
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
        .select('id, curriculum_id, title, stage, position, completed_at')
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
            stage: l.stage,
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
    resources: subjectResources,
    confidence: active.length
      ? active.reduce((sum, r) => sum + r.ability_confidence, 0) / active.length
      : 0,
    lastExposureAt: tended.at(-1) ?? null,
    counts: {
      topics: active.length,
      resources: uniqueResources.size,
      unread: unread.size,
      curricula: rows.reduce((sum, r) => sum + r.curricula.length, 0),
      edges: edges?.length ?? 0,
    },
    sowing: await getSowing(db, subjectId),
    ...subjectAggregate(active),
  }
}

/** Resources filed against the subject as a whole — sow-time evidence,
 *  mainly. Sorted by title so the list is stable. */
async function getSubjectResources(
  db: SupabaseClient,
  subjectId: string
): Promise<Array<Pick<Resource, 'id' | 'title' | 'kind' | 'status' | 'url'>>> {
  const { data } = await db
    .from('resource_subjects')
    .select('resources(id, title, kind, status, url)')
    .eq('subject_id', subjectId)

  return (data ?? [])
    .flatMap(row => {
      const resource = row.resources as unknown as
        | Pick<Resource, 'id' | 'title' | 'kind' | 'status' | 'url'>
        | null
      return resource ? [resource] : []
    })
    .sort((a, b) => a.title.localeCompare(b.title))
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
