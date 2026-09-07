import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import type { LessonStage } from '@/lib/types'

const STAGES: LessonStage[] = ['introductory', 'core', 'advanced']

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'lesson'

/** Add a lesson by hand. The user can always add to what the agent
 *  drafted, which is what makes the curriculum theirs. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const body = await req.json()
  const db = supabaseAdmin()

  const title = typeof body.title === 'string' ? body.title.trim() : ''
  if (!title) return NextResponse.json({ error: 'title is required' }, { status: 400 })

  const { data: curriculum } = await db.from('curricula')
    .select('id, user_id, topic_id').eq('id', id).single()
  if (!curriculum) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const { data: existing } = await db.from('lessons')
    .select('slug, position').eq('curriculum_id', id)

  const taken = new Set((existing ?? []).map(l => l.slug))
  let slug = slugify(title)
  while (taken.has(slug)) slug = `${slugify(title)}-${taken.size}`

  const position = body.position !== undefined
    ? Number(body.position)
    : Math.max(-1, ...(existing ?? []).map(l => l.position)) + 1

  const { data: lesson, error } = await db.from('lessons').insert({
    user_id: curriculum.user_id,
    curriculum_id: id,
    // A hand-added lesson teaches this topic unless it is explicitly
    // marked as scaffolding, which teaches nothing and moves nothing.
    topic_id: body.scaffolding === true ? null : curriculum.topic_id,
    title,
    slug,
    summary: typeof body.summary === 'string' ? body.summary : null,
    position,
    stage: STAGES.includes(body.stage) ? body.stage : 'core',
    estimated_minutes: Number.isFinite(body.estimated_minutes)
      ? Math.round(body.estimated_minutes)
      : null,
    created_by: 'user',
  }).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const requires: string[] = Array.isArray(body.requires) ? body.requires : []
  if (requires.length > 0) {
    const { error: prereqError } = await db.from('lesson_prereqs')
      .insert(requires.map(requires_lesson_id => ({
        lesson_id: lesson.id,
        requires_lesson_id,
      })))
    if (prereqError) {
      return NextResponse.json({ error: prereqError.message }, { status: 500 })
    }
  }

  return NextResponse.json({ lesson })
}
