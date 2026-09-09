import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { ownerId } from '@/lib/auth'
import { createHighlight, searchHighlights } from '@/lib/highlights'
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
  for (const tag of [tags.highlights, tags.topics, tags.subjects]) revalidateTag(tag, 'max')
}


/** Search, or browse when there is nothing to search for. */
export async function GET(req: Request) {
  const userId = await ownerId()
  if (!userId) return NextResponse.json({ error: 'not signed in' }, { status: 401 })

  const query = new URL(req.url).searchParams.get('q') ?? ''
  try {
    return NextResponse.json({ highlights: await searchHighlights(supabaseAdmin(), query) })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    )
  }
}

export async function POST(req: Request) {
  const userId = await ownerId()
  if (!userId) return NextResponse.json({ error: 'not signed in' }, { status: 401 })

  const body = await req.json()
  const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
  const quote = text(body.quote)
  const lessonId = text(body.lessonId)

  if (!lessonId) return NextResponse.json({ error: 'lessonId is required' }, { status: 400 })
  // A highlight of nothing is not a highlight. The cap is generous
  // enough for a long passage and mean enough that the whole lesson
  // cannot be stored as one mark.
  if (!quote) return NextResponse.json({ error: 'nothing was selected' }, { status: 400 })
  if (quote.length > 2000) {
    return NextResponse.json({ error: 'that passage is too long to mark' }, { status: 400 })
  }

  try {
    const result = await createHighlight(supabaseAdmin(), {
      userId,
      lessonId,
      quote,
      prefix: text(body.prefix) || null,
      note: text(body.note) || null,
    })
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    )
  }
}

export async function PATCH(req: Request) {
  const userId = await ownerId()
  if (!userId) return NextResponse.json({ error: 'not signed in' }, { status: 401 })

  const { id, note } = await req.json()
  if (typeof id !== 'string' || !id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }

  const { error } = await supabaseAdmin()
    .from('highlights')
    .update({ note: typeof note === 'string' ? note.trim() || null : null, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', userId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: Request) {
  const userId = await ownerId()
  if (!userId) return NextResponse.json({ error: 'not signed in' }, { status: 401 })

  const { id } = await req.json()
  if (typeof id !== 'string' || !id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }

  // The exposure the mark wrote is left where it is. It records that
  // the passage was read and thought about on the day it happened,
  // which stays true after the mark is tidied away -- and rewriting
  // history every time a note is deleted would make the figure
  // wander for reasons nobody could reconstruct.
  const { error } = await supabaseAdmin()
    .from('highlights')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  dropCache()
  return NextResponse.json({ ok: true })
}
