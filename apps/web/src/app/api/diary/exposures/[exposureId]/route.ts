import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { ownerId } from '@/lib/auth'
import { revoke } from '@/lib/diary'
import { revalidateTag } from 'next/cache'
import { tags } from '@didactic/core/tags'

/**
 * Take back something a diary entry claimed.
 *
 * This is what lets the reading run unattended in the first place. The
 * app read someone's prose and moved a figure they cannot edit by hand;
 * the least it can do is let them say no, at any time, without
 * explaining themselves.
 *
 * Deleting the exposure is the whole of it -- ability is a cache over
 * the log, so the claim goes when the row does. Scoped to the owner and
 * to `source = 'diary'` in the reader itself, so this can never reach
 * an exposure written by reading a lesson or tending a card.
 */
/** Drop what taking a claim back just moved. */
function dropCache() {
  for (const tag of [tags.highlights, tags.topics, tags.subjects]) revalidateTag(tag, 'max')
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ exposureId: string }> }
) {
  const userId = await ownerId()
  if (!userId) return NextResponse.json({ error: 'not signed in' }, { status: 401 })

  const { exposureId } = await params

  try {
    const { topicId } = await revoke(supabaseAdmin(), userId, exposureId)
    // A revoke that found nothing is not an error: the row is gone,
    // which is what was asked for.
    if (topicId) dropCache()
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    )
  }
}
