import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { setResourceStatus } from '@/lib/consume'
import { removeResource } from '@/lib/removal'
import { ownerId } from '@/lib/auth'
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
  for (const tag of [tags.resources, tags.topics, tags.subjects, tags.pending]) revalidateTag(tag, { expire: 0 })
}


export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { status, depth } = await req.json()

  try {
    const result = await setResourceStatus(supabaseAdmin(), id, status, depth)
    dropCache()
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    // Validation failures are the caller's fault; anything else is ours.
    const status4xx = message.includes('invalid status') || message.includes('depth is required')
    dropCache()
    return NextResponse.json({ error: message }, { status: status4xx ? 400 : 500 })
  }
}

/**
 * Remove a resource outright. This exists for material filed by mistake
 * — a link pasted into the wrong box, a PDF picked in error — and not
 * for material that has been read: an exposure is a fact about the
 * user's history, and deleting the thing it points at would leave the
 * ability figure resting on a record that no longer explains itself.
 *
 * With `{ topics: true }` it also takes the topics only this resource
 * brought in (`lib/removal`), which the sheet shows first from
 * `/removal`. Without it the topics stay, as they always did.
 */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await ownerId()
  if (!userId) return NextResponse.json({ error: 'not signed in' }, { status: 401 })

  const { id } = await params
  // The body is optional: an older client sends none, and removes the
  // resource alone, as it always did.
  const body = await req.json().catch(() => ({}))
  const result = await removeResource(supabaseAdmin(), userId, id, { topics: body?.topics === true })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })

  dropCache()
  return NextResponse.json({ ok: true, topicsRemoved: result.topicsRemoved })
}
