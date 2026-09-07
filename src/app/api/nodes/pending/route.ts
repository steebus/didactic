import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET() {
  const db = supabaseAdmin()
  const { data, error } = await db.from('nodes')
    .select('id, title, created_at, cluster_id, embedding')
    .eq('state', 'pending')
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Each pending node carries the existing subject it was mistaken for,
  // so the user can merge without hunting for the target themselves.
  const nodes = await Promise.all(
    (data ?? []).map(async node => {
      let nearest: { id: string; title: string } | null = null
      if (node.embedding) {
        const embedding =
          typeof node.embedding === 'string' ? JSON.parse(node.embedding) : node.embedding
        const { data: matches } = await db.rpc('match_nodes', {
          query_embedding: embedding,
          match_count: 1,
        })
        const top = matches?.[0]
        if (top && top.id !== node.id) nearest = { id: top.id, title: top.title }
      }
      return {
        id: node.id,
        title: node.title,
        created_at: node.created_at,
        cluster_id: node.cluster_id,
        nearest,
      }
    })
  )

  return NextResponse.json({ nodes })
}

export async function PATCH(req: Request) {
  const { nodeId, action, mergeInto } = await req.json()
  const db = supabaseAdmin()

  if (!nodeId) {
    return NextResponse.json({ error: 'nodeId is required' }, { status: 400 })
  }

  if (action === 'confirm') {
    const { error } = await db.from('nodes').update({ state: 'active' }).eq('id', nodeId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (action === 'merge') {
    if (!mergeInto) {
      return NextResponse.json({ error: 'mergeInto is required to merge' }, { status: 400 })
    }
    // merge_nodes moves links, exposures, and edges before deleting the
    // duplicate. Destructive and irreversible, hence a user decision.
    const { error } = await db.rpc('merge_nodes', { p_from: nodeId, p_into: mergeInto })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (action === 'discard') {
    const { error } = await db.from('nodes').delete().eq('id', nodeId).eq('state', 'pending')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: `unknown action "${action}"` }, { status: 400 })
}
