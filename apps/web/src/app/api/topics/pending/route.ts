import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getPendingTopics } from '@/lib/pending'
import { revalidateTag } from 'next/cache'
import { tags } from '@/lib/tags'

/**
 * Drop what this route just changed.
 *
 * The cache is only safe because every write says what it touched.
 * Erring wide is deliberate: serving a stale map is the one failure
 * this app cannot afford, and re-reading a sheet costs a few hundred
 * milliseconds once.
 */
function dropCache() {
  for (const tag of [tags.pending, tags.topics, tags.subjects]) revalidateTag(tag, 'max')
}


export async function GET() {
  try {
    return NextResponse.json({ pending: await getPendingTopics() })
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
    dropCache()
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
    dropCache()
    return NextResponse.json({ ok: true })
  }

  if (action === 'discard') {
    const { error } = await db.from('topics').delete().eq('id', topicId).eq('state', 'pending')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    dropCache()
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: `unknown action "${action}"` }, { status: 400 })
}
