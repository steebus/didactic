import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { tags } from '@didactic/core/tags'
import { ownerId } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { retitleFromPage } from '@/lib/resourceTitle'

/** A resource's title is printed wherever material is listed: the
 *  library, the topic sheets and, through them, the stock list. */
function dropCache() {
  for (const tag of [tags.resources, tags.topics]) revalidateTag(tag, 'max')
}

/** One page fetch, at most. */
export const maxDuration = 20

/**
 * Give a resource still titled by its address the title its page
 * carries. Changes nothing for a resource that already has a name, or
 * whose page says nothing better; `changed` says which.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await ownerId()
  if (!userId) return NextResponse.json({ error: 'not signed in' }, { status: 401 })

  const { id } = await params
  const answer = await retitleFromPage(supabaseAdmin(), userId, id)
  if (!answer) return NextResponse.json({ error: 'There is no such resource.' }, { status: 404 })
  if (answer.changed) dropCache()
  return NextResponse.json(answer)
}
