import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { setResourceStatus } from '@/lib/consume'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { status, depth } = await req.json()

  try {
    const result = await setResourceStatus(supabaseAdmin(), id, status, depth)
    return NextResponse.json({ ok: true, ...result })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    // Validation failures are the caller's fault; anything else is ours.
    const status4xx = message.includes('invalid status') || message.includes('depth is required')
    return NextResponse.json({ error: message }, { status: status4xx ? 400 : 500 })
  }
}

/**
 * Remove a resource outright. This exists for material filed by mistake
 * — a link pasted into the wrong box, a PDF picked in error — and not
 * for material that has been read: an exposure is a fact about the
 * user's history, and deleting the thing it points at would leave the
 * ability figure resting on a record that no longer explains itself.
 */
export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = supabaseAdmin()

  const { count } = await db
    .from('exposures')
    .select('id', { count: 'exact', head: true })
    .eq('source_id', id)

  if ((count ?? 0) > 0) {
    return NextResponse.json(
      { error: 'This has already been read into the record. Abandon it instead of deleting it.' },
      { status: 409 }
    )
  }

  const { data: resource } = await db
    .from('resources').select('storage_path').eq('id', id).single()

  const { error } = await db.from('resources').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // The row is gone either way; a file left in the bucket is litter,
  // not a failure worth reporting to the caller.
  if (resource?.storage_path) {
    await db.storage.from('resources').remove([resource.storage_path])
  }

  return NextResponse.json({ ok: true })
}
