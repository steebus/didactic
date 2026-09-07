import type { SupabaseClient } from '@supabase/supabase-js'
import { computeFreshness, subjectAggregate } from './scoring'
import type { Resource } from './types'

export interface SubjectCell {
  id: string
  title: string
  colour: string
  count: number
  queuedCount: number
  ability: number
  freshness: number
  /** Mean confidence across members. Drives how vaguely the sheet
   *  prints the viability figure — see PRODUCT.md principle 4. */
  confidence: number
  /** Most recent exposure across members, or null when no member has
   *  ever been tended. Null is what makes the 'unsown' state
   *  reachable for a populated subject. */
  lastExposureAt: string | null
}

export interface TopicSummary {
  id: string
  title: string
  ability: number
  confidence: number
  freshness: number
  primary_subject_id: string | null
}

export interface HomeData {
  subjects: SubjectCell[]
  unfiled: TopicSummary[]
  hot: TopicSummary[]
  cold: TopicSummary[]
  queued: Resource[]
  pendingCount: number
  suggested: TopicSummary | null
  totals: { topics: number; subjects: number; resources: number }
}

export async function getHomeData(db: SupabaseClient): Promise<HomeData> {
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
    totals: {
      topics: active.length,
      subjects: subjectCells.length,
      resources: (resources ?? []).length,
    },
  }
}
