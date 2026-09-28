import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { tags } from '@didactic/core/tags'
import { ownerId } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

/** Unfolding moves a topic's whole history back off another, and
 *  its marks and cards with it: every sheet that prints them is stale. */
function dropCache() {
  for (const tag of [tags.subjects, tags.topics, tags.pending, tags.highlights, tags.clozes, tags.resources]) {
    revalidateTag(tag, { expire: 0 })
  }
}

/**
 * Unfold a topic that was folded into another's route (062).
 *
 * `[id]` is the folded topic's own id, which it gets back. Every row the
 * fold moved goes back where it was, the row returns with its
 * memberships and edges, and what was read since against the lesson the
 * fold made goes with it. That lesson is dropped if nobody worked it and
 * kept, teaching this topic, if somebody did.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await ownerId()
  if (!userId) return NextResponse.json({ error: 'not signed in' }, { status: 401 })

  const { id } = await params
  const db = supabaseAdmin()
  const { data: fold, error: findError } = await db
    .from('topic_folds')
    .select('id')
    .eq('topic_id', id)
    .eq('user_id', userId)
    .is('unfolded_at', null)
    .order('folded_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (findError) {
    const missing = findError.code === '42P01' || findError.code === 'PGRST205'
    return NextResponse.json(
      { error: missing ? 'Unfolding needs migration 062, which has not run yet.' : findError.message },
      { status: missing ? 503 : 500 }
    )
  }
  if (!fold) return NextResponse.json({ error: 'That topic has not been folded into anything.' }, { status: 404 })

  const { error } = await db.rpc('unfold_topic', { p_fold: fold.id })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  dropCache()
  return NextResponse.json({ topicId: id })
}
