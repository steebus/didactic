import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { computeFreshness } from '@/lib/scoring'

export async function GET() {
  const db = supabaseAdmin()
  const [{ data: nodes }, { data: edges }] = await Promise.all([
    db.from('nodes').select('id, title, ability, ability_confidence, last_exposure_at, cluster_id, state'),
    db.from('edges').select('from_node, to_node, kind, weight'),
  ])

  return NextResponse.json({
    nodes: (nodes ?? []).map(n => ({
      ...n,
      ability: Number(n.ability),
      ability_confidence: Number(n.ability_confidence),
      freshness: computeFreshness(n.last_exposure_at, Number(n.ability)),
    })),
    edges: edges ?? [],
  })
}
