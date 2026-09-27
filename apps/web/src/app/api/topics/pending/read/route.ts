import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { tags } from '@didactic/core/tags'
import { ownerId } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { rereadPending } from '@/lib/pendingReading'

/** A released topic is on the map now, and filed; a read one asks a
 *  different question. Every sheet that prints either is re-read. */
function dropCache() {
  for (const tag of [tags.pending, tags.topics, tags.subjects]) revalidateTag(tag, 'max')
}

/** One reading of up to a dozen topics, in parallel requests. */
export const maxDuration = 60

/**
 * Read the queued topics that were queued on wording alone: release the
 * ones that are their own topics, and ask about the rest against the
 * topic the reading chose. The queue asks this when it opens with any
 * such topic in it (`lib/pendingReading`).
 */
export async function POST() {
  const userId = await ownerId()
  if (!userId) return NextResponse.json({ error: 'not signed in' }, { status: 401 })

  const answer = await rereadPending(supabaseAdmin(), userId)
  if (answer.released > 0 || answer.read > 0) dropCache()
  return NextResponse.json(answer)
}
