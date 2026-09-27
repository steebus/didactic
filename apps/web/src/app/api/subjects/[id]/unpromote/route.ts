import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { tags } from '@didactic/core/tags'
import { ownerId } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'

/** The subject goes and its topics go back to their homes: every sheet
 *  that draws the map is stale. */
function dropCache() {
  for (const tag of [tags.subjects, tags.topics, tags.resources]) revalidateTag(tag, 'max')
}

/**
 * Put a promoted topic back (062): the subject it became is removed and
 * every topic the promotion rehomed goes back to the home it had, where
 * the reader has not moved it since. The topic, its history and its
 * edges were never touched by promoting, and are not touched now.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await ownerId()
  if (!userId) return NextResponse.json({ error: 'not signed in' }, { status: 401 })

  const { id } = await params
  const db = supabaseAdmin()
  const { data: subject } = await db.from('subjects').select('id').eq('id', id).eq('user_id', userId).maybeSingle()
  if (!subject) return NextResponse.json({ error: 'There is no such subject.' }, { status: 404 })

  const { data: topicId, error } = await db.rpc('unpromote_subject', { p_subject: id })
  if (error) {
    const missing = error.code === 'PGRST202' || error.code === '42883'
    return NextResponse.json(
      { error: missing ? 'Putting a promotion back needs migration 062, which has not run yet.' : error.message },
      { status: missing ? 503 : 400 }
    )
  }

  dropCache()
  return NextResponse.json({ topicId })
}
