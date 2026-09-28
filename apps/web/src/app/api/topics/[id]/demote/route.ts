import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { ownerId } from '@/lib/auth'
import { revalidateTag } from 'next/cache'
import { tags } from '@didactic/core/tags'

/** Demoting moves a topic's whole history onto another and deletes the
 *  row. Marks and cards move with it, so their sheets go too. */
function dropCache() {
  for (const tag of [tags.subjects, tags.topics, tags.pending, tags.highlights, tags.clozes]) {
    revalidateTag(tag, { expire: 0 })
  }
}

/**
 * Demote a topic into another topic's route, as a lesson in it.
 *
 * The mirror of promoting, and the destructive one. Everything the topic
 * holds — its material, its reading log, the passages marked under it,
 * the cards being tended from it — moves onto the target first, and the
 * row is then deleted, so the only thing lost is the name. The name
 * survives as the lesson's title, which is the point of doing this
 * rather than merging.
 *
 * Gated in the database on the topic having no curriculum, for the
 * reason `044` gives: with no lessons of its own there is no approved
 * plan to invalidate and no prereq graph to rewrite.
 *
 * Cannot be undone, exactly like a merge, and the sheet says so before
 * the press rather than after it.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await ownerId()
  if (!userId) return NextResponse.json({ error: 'not signed in' }, { status: 401 })

  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const into = typeof body.intoTopicId === 'string' ? body.intoTopicId.trim() : ''

  if (!into) {
    return NextResponse.json({ error: 'intoTopicId is required' }, { status: 400 })
  }

  const db = supabaseAdmin()

  // Both ends have to be the caller's. Every route is behind the gate,
  // but a write that folds one owner's topic into another's should be
  // impossible rather than merely unreachable.
  const { data: ends } = await db
    .from('topics').select('id, title').eq('user_id', userId).in('id', [id, into])

  if ((ends ?? []).length !== 2) {
    return NextResponse.json({ error: 'no such topic' }, { status: 404 })
  }

  const target = (ends ?? []).find(t => t.id === into)

  // Folded with a ledger (062), so it can be unfolded from the target's
  // sheet. Before 062 there is only the old, one-way demote.
  let foldId: string | null = null
  let lessonId: string | null = null
  const folded = await db.rpc('fold_topic_into', { p_topic: id, p_into: into })
  if (folded.error?.code === 'PGRST202' || folded.error?.code === '42883') {
    const demoted = await db.rpc('demote_topic_into', { p_topic: id, p_into: into })
    if (demoted.error) return NextResponse.json({ error: sayWhy(demoted.error.message) }, { status: 400 })
    lessonId = demoted.data as string
  } else if (folded.error) {
    return NextResponse.json({ error: sayWhy(folded.error.message) }, { status: 400 })
  } else {
    foldId = folded.data as string
    const { data: fold } = await db.from('topic_folds').select('lesson_id').eq('id', foldId).maybeSingle()
    lessonId = (fold?.lesson_id as string | null) ?? null
  }

  dropCache()
  return NextResponse.json({
    lessonId,
    intoTopicId: into,
    intoTitle: target?.title ?? null,
    // Additive: the fold, which `POST /api/topics/[id]/unfold` undoes.
    foldId,
  })
}

/** The gate and the self-demote, said in the sheet's own words. */
function sayWhy(message: string): string {
  if (message.includes('has a route through it')) {
    return 'This topic has a route through it. A topic carrying lessons cannot change level — archive or delete the route first.'
  }
  if (message.includes('into itself')) {
    return 'That is the same topic on both sides, so there is nothing to demote.'
  }
  return message
}
