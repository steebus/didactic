import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { ownerId } from '@/lib/auth'
import { recordAnswer } from '@/lib/answers'
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
  for (const tag of [tags.topics, tags.subjects]) revalidateTag(tag, 'max')
}

/**
 * Answer a question inside a lesson.
 *
 * A right answer the first time is worth a small boost to the topic's
 * figure; a wrong one costs nothing and a second answer to the same
 * question is worth nothing either way. The first-answer rule is
 * enforced by a unique index rather than by a read here, so two presses
 * racing each other cannot both count.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await ownerId()
  if (!userId) return NextResponse.json({ error: 'not signed in' }, { status: 401 })

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const key = typeof body.key === 'string' ? body.key.trim() : ''
  const correct = body.correct === true

  if (!key) return NextResponse.json({ error: 'key is required' }, { status: 400 })
  // The key is a hash from `questionKey`, so anything longer than one
  // is not a key. Bounded here rather than trusted, because it reaches
  // a text column.
  if (key.length > 64) {
    return NextResponse.json({ error: 'that is not a question key' }, { status: 400 })
  }

  try {
    const result = await recordAnswer(supabaseAdmin(), {
      userId,
      lessonId: id,
      questionKey: key,
      correct,
    })

    // Only a first right answer moves a figure, and only then is any
    // sheet out of date.
    if (result.exposureWritten) dropCache()
    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    )
  }
}
