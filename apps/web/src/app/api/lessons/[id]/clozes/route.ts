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
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const userId = await ownerId()
  if (!userId) return NextResponse.json({ error: 'not signed in' }, { status: 401 })

  const body = await req.json().catch(() => ({}))

  try {
    const sown = await sowClozes(supabaseAdmin(), userId, id, {
      regenerate: Boolean(body?.regenerate),
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
