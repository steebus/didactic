import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { computeFreshness } from '@/lib/scoring'

export async function GET() {
  const db = supabaseAdmin()
  const [{ data: topics }, { data: edges }, { data: memberships }] = await Promise.all([
    db.from('topics').select(
      'id, title, ability, ability_confidence, last_exposure_at, primary_subject_id, state'
    ),
    db.from('edges').select('from_topic, to_topic, kind, weight'),
    db.from('topic_subjects').select('topic_id, subject_id'),
  ])

  // A topic may sit under several subjects, so the canvas filter needs
  // the whole membership set, not just the home subject it is coloured by.
  const subjectsFor = new Map<string, string[]>()
  for (const m of memberships ?? []) {
    const list = subjectsFor.get(m.topic_id)
    if (list) list.push(m.subject_id)
    else subjectsFor.set(m.topic_id, [m.subject_id])
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
  })
}
