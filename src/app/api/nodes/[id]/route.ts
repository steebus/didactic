import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { computeFreshness } from '@/lib/scoring'

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = supabaseAdmin()

  const [{ data: node }, { data: exposures }, { data: resources }, { data: edges }] =
    await Promise.all([
      db.from('nodes').select('*').eq('id', id).single(),
      db.from('exposures').select('*').eq('node_id', id).order('created_at', { ascending: false }),
      db.from('resource_nodes').select('relevance, resources(*)').eq('node_id', id),
      db.from('edges').select('from_node, to_node, kind, weight')
        .or(`from_node.eq.${id},to_node.eq.${id}`),
    ])

  if (!node) return NextResponse.json({ error: 'not found' }, { status: 404 })

  return NextResponse.json({
    node: {
      ...node,
      ability: Number(node.ability),
      ability_confidence: Number(node.ability_confidence),
      freshness: computeFreshness(node.last_exposure_at, Number(node.ability)),
    },
    exposures: exposures ?? [],
    resources: resources ?? [],
    edges: edges ?? [],
  })
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  const db = supabaseAdmin()

  // Curation only. Ability is a rollup over exposures and is never
  // user-set: see PRODUCT.md, "Capabilities and Constraints".
  const patch: Record<string, unknown> = {}
  if (body.title !== undefined) patch.title = body.title
  if (body.summary !== undefined) patch.summary = body.summary
  if (body.cluster_id !== undefined) patch.cluster_id = body.cluster_id

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'nothing to update' }, { status: 400 })
  }

  const { error } = await db.from('nodes').update(patch).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { error } = await supabaseAdmin().from('nodes').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
