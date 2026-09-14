import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { ownerId } from '@/lib/auth'
import { plates } from '@didactic/tokens'
import { revalidateTag } from 'next/cache'
import { tags } from '@didactic/core/tags'

/** Promoting writes a subject, a fistful of memberships and a new home
 *  for each of them. Every sheet that draws the map is stale after it. */
function dropCache() {
  for (const tag of [tags.subjects, tags.topics, tags.pending]) revalidateTag(tag, 'max')
}

/**
 * Promote a topic to a subject.
 *
 * Ingestion files what it reads at one level and cannot know which of
 * those is a bed you will spend a year in. This is the remedy, and it is
 * gated in the database on the topic having no curriculum: a route is a
 * plan someone approved and is working, and rehoming that is a different
 * and much larger operation than this one.
 *
 * The topic row survives the promotion. That is forced rather than
 * chosen — `exposures.topic_id` is not null and a subject is not
 * something you can have read, so consuming the row to avoid a subject
 * and a topic sharing a name would destroy the reading log. It is named
 * twice and everything is still there.
 */
export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await ownerId()
  if (!userId) return NextResponse.json({ error: 'not signed in' }, { status: 401 })

  const { id } = await params
  const db = supabaseAdmin()

  const { data: topic } = await db
    .from('topics').select('id, title, user_id').eq('id', id).eq('user_id', userId).maybeSingle()
  if (!topic) return NextResponse.json({ error: 'no such topic' }, { status: 404 })

  // The next plate along, which is how every subject gets its ink. The
  // list is `@didactic/tokens.plates` rather than a copy: the order is
  // data, and two copies of it had already fallen out of step.
  const { data: existing } = await db
    .from('subjects').select('id', { count: 'exact' }).eq('user_id', userId)
  const colour = plates[(existing?.length ?? 0) % plates.length]

  const { data: subjectId, error } = await db.rpc('promote_topic_to_subject', {
    p_topic: id,
    p_colour: colour,
  })

  if (error) return NextResponse.json({ error: sayWhy(error.message) }, { status: 400 })

  // What ended up in the new bed: the topic and whatever the outline
  // hung under it. Read back rather than predicted, because the walk
  // that decides it is the database's.
  const { count } = await db
    .from('topic_subjects')
    .select('topic_id', { count: 'exact', head: true })
    .eq('subject_id', subjectId)

  dropCache()
  return NextResponse.json({
    subjectId,
    title: topic.title,
    filed: count ?? 1,
  })
}

/**
 * The gate, said in the sheet's own words.
 *
 * A raw plpgsql `raise` reaching a reader mid-decision is the habit
 * `043` fixed for merging; the same applies here, and the reason for the
 * refusal is the useful part of it.
 */
function sayWhy(message: string): string {
  if (message.includes('has a route through it')) {
    return 'This topic has a route through it. A topic carrying lessons cannot change level — archive or delete the route first.'
  }
  return message
}
