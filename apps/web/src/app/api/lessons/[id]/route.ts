import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { completeLesson, lessonsWithinReach, uncompleteLesson } from '@/lib/curriculum'
import { citableRoster } from '@/lib/citations'
import { VALID_DEPTHS } from '@/lib/consume'
import type { ExposureDepth, LessonStage } from '@didactic/core/types'
import { ownerId } from '@/lib/auth'
import { revalidateTag } from 'next/cache'
import { tags } from '@didactic/core/tags'
import { lessonNeighbours } from '@didactic/core/lessonState'
import { answeredIn } from '@/lib/answers'

/**
 * Drop what this route just changed.
 *
 * The cache is only safe because every write says what it touched.
 * Erring wide is deliberate: serving a stale map is the one failure
 * this app cannot afford, and re-reading a sheet costs a few hundred
 * milliseconds once.
 */
function dropCache() {
  for (const tag of [tags.topics, tags.subjects, tags.highlights]) revalidateTag(tag, 'max')
}


const STAGES: LessonStage[] = ['introductory', 'core', 'advanced']

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = supabaseAdmin()
  const userId = await ownerId()

  const { data: lesson } = await db.from('lessons').select('*').eq('id', id).single()
  if (!lesson) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const [
    { data: curriculum },
    { data: prereqs },
    { data: resources },
    { data: highlights },
    { data: route },
  ] = await Promise.all([
    db.from('curricula').select('id, title, goal, topic_id, status')
      .eq('id', lesson.curriculum_id).single(),
    db.from('lesson_prereqs').select('requires_lesson_id').eq('lesson_id', id),
    db.from('lesson_resources').select('relevance, resources(id, title, kind, url, status)')
      .eq('lesson_id', id),
    db.from('highlights').select('*').eq('lesson_id', id).order('created_at'),
    // The route this lesson sits in, in the order it is meant to be
    // worked, so the foot of the reading can offer the way on. Titles
    // and ids only: the neighbours are two links, not two lessons.
    db.from('lessons').select('id, title, position, has_body')
      .eq('curriculum_id', lesson.curriculum_id).order('position'),
  ])

  const requiredIds = (prereqs ?? []).map(p => p.requires_lesson_id)
  const { data: required } = requiredIds.length
    ? await db.from('lessons').select('id, title, completed_at').in('id', requiredIds)
    : { data: [] }

  const { data: topic } = curriculum
    ? await db.from('topics').select('id, title').eq('id', curriculum.topic_id).single()
    : { data: null }

  // What the body's `lesson:` names resolve against. Read here rather
  // than frozen into the body when it was written: a curriculum is
  // reshaped and a lesson is grubbed out long after its neighbours
  // were written, and a link that has stopped reaching anything should
  // say so. See `@didactic/core/lessonLinks`.
  const links = curriculum ? await lessonsWithinReach(db, curriculum.topic_id, id) : []

  // And what the body's `source:` names resolve against, read at the
  // same moment and for the same reason: a document taken off the shelf
  // should turn its citations into stubs rather than leave them looking
  // like citations that still reach something.
  const sources = curriculum
    ? await citableRoster(db, { curriculumId: curriculum.id, topicId: curriculum.topic_id })
    : []

  return NextResponse.json({
    lesson,
    curriculum,
    topic,
    resources: resources ?? [],
    highlights: highlights ?? [],
    requires: required ?? [],
    links,
    sources,
    // The way on, at the foot of the reading. Derived from the route
    // rather than stored, so reshaping the route reorders these with
    // it.
    neighbours: lessonNeighbours(route ?? [], id),
    // Which of this lesson's questions have been answered before.
    // Without it a question answered yesterday reads as fresh today and
    // the reader is promised a boost that has already been paid.
    answered: userId ? await answeredIn(db, userId, id) : {},
    // Availability is derived, so the page never has to trust a stored flag.
    available: (required ?? []).every(r => r.completed_at !== null),
  })
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  const db = supabaseAdmin()

  // Completion goes through the exposure log, so it is its own action
  // rather than a field the client can set.
  if (body.action === 'complete') {
    const depth: ExposureDepth = VALID_DEPTHS.includes(body.depth) ? body.depth : 'read'
    try {
      const result = await completeLesson(db, id, depth)
      return NextResponse.json({ ok: true, ...result })
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : String(e) },
        { status: 500 }
      )
    }
  }

  if (body.action === 'uncomplete') {
    try {
      await uncompleteLesson(db, id)
      return NextResponse.json({ ok: true })
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : String(e) },
        { status: 500 }
      )
    }
  }

  const patch: Record<string, unknown> = {}
  if (body.title !== undefined) patch.title = body.title
  if (body.summary !== undefined) patch.summary = body.summary
  if (body.body !== undefined) patch.body = body.body
  if (body.position !== undefined) patch.position = Number(body.position)
  if (STAGES.includes(body.stage)) patch.stage = body.stage
  if (body.estimated_minutes !== undefined) {
    patch.estimated_minutes = Number.isFinite(body.estimated_minutes)
      ? Math.round(body.estimated_minutes)
      : null
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'nothing to update' }, { status: 400 })
  }

  const { error } = await db.from('lessons').update(patch).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  dropCache()
  return NextResponse.json({ ok: true })
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  // The owner comes from the session, never from the request. Every
  // route is behind the gate, but a delete that does not say whose row
  // it is deleting is one refactor away from being wrong.
  const userId = await ownerId()
  if (!userId) return NextResponse.json({ error: 'not signed in' }, { status: 401 })

  const { id } = await params
  // Marks taken in the lesson go with it, and the exposure it wrote
  // stays: it records that the work happened, which is still true.
  const { error } = await supabaseAdmin()
    .from('lessons')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  dropCache()
  return NextResponse.json({ ok: true })
}
