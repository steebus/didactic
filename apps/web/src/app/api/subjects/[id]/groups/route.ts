import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { supabaseAdmin } from '@/lib/supabase'
import { ownerId } from '@/lib/auth'
import { groupTheBed } from '@/lib/llm/grouping'
import { tags } from '@didactic/core/tags'

/**
 * The boxes a bed is read in.
 *
 * Groups are the second axis of a subject: subject matter across,
 * complexity down. The order was always there -- `033` keeps it and the
 * outline prints it -- and it could never say which topics are about
 * the same thing.
 *
 * POST proposes them with one model call over the whole bed and writes
 * what it proposed. PATCH is every hand edit afterwards: rename,
 * reorder, move a topic between boxes, make an empty one. DELETE takes
 * a box away and leaves its topics in the bed.
 *
 * The split is deliberate. Proposing costs a model call and half a
 * minute; renaming a box must never wait on either.
 */

/** Drop what a write here changed. The bed's shape lives on the subject
 *  sheet and in the phone's copy of it. */
function dropCache() {
  for (const tag of [tags.subjects, tags.topics]) revalidateTag(tag, 'max')
}

/** One model call over the whole bed, the same ceiling relating one
 *  takes, and for the same reason. */
export const maxDuration = 60

/** The bed's boxes as the sheet will print them back. */
async function readGroups(db: ReturnType<typeof supabaseAdmin>, subjectId: string) {
  const { data } = await db
    .from('topic_groups').select('id, title, position')
    .eq('subject_id', subjectId).order('position')
  return (data ?? []).map(g => ({
    id: g.id as string,
    title: g.title as string,
    position: Number(g.position),
  }))
}

/**
 * Propose groups for the bed, and write them.
 *
 * Every group this subject already has goes first: proposing is laying
 * the bed out again, not adding a second set of boxes beside the ones
 * already there. Deleting them sets their members' `group_id` to null
 * through the foreign key, so no topic is lost on the way.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: subjectId } = await params

  const userId = await ownerId()
  if (!userId) return NextResponse.json({ error: 'not signed in' }, { status: 401 })

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY not set, so the bed cannot be grouped yet.' },
      { status: 503 }
    )
  }

  const db = supabaseAdmin()
  const { data: subject } = await db
    .from('subjects').select('id, title, user_id').eq('id', subjectId).single()
  if (!subject) return NextResponse.json({ error: 'no such subject' }, { status: 404 })

  const { data: memberships } = await db
    .from('topic_subjects').select('topic_id').eq('subject_id', subjectId)
  const topicIds = (memberships ?? []).map(m => m.topic_id as string)

  if (topicIds.length < 3) {
    return NextResponse.json(
      { error: 'There is not enough here to group yet. Sow a few more topics first.' },
      { status: 409 }
    )
  }

  const { data: topics } = await db
    .from('topics').select('id, title, summary').in('id', topicIds)

  let proposed
  try {
    proposed = await groupTheBed({
      subjectTitle: subject.title as string,
      topics: (topics ?? []).map(t => ({
        id: t.id as string,
        title: t.title as string,
        summary: (t.summary as string | null) ?? null,
      })),
    })
  } catch (e) {
    return NextResponse.json(
      { error: `The bed could not be read: ${e instanceof Error ? e.message : String(e)}` },
      { status: 502 }
    )
  }

  if (proposed.length === 0) {
    return NextResponse.json({
      groups: await readGroups(db, subjectId),
      grouped: 0,
      note: 'Nothing here groups cleanly, so the bed is left as one list.',
    })
  }

  // Out with the old boxes first. Their topics stay: `group_id` is
  // `on delete set null`, which is the whole of what deleting a group
  // has ever meant.
  await db.from('topic_groups').delete().eq('subject_id', subjectId)

  const { data: made, error: makeError } = await db.from('topic_groups').insert(
    proposed.map((g, position) => ({
      user_id: userId,
      subject_id: subjectId,
      title: g.title,
      position,
      created_by: 'ai' as const,
    }))
  ).select('id, title, position')

  if (makeError) {
    return NextResponse.json({ error: makeError.message }, { status: 500 })
  }

  // A multi-row insert answers in the order it was given, which is how
  // each proposal finds the row it became. Title is the fallback for
  // the case that cannot happen, exactly as `commit_ingestion` does it.
  const rows = made ?? []
  const idFor = (i: number): string | null => {
    if (rows.length === proposed.length) return rows[i].id as string
    const byTitle = rows.find(r => r.title === proposed[i].title)
    return (byTitle?.id as string) ?? null
  }

  let grouped = 0
  for (const [i, group] of proposed.entries()) {
    const groupId = idFor(i)
    if (!groupId || group.topicIds.length === 0) continue
    const { error } = await db.from('topic_subjects')
      .update({ group_id: groupId })
      .eq('subject_id', subjectId)
      .in('topic_id', group.topicIds)
    if (!error) grouped += group.topicIds.length
  }

  dropCache()

  return NextResponse.json({
    groups: await readGroups(db, subjectId),
    grouped,
    note: null,
  })
}

/**
 * Every hand edit to the boxes.
 *
 * One handler rather than four routes because they are one operation
 * from the reader's side -- arranging the bed -- and each is a single
 * statement. They are applied in a fixed order so one call can make a
 * group and put a topic into it.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: subjectId } = await params

  const userId = await ownerId()
  if (!userId) return NextResponse.json({ error: 'not signed in' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const db = supabaseAdmin()

  const { data: subject } = await db
    .from('subjects').select('id').eq('id', subjectId).single()
  if (!subject) return NextResponse.json({ error: 'no such subject' }, { status: 404 })

  // Make a box. Empty is how one starts: the reader names it and then
  // moves topics into it, so an empty group is a step rather than a
  // mistake to be cleaned up after.
  if (typeof body.create === 'string') {
    const title = body.create.trim()
    if (!title) return NextResponse.json({ error: 'A group needs a name.' }, { status: 400 })

    const { data: last } = await db
      .from('topic_groups').select('position')
      .eq('subject_id', subjectId).order('position', { ascending: false }).limit(1)
    const position = last && last.length > 0 ? Number(last[0].position) + 1 : 0

    const { error } = await db.from('topic_groups').insert({
      user_id: userId, subject_id: subjectId, title, position, created_by: 'user' as const,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Rename one.
  if (typeof body.groupId === 'string' && typeof body.title === 'string') {
    const title = body.title.trim()
    if (!title) return NextResponse.json({ error: 'A group needs a name.' }, { status: 400 })
    const { error } = await db.from('topic_groups')
      .update({ title }).eq('id', body.groupId).eq('subject_id', subjectId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Reorder the boxes. The whole order arrives rather than a swap:
  // positions have never been guaranteed distinct -- a bed sown before
  // `033`, or grown by hand, is full of ties -- so they are renumbered
  // 0..n-1 and the move means the same thing whatever it started from.
  if (Array.isArray(body.groupOrder)) {
    const ids = body.groupOrder.filter((x: unknown): x is string => typeof x === 'string')
    for (const [position, id] of ids.entries()) {
      await db.from('topic_groups')
        .update({ position }).eq('id', id).eq('subject_id', subjectId)
    }
  }

  // Move a topic into a box, or out of every box. Null is a real
  // destination here rather than a missing argument: it is how a topic
  // is taken out of a group and left loose in the bed.
  if (typeof body.topicId === 'string' && 'into' in body) {
    const into = typeof body.into === 'string' ? body.into : null
    const { error } = await db.from('topic_subjects')
      .update({ group_id: into })
      .eq('subject_id', subjectId).eq('topic_id', body.topicId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Reorder the topics themselves, on the membership where the bed's
  // own order has always lived.
  if (Array.isArray(body.topicOrder)) {
    const ids = body.topicOrder.filter((x: unknown): x is string => typeof x === 'string')
    for (const [position, id] of ids.entries()) {
      await db.from('topic_subjects')
        .update({ position }).eq('subject_id', subjectId).eq('topic_id', id)
    }
  }

  dropCache()
  return NextResponse.json({ groups: await readGroups(db, subjectId) })
}

/**
 * Take a box away.
 *
 * The topics in it stay in the bed and become loose, through the
 * `on delete set null` on the membership. A group is a way of reading
 * the bed, never a container that owns what is in it, so throwing one
 * away can never take a topic with it.
 */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: subjectId } = await params

  const userId = await ownerId()
  if (!userId) return NextResponse.json({ error: 'not signed in' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const groupId = typeof body.groupId === 'string' ? body.groupId : ''
  if (!groupId) return NextResponse.json({ error: 'groupId is required' }, { status: 400 })

  const db = supabaseAdmin()
  const { error } = await db.from('topic_groups')
    .delete().eq('id', groupId).eq('subject_id', subjectId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  dropCache()
  return NextResponse.json({ groups: await readGroups(db, subjectId) })
}
