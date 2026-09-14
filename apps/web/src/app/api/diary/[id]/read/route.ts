import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { ownerId } from '@/lib/auth'
import { exposuresFor, readBack } from '@/lib/diary'
import { revalidateTag } from 'next/cache'
import { tags } from '@didactic/core/tags'

/**
 * Read an entry back, and record what it shows.
 *
 * A model call over prose, so it is its own request rather than part of
 * saving: the entry is already kept by the time this starts, and the
 * reader is expected to have walked off. The client drives it from the
 * bench, which is what makes that safe.
 *
 * Sixty is the ceiling on the cheapest plan. One entry against a
 * handful of topics is nowhere near it, but a request that is killed on
 * the way home has done its work and thrown it away, so it is declared.
 */
export const maxDuration = 60

/** Drop what reading an entry back just moved: the entry itself, and
 *  the figures on every topic it wrote against. */
function dropCache() {
  for (const tag of [tags.highlights, tags.topics, tags.subjects]) revalidateTag(tag, 'max')
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await ownerId()
  if (!userId) return NextResponse.json({ error: 'not signed in' }, { status: 401 })

  const { id } = await params
  const db = supabaseAdmin()

  try {
    const { recorded } = await readBack(db, userId, id)
    dropCache()
    // What it wrote, so the entry can print it and offer to take any of
    // it back without a second round trip.
    return NextResponse.json({ recorded, exposures: await exposuresFor(db, userId, id) })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    )
  }
}

/** What this entry wrote, for an entry read long after it was written. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await ownerId()
  if (!userId) return NextResponse.json({ error: 'not signed in' }, { status: 401 })

  const { id } = await params
  return NextResponse.json({
    exposures: await exposuresFor(supabaseAdmin(), userId, id),
  })
}
