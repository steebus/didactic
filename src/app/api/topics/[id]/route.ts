import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { computeFreshness } from '@/lib/scoring'

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = supabaseAdmin()

  const [
    { data: topic },
    { data: exposures },
    { data: resources },
    { data: edges },
    { data: memberships },
    { data: curricula },
  ] = await Promise.all([
    db.from('topics').select('*').eq('id', id).single(),
    db.from('exposures').select('*').eq('topic_id', id).order('created_at', { ascending: false }),
    db.from('resource_topics').select('relevance, resources(*)').eq('topic_id', id),
    db.from('edges').select('from_topic, to_topic, kind, weight')
      .or(`from_topic.eq.${id},to_topic.eq.${id}`),
    db.from('topic_subjects').select('subjects(id, title, colour)').eq('topic_id', id),
    db.from('curricula').select('*').eq('topic_id', id).order('created_at', { ascending: false }),
  ])

  if (!topic) return NextResponse.json({ error: 'not found' }, { status: 404 })

  // One count query per curriculum would be a round trip each; the
  // lesson rows are small and a topic carries a handful of curricula.
  const curriculumIds = (curricula ?? []).map(c => c.id)
  const { data: lessons } = curriculumIds.length
    ? await db.from('lessons').select('id, curriculum_id, completed_at')
        .in('curriculum_id', curriculumIds)
    : { data: [] }

  return NextResponse.json({
    topic: {
      ...topic,
      ability: Number(topic.ability),
      ability_confidence: Number(topic.ability_confidence),
      freshness: computeFreshness(topic.last_exposure_at, Number(topic.ability)),
    },
    subjects: (memberships ?? []).flatMap(m => m.subjects ?? []),
    exposures: exposures ?? [],
    resources: resources ?? [],
    edges: edges ?? [],
    curricula: (curricula ?? []).map(c => {
      const own = (lessons ?? []).filter(l => l.curriculum_id === c.id)
      return {
        ...c,
        lessonCount: own.length,
        completedCount: own.filter(l => l.completed_at !== null).length,
      }
    }),
  })
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  const db = supabaseAdmin()

  // Curation only. Ability is a rollup over exposures and is never
  // user-set: see PRODUCT.md, "Capabilities and Constraints".
  const patch: Record<string, unknown> = {}
  if (body.title !== undefined) patch.title = body.title
  if (body.summary !== undefined) patch.summary = body.summary
  if (body.primary_subject_id !== undefined) patch.primary_subject_id = body.primary_subject_id

  // Filing a topic under another subject is additive: it does not move
  // out of the ones it is already in. Removal is its own action.
  const addSubjects: string[] = Array.isArray(body.add_subject_ids) ? body.add_subject_ids : []
  const removeSubjects: string[] = Array.isArray(body.remove_subject_ids)
    ? body.remove_subject_ids
    : []

  if (Object.keys(patch).length === 0 && !addSubjects.length && !removeSubjects.length) {
    return NextResponse.json({ error: 'nothing to update' }, { status: 400 })
  }

  if (Object.keys(patch).length > 0) {
    const { error } = await db.from('topics').update(patch).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (addSubjects.length > 0) {
    const { error } = await db.from('topic_subjects').upsert(
      addSubjects.map(subject_id => ({ topic_id: id, subject_id, created_by: 'user' as const })),
      { onConflict: 'topic_id,subject_id', ignoreDuplicates: true }
    )
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (removeSubjects.length > 0) {
    const { error } = await db.from('topic_subjects')
      .delete().eq('topic_id', id).in('subject_id', removeSubjects)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { error } = await supabaseAdmin().from('topics').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
