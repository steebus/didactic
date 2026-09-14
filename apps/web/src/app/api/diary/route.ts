import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { ownerId } from '@/lib/auth'
import { createEntry } from '@/lib/diary'
import { revalidateTag } from 'next/cache'
import { tags } from '@didactic/core/tags'

/**
 * Drop what this route just changed.
 *
 * The same wide sweep the other write paths use: an entry lands on the
 * Marked timeline, and once it has been read back it moves figures on
 * the topic and subject sheets too.
 */
function dropCache() {
  for (const tag of [tags.highlights, tags.topics, tags.subjects]) revalidateTag(tag, 'max')
}

/**
 * Write a diary entry.
 *
 * The reading of it is not done here. It is a model call over prose,
 * which takes long enough that holding the response for it would make
 * saving an entry feel like submitting a form to a server in another
 * country -- which it is. So the entry is saved, the id comes back, and
 * the reading is set going by the client against
 * `/api/diary/[id]/read`, on the bench, where the reader can walk away
 * from it.
 */
export async function POST(req: Request) {
  const userId = await ownerId()
  if (!userId) return NextResponse.json({ error: 'not signed in' }, { status: 401 })

  const body = await req.json()
  const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
  const note = text(body.note)
  const topicId = text(body.topicId)

  if (!note) return NextResponse.json({ error: 'an entry needs something in it' }, { status: 400 })
  // Longer than a mark's note, and for the obvious reason: this is a
  // page about a week rather than a remark about a sentence. Mean
  // enough that a pasted document is refused.
  if (note.length > 50_000) {
    return NextResponse.json({ error: 'that entry is too long to keep' }, { status: 400 })
  }

  try {
    const { entry } = await createEntry(supabaseAdmin(), {
      userId,
      note,
      topicId: topicId || null,
    })
    dropCache()
    return NextResponse.json({ entry })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    )
  }
}
