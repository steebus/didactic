import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { viewLessons, curriculumProgress, findPrereqCycle, linearPrereqs } from '@/lib/curriculum'
import type { Lesson } from '@/lib/types'

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = supabaseAdmin()

  const { data: curriculum } = await db.from('curricula').select('*').eq('id', id).single()
  if (!curriculum) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const [{ data: lessons }, { data: topic }, { data: sources }] = await Promise.all([
    db.from('lessons').select('*').eq('curriculum_id', id).order('position'),
    db.from('topics').select('id, title, ability, ability_confidence, last_exposure_at')
      .eq('id', curriculum.topic_id).single(),
    db.from('curriculum_sources').select('note, resources(id, title, kind, url)')
      .eq('curriculum_id', id),
  ])

  const lessonIds = (lessons ?? []).map(l => l.id)
  const { data: prereqs } = lessonIds.length
    ? await db.from('lesson_prereqs').select('lesson_id, requires_lesson_id')
        .in('lesson_id', lessonIds)
    : { data: [] }

  return NextResponse.json({
    curriculum,
    topic,
    sources: sources ?? [],
    lessons: viewLessons((lessons ?? []) as Lesson[], prereqs ?? []),
    prereqs: prereqs ?? [],
    progress: curriculumProgress(lessons ?? []),
  })
}

/**
 * The user's edits. Everything here is curation: renaming, reordering,
 * rewiring what comes first, and approving. The agent drafts, the user
 * decides — PRODUCT.md principle 5.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  const db = supabaseAdmin()

  const patch: Record<string, unknown> = {}
  if (body.title !== undefined) patch.title = body.title
  if (body.goal !== undefined) patch.goal = body.goal
  if (body.shape !== undefined) patch.shape = body.shape
  if (body.status !== undefined) patch.status = body.status

  // Approving is what turns a proposal into a plan, and it is the only
  // thing that sets approved_at.
  if (body.action === 'approve') {
    patch.status = 'active'
    patch.approved_at = new Date().toISOString()
  }
  if (body.action === 'unapprove') {
    patch.status = 'draft'
    patch.approved_at = null
  }

  // Reordering: positions arrive as the full list of lesson ids in their
  // new order, so a partial list cannot silently renumber the rest.
  const order: string[] = Array.isArray(body.lessonOrder) ? body.lessonOrder : []

  // Rewiring: the complete prerequisite set replaces the old one, which
  // is the only way to express a removal.
  const prereqs: Array<{ lesson_id: string; requires_lesson_id: string }> =
    Array.isArray(body.prereqs) ? body.prereqs : []

  if (
    Object.keys(patch).length === 0 &&
    order.length === 0 &&
    body.prereqs === undefined &&
    body.action !== 'relinearise'
  ) {
    return NextResponse.json({ error: 'nothing to update' }, { status: 400 })
  }

  if (Object.keys(patch).length > 0) {
    patch.updated_at = new Date().toISOString()
    const { error } = await db.from('curricula').update(patch).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (order.length > 0) {
    for (const [position, lessonId] of order.entries()) {
      const { error } = await db.from('lessons')
        .update({ position }).eq('id', lessonId).eq('curriculum_id', id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }
  }

  // Chain every lesson to the one before it. Turning a branching draft
  // back into a straight line is a common enough correction to be one
  // action rather than a hand-built prereq set.
  if (body.action === 'relinearise') {
    const { data: lessons } = await db.from('lessons')
      .select('id').eq('curriculum_id', id).order('position')
    const rows = linearPrereqs((lessons ?? []).map(l => l.id))
    await db.from('lesson_prereqs').delete()
      .in('lesson_id', (lessons ?? []).map(l => l.id))
    if (rows.length > 0) {
      const { error } = await db.from('lesson_prereqs').insert(rows)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }
    await db.from('curricula').update({ shape: 'linear' }).eq('id', id)
  } else if (body.prereqs !== undefined) {
    const cycle = findPrereqCycle(prereqs)
    if (cycle) {
      return NextResponse.json(
        { error: 'That ordering loops back on itself, so some lessons could never open.', cycle },
        { status: 400 }
      )
    }
    const { data: lessons } = await db.from('lessons').select('id').eq('curriculum_id', id)
    const owned = new Set((lessons ?? []).map(l => l.id))
    if (prereqs.some(p => !owned.has(p.lesson_id) || !owned.has(p.requires_lesson_id))) {
      return NextResponse.json(
        { error: 'A prerequisite pointed outside this curriculum.' },
        { status: 400 }
      )
    }
    await db.from('lesson_prereqs').delete().in('lesson_id', [...owned])
    if (prereqs.length > 0) {
      const { error } = await db.from('lesson_prereqs').insert(prereqs)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { error } = await supabaseAdmin().from('curricula').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
