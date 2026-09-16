import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { ownerId } from '@/lib/auth'
import { sowClozes } from '@/lib/clozes'
import { revalidateTag } from 'next/cache'
import { tags } from '@didactic/core/tags'

/**
 * Drop what this route just changed.
 *
 * The garden and nothing else: planting trackers writes no exposure
 * and moves no figure on the map. What changes is what is due, which
 * every running head prints.
 */
function dropCache() {
  revalidateTag(tags.clozes, 'max')
}

/**
 * Read a worked lesson and plant what is worth keeping.
 *
 * Fired when the lesson is marked read or worked -- not when it is
 * skimmed, which is by definition not an exposure worth asking about.
 * It is a model call over the whole body, so it is set going on the
 * bench rather than awaited by the sheet: the reader has just finished
 * a lesson and is walking away, and nothing here is work they should
 * be made to stand and watch.
 *
 * Idempotent. A lesson marked worked, un-marked and marked again finds
 * its concepts already standing and asks the model nothing.
 *
 * `more` is the reader asking, from "Tend this lesson", for another
 * reading. It **adds**: the model is handed every question the lesson
 * already asks and writes the ones it does not, and nothing standing is
 * deleted. Until 046 this flag was `regenerate` and it replaced the
 * agent's concepts and their cards outright -- which meant the only way
 * to get better cards was to throw away the review history of the ones
 * you had, and that history is the only evidence of what the reader
 * holds. The old name is still read, and now means what the new one
 * means, because nothing that sends it wanted the deletion either.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const userId = await ownerId()
  if (!userId) return NextResponse.json({ error: 'not signed in' }, { status: 401 })

  const body = await req.json().catch(() => ({}))

  try {
    const sown = await sowClozes(supabaseAdmin(), userId, id, {
      more: Boolean(body?.more ?? body?.regenerate),
    })
    // Nothing was planted on a second visit, so nothing went stale.
    if (!sown.already) dropCache()
    return NextResponse.json(sown)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    )
  }
}
