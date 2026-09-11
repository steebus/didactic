import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { ingestResource } from '@/lib/ingest'
import { revalidateTag } from 'next/cache'
import { tags } from '@/lib/tags'

/**
 * Drop what this route just changed.
 *
 * The cache is only safe because every write says what it touched.
 * Erring wide is deliberate: serving a stale map is the one failure
 * this app cannot afford, and re-reading a sheet costs a few hundred
 * milliseconds once.
 */
function dropCache() {
  for (const tag of [tags.resources, tags.topics, tags.subjects, tags.pending]) revalidateTag(tag, 'max')
}


/**
 * Called by the queue worker. Not part of the public surface: the
 * pipeline lives here so there is one implementation rather than a
 * second copy inside the Edge Function.
 */
export async function POST(req: Request) {
  const key = req.headers.get('x-internal-key')
  if (!process.env.INTERNAL_KEY || key !== process.env.INTERNAL_KEY) {
    return NextResponse.json({ error: 'unauthorised' }, { status: 401 })
  }

  const { resourceId } = await req.json()
  if (!resourceId) {
    return NextResponse.json({ error: 'resourceId is required' }, { status: 400 })
  }

  try {
    const result = await ingestResource(supabaseAdmin(), resourceId)
    dropCache()
    return NextResponse.json(result)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
