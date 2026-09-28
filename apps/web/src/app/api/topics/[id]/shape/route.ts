import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { tags } from '@didactic/core/tags'
import { ownerId } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { shapeTopic, stillShaped } from '@/lib/shape'

/** A topic's size moved, and every sheet printing it. */
function dropCache() {
  for (const tag of [tags.topics, tags.subjects]) revalidateTag(tag, { expire: 0 })
}

/** A few grouped searches, one at a time. */
export const maxDuration = 60

/**
 * Read how a topic is written about (063, `lib/shape`), where it has no
 * standing reading. The topic sheet asks once when it opens one; nothing
 * about it is shown except the term it adds to the topic's size. Answers
 * `{ shaped, changed }`.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await ownerId()
  if (!userId) return NextResponse.json({ error: 'not signed in' }, { status: 401 })

  const { id } = await params
  const db = supabaseAdmin()
  const { data: topic } = await db
    .from('topics').select('id, user_id, title, state').eq('id', id).eq('user_id', userId).maybeSingle()
  if (!topic) return NextResponse.json({ error: 'There is no such topic.' }, { status: 404 })
  if (topic.state !== 'active') return NextResponse.json({ shaped: false, changed: false })

  const { data: kept, error: keptError } = await db
    .from('topic_shapes').select('phrase, probed_at').eq('topic_id', id).maybeSingle()
  // Before 063 there is nowhere to keep a reading.
  if (keptError) return NextResponse.json({ shaped: false, changed: false })
  if (stillShaped(kept, topic.title as string)) return NextResponse.json({ shaped: true, changed: false })

  const read = await shapeTopic(
    db,
    { id, user_id: userId, title: topic.title as string },
    process.env.OPENALEX_API_KEY
  )
  if (!read) return NextResponse.json({ shaped: false, changed: false })
  dropCache()
  return NextResponse.json({ shaped: true, changed: true })
}
