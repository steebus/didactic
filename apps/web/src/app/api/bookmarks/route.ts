import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { ownerId } from '@/lib/auth'
import { parentOf, readingOf, type ReadingRef } from '@/lib/reading'
import { PLACE_PREFIX, PLACE_WORDS } from '@didactic/core/bookmarks'
import { revalidateTag } from 'next/cache'
import { tags } from '@didactic/core/tags'

/**
 * Where the reader stopped in a lesson or a resource (066).
 *
 * One per reading: a write replaces whatever was there, and a delete
 * takes it away. Read by the reading's own page on the client; the tag
 * dropped is the one the phone's query cache holds it under.
 */

/** The one tag a bookmark is cached under: the phone's. */
function dropCache() {
  revalidateTag(tags.bookmarks, 'max')
}

const text = (v: unknown) => (typeof v === 'string' ? v : '')

/** The reading a request names: a lesson or a resource, never both. */
function readingIn(source: { lessonId?: unknown; resourceId?: unknown }): ReadingRef | null {
  const lessonId = text(source.lessonId).trim()
  const resourceId = text(source.resourceId).trim()
  if (lessonId && !resourceId) return { lessonId }
  if (resourceId && !lessonId) return { resourceId }
  return null
}

const fail = (e: unknown) =>
  NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })

/** The bookmark in one reading, or null. */
export async function GET(req: Request) {
  const userId = await ownerId()
  if (!userId) return NextResponse.json({ error: 'not signed in' }, { status: 401 })

  const query = new URL(req.url).searchParams
  const where = readingIn({
    lessonId: query.get('lessonId') ?? undefined,
    resourceId: query.get('resourceId') ?? undefined,
  })
  if (!where) {
    return NextResponse.json({ error: 'lessonId or resourceId is required' }, { status: 400 })
  }

  const parent = parentOf(where)
  const { data, error } = await supabaseAdmin()
    .from('bookmarks')
    .select('lesson_id, resource_id, words, prefix, at, updated_at')
    .eq('user_id', userId)
    .eq(parent.column, parent.id)
    .maybeSingle()
  if (error) return fail(error.message)
  return NextResponse.json({ bookmark: data ?? null })
}

/** Drop the bookmark, or move it: there is only ever one. */
export async function POST(req: Request) {
  const userId = await ownerId()
  if (!userId) return NextResponse.json({ error: 'not signed in' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const where = readingIn(body)
  if (!where) {
    return NextResponse.json({ error: 'lessonId or resourceId is required' }, { status: 400 })
  }

  // Held to what `placeAt` ever writes, with room for the page having
  // collapsed its whitespace differently.
  const words = text(body.words).trim().slice(0, PLACE_WORDS * 2)
  const prefix = text(body.prefix).slice(-PLACE_PREFIX * 2)
  const at = typeof body.at === 'number' && Number.isFinite(body.at) ? body.at : NaN
  if (!words) return NextResponse.json({ error: 'a bookmark needs the words it marks' }, { status: 400 })
  if (!(at >= 0 && at <= 1)) {
    return NextResponse.json({ error: 'at is a fraction of the reading, 0 to 1' }, { status: 400 })
  }

  const db = supabaseAdmin()
  // Only a reading the reader owns: the admin client would otherwise
  // write against anyone's.
  if (!(await readingOf(db, userId, where))) {
    return NextResponse.json({ error: 'That is not there to bookmark.' }, { status: 404 })
  }

  const parent = parentOf(where)
  const { data, error } = await db
    .from('bookmarks')
    .upsert(
      {
        user_id: userId,
        [parent.column]: parent.id,
        words,
        prefix,
        at,
        updated_at: new Date().toISOString(),
      },
      { onConflict: `user_id,${parent.column}` }
    )
    .select('lesson_id, resource_id, words, prefix, at, updated_at')
    .single()
  if (error) return fail(error.message)
  dropCache()
  return NextResponse.json({ bookmark: data })
}

/** Take the bookmark out of a reading. Nothing there is not an error. */
export async function DELETE(req: Request) {
  const userId = await ownerId()
  if (!userId) return NextResponse.json({ error: 'not signed in' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const where = readingIn(body)
  if (!where) {
    return NextResponse.json({ error: 'lessonId or resourceId is required' }, { status: 400 })
  }

  const parent = parentOf(where)
  const { error } = await supabaseAdmin()
    .from('bookmarks')
    .delete()
    .eq('user_id', userId)
    .eq(parent.column, parent.id)
  if (error) return fail(error.message)
  dropCache()
  return NextResponse.json({ ok: true })
}
