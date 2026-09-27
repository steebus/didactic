import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { tags } from '@didactic/core/tags'
import { ownerId } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { drainAfter } from '@/lib/drain'
import { refileResource } from '@/lib/refile'

/** Its links are gone and the topics only it brought in with them: the
 *  shelf, the map, the beds and the queue all print what moved. */
function dropCache() {
  for (const tag of [tags.resources, tags.topics, tags.subjects, tags.pending]) revalidateTag(tag, 'max')
}

/** The queue is worked after the response, inside this route's time. */
export const maxDuration = 60

/**
 * File a resource again, as one topic (`as: 'whole'`) or by its parts
 * (`as: 'parts'`). Answers `{ cleared, queued }`: how many topics that
 * only it had brought in went with the old filing, and whether the new
 * reading is under way. 409 once it has been read into the record.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await ownerId()
  if (!userId) return NextResponse.json({ error: 'not signed in' }, { status: 401 })

  const { as } = (await req.json().catch(() => ({}))) as { as?: unknown }
  if (as !== 'whole' && as !== 'parts') {
    return NextResponse.json({ error: 'as must be "whole" or "parts"' }, { status: 400 })
  }

  const { id } = await params
  const answer = await refileResource(supabaseAdmin(), userId, id, as)
  if (!answer.ok) return NextResponse.json({ error: answer.error }, { status: answer.status })

  if (answer.queued) drainAfter()
  dropCache()
  return NextResponse.json({ cleared: answer.cleared, queued: answer.queued })
}
