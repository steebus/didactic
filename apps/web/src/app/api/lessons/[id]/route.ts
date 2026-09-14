import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { completeLesson, uncompleteLesson } from '@/lib/curriculum'
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


/**
 * An embedded row, as PostgREST types it.
 *
 * A `select` that follows a foreign key is typed as the row, an array
 * of the row, or null, depending on how much the generator could work
 * out. These two helpers flatten that back to what the shape actually
 * is at runtime -- one row for a to-one key, a list for a to-many --
 * rather than spreading the ambiguity across the handler.
 */
type Embedded<T> = T | T[] | null | undefined

function unwrap<T>(rows: Embedded<T>[]): T[] {
  return rows.flatMap(r => (Array.isArray(r) ? r : r ? [r] : []))
}

function one<T>(row: Embedded<T>): T | null {
  return (Array.isArray(row) ? row[0] : row) ?? null
}

type Topic = { id: string; title: string }
type PrereqLesson = { id: string; title: string; completed_at: string | null }
type CurriculumRow = { topics?: Embedded<Topic> }

const STAGES: LessonStage[] = ['introductory', 'core', 'advanced']

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = supabaseAdmin()

  // Auth runs alongside the lesson read rather than in front of it. It
  // is only needed for `answered`, and holding the whole sheet behind
  // it bought nothing.
  const [userId, { data: lesson }] = await Promise.all([
    ownerId(),
    db.from('lessons').select('*').eq('id', id).single(),
  ])
  if (!lesson) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const [
    { data: curriculum },
    { data: prereqs },
    { data: resources },
    { data: highlights },
    { data: route },
    answered,
  ] = await Promise.all([
    // The topic rides along on the curriculum rather than costing its
    // own round trip: it is one hop off it and the sheet wants both.
    db.from('curricula').select('id, title, goal, topic_id, status, topics(id, title)')
      .eq('id', lesson.curriculum_id).single(),
    // Likewise the prereq lessons themselves. The foreign key is named
    // because `lesson_prereqs` points at `lessons` twice and PostgREST
    // will not guess which side to follow.
    db.from('lesson_prereqs')
      .select('lessons!lesson_prereqs_requires_lesson_id_fkey(id, title, completed_at)')
      .eq('lesson_id', id),
    db.from('lesson_resources').select('relevance, resources(id, title, kind, url, status)')
      .eq('lesson_id', id),
    db.from('highlights').select('*').eq('lesson_id', id).order('created_at'),
    // The route this lesson sits in, in the order it is meant to be
    // worked, so the foot of the reading can offer the way on. Titles
    // and ids only: the neighbours are two links, not two lessons.
    db.from('lessons').select('id, title, position, has_body')
      .eq('curriculum_id', lesson.curriculum_id).order('position'),
    // Which of this lesson's questions have been answered before.
    // Without it a question answered yesterday reads as fresh today and
    // the reader is promised a boost that has already been paid.
    userId ? answeredIn(db, userId, id) : Promise.resolve({}),
  ])

  const required = unwrap<PrereqLesson>(
    (prereqs ?? []).map(p => (p as { lessons: Embedded<PrereqLesson> }).lessons)
  )
  const topic = one((curriculum as CurriculumRow | null)?.topics)

  return NextResponse.json({
    lesson,
    curriculum,
    topic,
    resources: resources ?? [],
    highlights: highlights ?? [],
    requires: required,
    // The way on, at the foot of the reading. Derived from the route
    // rather than stored, so reshaping the route reorders these with
    // it.
    neighbours: lessonNeighbours(route ?? [], id),
    answered,
    // Availability is derived, so the page never has to trust a stored flag.
    available: required.every(r => r.completed_at !== null),
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

  // The reader has been here.
  //
  // Its own action rather than a field, for the reason completion is:
  // the app decides when a lesson counts as opened, not the client, and
  // what it decides is *the first time and only the first*. Enforced in
  // the write -- `opened_at is null` -- so two sheets racing, or a
  // reader who reads a lesson every day for a week, cannot move it.
  //
  // Cheap by construction. It is fired on every open, so the ordinary
  // case is a no-op against an index, and the cache is dropped only
  // when a row actually changed: a standing that has already moved to
  // *opened* does not move again, and re-reading every topic sheet on
  // each open would cost more than the thing being recorded.
  if (body.action === 'open') {
    const { data: opened, error } = await db
      .from('lessons')
      .update({ opened_at: new Date().toISOString() })
      .eq('id', id)
      .is('opened_at', null)
      .select('id')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const first = (opened ?? []).length > 0
    if (first) dropCache()
    return NextResponse.json({ ok: true, first })
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
