import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { tags } from '@didactic/core/tags'
import { ownerId } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { plantTheSprout } from '@/lib/sprouting'

/** A new subject and every topic filed into it: the stock list, the
 *  beds, the topics' own sheets, and the decision. */
function dropCache() {
  for (const tag of [tags.subjects, tags.topics, tags.pending]) revalidateTag(tag, 'max')
  revalidateTag(tags.sprouts, { expire: 0 })
}

/**
 * Give a sprouting subject a bed. `title` is the name the reader
 * settled on, which may not be the one it was offered under.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await ownerId()
  if (!userId) return NextResponse.json({ error: 'not signed in' }, { status: 401 })

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const title = typeof body.title === 'string' ? body.title : null

  const { status, body: answer } = await plantTheSprout(supabaseAdmin(), userId, id, title)
  if (status === 200) dropCache()
  return NextResponse.json(answer, { status })
}
