import { cacheLife, cacheTag } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { computeFreshness, subjectAggregate } from '@didactic/core/scoring'
import { viewLessons } from '@didactic/core/curriculum'
import { tags } from '@didactic/core/tags'
import { supabaseAdmin } from './supabase'

// The shape moved to `@didactic/core/shapes`, where the phone can name
// it too; the query that builds it needs a client and the cache, so it
// stays here. Re-exported so `@/lib/home` still answers for both.
import type { SubjectCell, TopicSummary, CurriculumInProgress, HomeData } from '@didactic/core/shapes'

/**
 * Active curricula with lessons still to work, newest first, each with
 * the next lesson whose ground has been covered. A draft is a proposal
 * and does not belong here; an archived one has been set aside, and a
 * finished one has nothing to resume.
 */
async function getCurriculaInProgress(
  db: SupabaseClient
): Promise<CurriculumInProgress[]> {
  const { data: curricula } = await db
    .from('curricula')
    .select('id, title, status, created_at, topics(title)')
    .eq('status', 'active')
    .order('created_at', { ascending: false })

  if (!curricula?.length) return []

  const ids = curricula.map(c => c.id)
  const [{ data: lessons }, { data: prereqs }] = await Promise.all([
    db.from('lessons')
      .select('id, curriculum_id, title, position, completed_at')
      .in('curriculum_id', ids),
    db.from('lesson_prereqs').select('lesson_id, requires_lesson_id'),
  ])

  const out: CurriculumInProgress[] = []

  for (const curriculum of curricula) {
    const mine = (lessons ?? []).filter(l => l.curriculum_id === curriculum.id)
    if (mine.length === 0) continue

    const completed = mine.filter(l => l.completed_at !== null).length
    if (completed === mine.length) continue // nothing left to resume

    // Availability is derived the same way the curriculum page derives
    // it, so the two never disagree about what is open.
    const views = viewLessons(mine as never, (prereqs ?? []) as never)
    const next = views.find(v => v.availability === 'available')

    const topic = curriculum.topics as unknown as { title: string } | null

    out.push({
      id: curriculum.id,
      title: curriculum.title,
      topicTitle: topic?.title ?? '',
      completed,
      total: mine.length,
      nextLesson: next ? { id: next.lesson.id, title: next.lesson.title } : null,
    })
  }

  return out.slice(0, 4)
}

/**
 * The stock list, cached.
 *
 * The query and the caching are separate so the query can be tested
 * outside Next's runtime, where `cacheTag` does not exist -- and so
 * the thing under test is the reading of the map rather than the
 * caching of it.
 */
export async function getHomeData(): Promise<HomeData> {
  'use cache'
  // Read at a glance, so it is dropped by any write that could move a
  // figure on it.
  cacheTag(tags.subjects, tags.topics, tags.resources)
  // Held until a write drops one of the tags above. See the `held`
  // profile in next.config.ts for why nothing here expires on time.
  cacheLife('held')
  // The client is built in here rather than passed in: an argument
  // crossing a `use cache` boundary is serialised, and a Supabase
  // client does not survive that -- it arrives as a dead reference
  // and the first `.from()` throws on the server.
  return readHomeData(supabaseAdmin())
}

export async function readHomeData(db: SupabaseClient): Promise<HomeData> {
  const [
    { data: topics },
    { data: subjects },
    { data: resources },
    { data: links },
    { data: memberships },
  ] = await Promise.all([
    db.from('topics').select('*'),
    db.from('subjects').select('*'),
    db.from('resources').select('*').order('added_at', { ascending: false }),
    db.from('resource_topics').select('resource_id, topic_id'),
    db.from('topic_subjects').select('topic_id, subject_id'),
  ])

  const all = (topics ?? []).map(t => ({
    ...t,
    ability: Number(t.ability),
    ability_confidence: Number(t.ability_confidence),
    freshness: computeFreshness(t.last_exposure_at, Number(t.ability)),
  }))

  const active = all.filter(t => t.state === 'active')
  const pendingCount = all.length - active.length

  const summary = (t: (typeof all)[number]): TopicSummary => ({
    id: t.id,
    title: t.title,
    ability: t.ability,
    confidence: t.ability_confidence,
    freshness: t.freshness,
    primary_subject_id: t.primary_subject_id,
  })

  // Queued resources per subject: where material has been stockpiled
  // but not read. This is the "unsown stock" signal.
  const queuedResources = (resources ?? []).filter(r => r.status === 'queued')
  const queuedIds = new Set(queuedResources.map(r => r.id))
  const queuedTopicIds = new Set(
    (links ?? []).filter(l => queuedIds.has(l.resource_id)).map(l => l.topic_id)
  )

  // Membership is many-to-many, so a topic counts toward every subject
  // it sits under. Exposure is filed under portrait and landscape
  // photography both, and reading it warms both.
  const bySubject = new Map<string, Set<string>>()
  const filed = new Set<string>()
  for (const m of memberships ?? []) {
    if (!bySubject.has(m.subject_id)) bySubject.set(m.subject_id, new Set())
    bySubject.get(m.subject_id)!.add(m.topic_id)
    filed.add(m.topic_id)
  }

  const subjectCells: SubjectCell[] = (subjects ?? []).map(s => {
    const ids = bySubject.get(s.id) ?? new Set<string>()
    const members = active.filter(t => ids.has(t.id))
    const tended = members
      .map(t => t.last_exposure_at)
      .filter((d): d is string => d !== null)
      .sort()
    return {
      id: s.id,
      title: s.title,
      colour: s.colour,
      count: members.length,
      queuedCount: members.filter(t => queuedTopicIds.has(t.id)).length,
      confidence: members.length
        ? members.reduce((sum, t) => sum + t.ability_confidence, 0) / members.length
        : 0,
      lastExposureAt: tended.at(-1) ?? null,
      ...subjectAggregate(members),
    }
  }).sort((a, b) => b.count - a.count)

  const hot = [...active]
    .filter(t => t.freshness > 0)
    .sort((a, b) => b.freshness - a.freshness)
    .slice(0, 5)
    .map(summary)

  // Cold means known enough to be worth keeping, but fading. A topic
  // never touched is not cold, it is unsown.
  const cold = active
    .filter(t => t.ability >= 2 && t.freshness < 0.4 && t.last_exposure_at !== null)
    .sort((a, b) => a.freshness - b.freshness)
    .slice(0, 5)
    .map(summary)

  return {
    subjects: subjectCells,
    unfiled: active.filter(t => !filed.has(t.id)).map(summary),
    hot,
    cold,
    queued: queuedResources,
    pendingCount,
    suggested: cold[0] ?? null,
    inProgress: await getCurriculaInProgress(db),
    totals: {
      topics: active.length,
      subjects: subjectCells.length,
      resources: (resources ?? []).length,
    },
  }
}
