import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { completeLesson, uncompleteLesson } from '@/lib/curriculum'
import { VALID_DEPTHS } from '@/lib/consume'
import type { ExposureDepth, LessonStage } from '@/lib/types'

const STAGES: LessonStage[] = ['introductory', 'core', 'advanced']

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = supabaseAdmin()

  const { data: lesson } = await db.from('lessons').select('*').eq('id', id).single()
  if (!lesson) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const [{ data: curriculum }, { data: prereqs }, { data: resources }, { data: highlights }] =
    await Promise.all([
      db.from('curricula').select('id, title, goal, topic_id, status')
        .eq('id', lesson.curriculum_id).single(),
      db.from('lesson_prereqs').select('requires_lesson_id').eq('lesson_id', id),
      db.from('lesson_resources').select('relevance, resources(id, title, kind, url, status)')
        .eq('lesson_id', id),
      db.from('highlights').select('*').eq('lesson_id', id).order('created_at'),
    ])

  const requiredIds = (prereqs ?? []).map(p => p.requires_lesson_id)
  const { data: required } = requiredIds.length
    ? await db.from('lessons').select('id, title, completed_at').in('id', requiredIds)
    : { data: [] }

  const { data: topic } = curriculum
    ? await db.from('topics').select('id, title').eq('id', curriculum.topic_id).single()
    : { data: null }

  return NextResponse.json({
    lesson,
    curriculum,
    topic,
    resources: resources ?? [],
    highlights: highlights ?? [],
    requires: required ?? [],
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
  return NextResponse.json({ ok: true })
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { error } = await supabaseAdmin().from('lessons').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
