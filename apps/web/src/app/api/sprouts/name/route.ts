import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { tags } from '@didactic/core/tags'
import { ownerId } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { tendTheSprouts } from '@/lib/sprouting'

/**
 * Drop what naming changed. Only the decisions: filling a topic's
 * kinship vector changes nothing any other sheet reads.
 *
 * Expired outright rather than served stale while it refreshes: the
 * sheet that called this is holding the fresh answer, and the next
 * sheet to ask -- the bed, a second visit -- would otherwise be handed
 * the unnamed reading and ask for the naming all over again.
 */
function dropCache() {
  revalidateTag(tags.sprouts, { expire: 0 })
}

/** Up to forty-eight embeddings and one model call. */
export const maxDuration = 60

export async function POST() {
  const userId = await ownerId()
  if (!userId) return NextResponse.json({ error: 'not signed in' }, { status: 401 })

  try {
    const { sprouting, warnings } = await tendTheSprouts(supabaseAdmin(), userId)
    dropCache()
    return NextResponse.json({ ...sprouting, warnings })
  } catch (e) {
    return NextResponse.json(
      { error: `Could not name what is sprouting: ${e instanceof Error ? e.message : String(e)}` },
      { status: 500 }
    )
  }
}
