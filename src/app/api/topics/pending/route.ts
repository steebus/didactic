import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getPendingTopics } from '@/lib/pending'

export async function GET() {
  const db = supabaseAdmin()
  try {
    return NextResponse.json({ pending: await getPendingTopics(db) })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    )
  }
}

export async function PATCH(req: Request) {
  const { topicId, action, mergeInto } = await req.json()
  const db = supabaseAdmin()

  if (!topicId) {
    return NextResponse.json({ error: 'topicId is required' }, { status: 400 })
  }

  if (action === 'confirm') {
    const { error } = await db.from('topics').update({ state: 'active' }).eq('id', topicId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (action === 'merge') {
    if (!mergeInto) {
      return NextResponse.json({ error: 'mergeInto is required to merge' }, { status: 400 })
    }
    // merge_topics moves links, exposures, and edges before deleting the
    // duplicate. Destructive and irreversible, hence a user decision.
    const { error } = await db.rpc('merge_topics', { p_from: topicId, p_into: mergeInto })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (action === 'discard') {
    const { error } = await db.from('topics').delete().eq('id', topicId).eq('state', 'pending')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: `unknown action "${action}"` }, { status: 400 })
}
