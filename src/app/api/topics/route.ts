import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { computeFreshness } from '@/lib/scoring'

export async function GET() {
  const db = supabaseAdmin()
  const [
    { data: topics },
    { data: edges },
    { data: memberships },
    { data: resourceLinks },
    { data: lessons },
  ] = await Promise.all([
    db.from('topics').select(
      'id, title, ability, ability_confidence, last_exposure_at, primary_subject_id, state'
    ),
    db.from('edges').select('from_topic, to_topic, kind, weight'),
    db.from('topic_subjects').select('topic_id, subject_id'),
    // A resource can touch several topics, so it is returned once with
    // every topic it links to rather than duplicated per topic.
    db.from('resource_topics')
      .select('topic_id, relevance, resources(id, title, kind, status)'),
    db.from('lessons')
      .select('id, title, topic_id, stage, completed_at, curriculum_id')
      .not('topic_id', 'is', null),
  ])

  // A topic may sit under several subjects, so the canvas filter needs
  // the whole membership set, not just the home subject it is coloured by.
  const subjectsFor = new Map<string, string[]>()
  for (const m of memberships ?? []) {
    const list = subjectsFor.get(m.topic_id)
    if (list) list.push(m.subject_id)
    else subjectsFor.set(m.topic_id, [m.subject_id])
  }

  // One entry per resource, carrying every topic it touches. A paper on
  // retrieval belongs to embeddings and vector search both, and the
  // canvas should show it reaching into each.
  const resourceMap = new Map<
    string,
    { id: string; title: string; kind: string; status: string; topic_ids: string[] }
  >()
  for (const link of resourceLinks ?? []) {
    const r = link.resources as unknown as {
      id: string; title: string; kind: string; status: string
    } | null
    if (!r) continue
    const existing = resourceMap.get(r.id)
    if (existing) existing.topic_ids.push(link.topic_id)
    else resourceMap.set(r.id, { ...r, topic_ids: [link.topic_id] })
  }

  return NextResponse.json({
    topics: (topics ?? []).map(t => ({
      ...t,
      ability: Number(t.ability),
      ability_confidence: Number(t.ability_confidence),
      freshness: computeFreshness(t.last_exposure_at, Number(t.ability)),
      subject_ids: subjectsFor.get(t.id) ?? [],
    })),
    edges: edges ?? [],
    resources: [...resourceMap.values()],
    lessons: lessons ?? [],
  })
}
