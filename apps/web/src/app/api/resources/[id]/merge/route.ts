import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { ownerId } from '@/lib/auth'
import { revalidateTag } from 'next/cache'
import { tags } from '@didactic/core/tags'

/**
 * Drop what this route just changed.
 *
 * The cache is only safe because every write says what it touched.
 * Erring wide is deliberate: serving a stale map is the one failure
 * this app cannot afford, and re-reading a sheet costs a few hundred
 * milliseconds once.
 */
function dropCache() {
  for (const tag of [tags.resources, tags.topics]) revalidateTag(tag, 'max')
}


/**
 * Fold one resource into another.
 *
 * The same book typed once and looked up later is two rows for one
 * thing, and the map counts it as two pieces of evidence. Merging
 * keeps the row that is better connected and moves everything the
 * other one held onto it: its topic links, and any exposure written
 * against it, so nothing is un-read by tidying up.
 *
 * The direction is the caller's: `id` survives, the body names the one
 * folded into it. It cannot be undone, which is why the shelf suggests
 * rather than does it.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await ownerId()
  if (!userId) return NextResponse.json({ error: 'not signed in' }, { status: 401 })

  const { id: keepId } = await params
  const { mergeId } = await req.json()

  if (typeof mergeId !== 'string' || !mergeId) {
    return NextResponse.json({ error: 'mergeId is required' }, { status: 400 })
  }
  if (mergeId === keepId) {
    return NextResponse.json({ error: 'that is the same row' }, { status: 400 })
  }

  const db = supabaseAdmin()

  const { data: both } = await db.from('resources')
    .select('id, title, user_id')
    .in('id', [keepId, mergeId])
  const keep = (both ?? []).find(r => r.id === keepId)
  const drop = (both ?? []).find(r => r.id === mergeId)

  if (!keep || !drop) return NextResponse.json({ error: 'not found' }, { status: 404 })
  if (keep.user_id !== userId || drop.user_id !== userId) {
    return NextResponse.json({ error: 'not yours' }, { status: 403 })
  }

  // Topic links move first. Anything the survivor already has stays as
  // it is, so a link filed by hand keeps the relevance it was given.
  const { data: links } = await db.from('resource_topics')
    .select('topic_id, relevance').eq('resource_id', mergeId)

  if (links?.length) {
    await db.from('resource_topics').upsert(
      links.map(l => ({ resource_id: keepId, topic_id: l.topic_id, relevance: l.relevance })),
      { onConflict: 'resource_id,topic_id', ignoreDuplicates: true }
    )
  }

  // Exposures are the record of what was actually read. They are
  // repointed rather than deleted: the reading happened, whichever row
  // it was filed against at the time.
  const { error: exposureError } = await db.from('exposures')
    .update({ source_id: keepId })
    .eq('source', 'resource')
    .eq('source_id', mergeId)
  if (exposureError) {
    return NextResponse.json({ error: exposureError.message }, { status: 500 })
  }

  const { error } = await db.from('resources')
    .delete().eq('id', mergeId).eq('user_id', userId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  dropCache()
  return NextResponse.json({
    ok: true,
    keptTitle: keep.title,
    linksMoved: links?.length ?? 0,
  })
}
