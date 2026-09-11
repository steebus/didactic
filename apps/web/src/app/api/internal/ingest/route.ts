import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { ingestResource } from '@/lib/ingest'
import { revalidateTag } from 'next/cache'
import { tags } from '@didactic/core/tags'

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
 * What the platform allows, and what the round is budgeted against.
 *
 * Sixty rather than more: it is the ceiling on the cheapest plan, and
 * asking for more than the plan allows is refused at deploy rather than
 * granted at runtime. A document too long to read inside it is read
 * across several of these -- see `lib/document.ts`.
 */
export const maxDuration = 60

/**
 * How much of the minute the work may have.
 *
 * The rest is left for the response to get out. A round that spends the
 * whole sixty seconds and is killed on the way home has done its work
 * and thrown it away.
 */
const BUDGET_MS = 50_000

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
    const result = await ingestResource(supabaseAdmin(), resourceId, {
      deadline: Date.now() + BUDGET_MS,
    })
    dropCache()
    return NextResponse.json(result)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
