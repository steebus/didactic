import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { ownerId } from '@/lib/auth'
import { answerCloze } from '@/lib/clozes'
import { waitPhrase, type Rating } from '@didactic/core/fsrs'
import { revalidateTag } from 'next/cache'
import { tags } from '@didactic/core/tags'

/**
 * Drop what this route just changed.
 *
 * Only the garden. Answering a cloze is not an exposure and moves
 * nothing on the map: the map records what was read, and this records
 * what stuck. What goes stale is the tally in every running head.
 */
function dropCache() {
  revalidateTag(tags.clozes, 'max')
}

/**
 * Answer a cloze.
 *
 * The rating is a number on FSRS's own four-rung scale, not a word of
 * this app's. The Tend sheet offers three of the four; a client that
 * offers the fourth is scheduling on the same ruler rather than on a
 * variant of it, which is the whole reason the rungs travel as numbers.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const userId = await ownerId()
  if (!userId) return NextResponse.json({ error: 'not signed in' }, { status: 401 })

  const body = await req.json()
  const rating = Number(body.rating)
  if (![1, 2, 3, 4].includes(rating)) {
    return NextResponse.json({ error: 'rating must be 1, 2, 3 or 4' }, { status: 400 })
  }

  try {
    const done = await answerCloze(supabaseAdmin(), userId, id, rating as Rating)
    dropCache()
    return NextResponse.json({
      cloze: done.cloze,
      intervalDays: done.intervalDays,
      retrievability: done.retrievability,
      /** The wait, in words, so the sheet does not have to round it. */
      wait: waitPhrase(done.intervalDays),
    })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    )
  }
}
