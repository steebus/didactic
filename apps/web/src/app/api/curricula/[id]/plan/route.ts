import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { ownerId } from '@/lib/auth'
import { readPlan, reviseReasoning, appendEntry } from '@/lib/learningPlan'
import { revalidateTag } from 'next/cache'
import { tags } from '@didactic/core/tags'

/**
 * The learning plan for a course (`049`).
 *
 * The document every agent working on this course is shown: why it is
 * shaped the way it is, what the reader said about the subject when
 * they sowed it, and a line from each lesson saying what it actually
 * taught. It is the course's standing intent, and this is the half of
 * it the reader holds.
 *
 * Its own cache tag, and only its own. Nothing the map prints is read
 * from the plan — it is context for the next agent and a sheet of its
 * own — so dropping `topics` or the curriculum for a revision would
 * re-read the lessons to redraw nothing. But a revision does change
 * what the plan sheet shows, and a write that drops no tag at all is
 * the stale-map failure the endpoint table exists to prevent.
 *
 * Two ways to change it, and the split is deliberate. `reasoning` is
 * the argument and the reader may rewrite it outright. The log is a
 * record of what was actually written, and a record anyone can rewrite
 * is not one -- so a reader who disagrees with a line adds their own
 * beside it, marked as theirs, and both stand.
 */

/**
 * Drop what this route just changed.
 *
 * Only the plans. No sheet on the map reads one, so dropping `topics`
 * or the course would re-read the lessons to redraw nothing -- but a
 * revision does change what the plan sheet shows, and a write that
 * drops nothing at all is the stale-map failure the tag table exists
 * to prevent.
 */
function dropCache() {
  for (const tag of [tags.plans]) revalidateTag(tag, 'max')
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await ownerId()
  if (!userId) return NextResponse.json({ error: 'not signed in' }, { status: 401 })

  const { id } = await params
  const db = supabaseAdmin()

  // The owner is checked against the course rather than the plan, so a
  // course that has no plan yet answers 404 for a stranger and an empty
  // plan for its owner -- rather than telling the stranger which of the
  // two it was.
  const { data: curriculum } = await db
    .from('curricula')
    .select('id, title, user_id')
    .eq('id', id)
    .single()
  if (!curriculum || curriculum.user_id !== userId) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }

  return NextResponse.json({
    curriculumTitle: curriculum.title,
    plan: await readPlan(db, id),
  })
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await ownerId()
  if (!userId) return NextResponse.json({ error: 'not signed in' }, { status: 401 })

  const { id } = await params
  const body = (await req.json()) as { reasoning?: unknown; note?: unknown }
  const db = supabaseAdmin()

  const { data: curriculum } = await db
    .from('curricula')
    .select('id, user_id')
    .eq('id', id)
    .single()
  if (!curriculum || curriculum.user_id !== userId) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }

  if (typeof body.reasoning === 'string') {
    const ok = await reviseReasoning(db, id, body.reasoning)
    if (!ok) return NextResponse.json({ error: 'could not save the reasoning' }, { status: 500 })
  }

  if (typeof body.note === 'string' && body.note.trim()) {
    await appendEntry(db, id, { by: 'user', kind: 'note', body: body.note })
  }

  dropCache()
  return NextResponse.json({ plan: await readPlan(db, id) })
}
