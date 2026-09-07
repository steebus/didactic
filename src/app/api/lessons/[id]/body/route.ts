import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { generateLessonBody } from '@/lib/llm/curriculum'

/**
 * Write the lesson, once. Most drafted lessons are never reached and a
 * reshaped curriculum invalidates anything written early, so the body is
 * generated on first open and cached on the row. Pass `regenerate` to
 * overwrite one the user was not happy with.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { regenerate } = await req.json().catch(() => ({ regenerate: false }))
  const db = supabaseAdmin()

  const { data: lesson } = await db.from('lessons').select('*').eq('id', id).single()
  if (!lesson) return NextResponse.json({ error: 'not found' }, { status: 404 })

  if (lesson.body && !regenerate) {
    return NextResponse.json({ body: lesson.body, cached: true })
  }

  const { data: curriculum } = await db.from('curricula')
    .select('id, title, goal, topic_id').eq('id', lesson.curriculum_id).single()
  if (!curriculum) return NextResponse.json({ error: 'curriculum not found' }, { status: 404 })

  const [{ data: topic }, { data: siblings }, { data: sources }] = await Promise.all([
    db.from('topics').select('title').eq('id', curriculum.topic_id).single(),
    db.from('lessons').select('title, position, completed_at')
      .eq('curriculum_id', curriculum.id).order('position'),
    db.from('curriculum_sources').select('resources(title, summary)')
      .eq('curriculum_id', curriculum.id),
  ])

  let body: string
  try {
    body = await generateLessonBody({
      topicTitle: topic?.title ?? 'this topic',
      curriculumTitle: curriculum.title,
      goal: curriculum.goal,
      lesson: {
        title: lesson.title,
        summary: lesson.summary,
        stage: lesson.stage,
        estimatedMinutes: lesson.estimated_minutes,
      },
      covered: (siblings ?? []).filter(s => s.completed_at !== null).map(s => s.title),
      sources: (sources ?? []).flatMap(s =>
        s.resources ? [s.resources as unknown as { title: string; summary: string | null }] : []
      ),
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json(
      { error: message },
      { status: message.includes('ANTHROPIC_API_KEY') ? 503 : 502 }
    )
  }

  const { error } = await db.from('lessons').update({ body }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ body, cached: false })
}
