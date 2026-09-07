import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET() {
  const db = supabaseAdmin()
  const { data, error } = await db.from('topics')
    .select('id, title, created_at, primary_subject_id, embedding')
    .eq('state', 'pending')
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Each pending topic carries the existing topic it was mistaken for,
  // so the user can merge without hunting for the target themselves.
  const pending = await Promise.all(
    (data ?? []).map(async topic => {
      let nearest: { id: string; title: string } | null = null
      if (topic.embedding) {
        const embedding =
          typeof topic.embedding === 'string' ? JSON.parse(topic.embedding) : topic.embedding
        const { data: matches } = await db.rpc('match_topics', {
          query_embedding: embedding,
          match_count: 1,
        })
        const top = matches?.[0]
        if (top && top.id !== topic.id) nearest = { id: top.id, title: top.title }
      }
      return {
        id: topic.id,
        title: topic.title,
        created_at: topic.created_at,
        primary_subject_id: topic.primary_subject_id,
        nearest,
      }
    })
  )

  return NextResponse.json({ pending })
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
