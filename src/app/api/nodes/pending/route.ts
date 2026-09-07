import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET() {
  const db = supabaseAdmin()
  const { data, error } = await db.from('nodes')
    .select('id, title, created_at, cluster_id')
    .eq('state', 'pending')
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ nodes: data })
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
