import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { generateLessonBody } from '@/lib/llm/curriculum'
import { revalidateTag } from 'next/cache'
import { tags } from '@/lib/tags'

/**
 * Drop what this route just changed.
 *
 * The cache is only safe because every write says what it touched.
 * Erring wide is deliberate: serving a stale map is the one failure
 * this app cannot afford, and re-reading a sheet costs a few hundred
 * milliseconds once.
 */
function dropCache() {
  for (const tag of [tags.topics]) revalidateTag(tag, 'max')
}


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

  const [{ data: topic }, { data: siblings }, { data: sources }, { data: filed }] =
    await Promise.all([
      db.from('topics').select('title').eq('id', curriculum.topic_id).single(),
      db.from('lessons').select('title, position, completed_at')
        .eq('curriculum_id', curriculum.id).order('position'),
      db.from('curriculum_sources').select('resources(title, summary, url)')
        .eq('curriculum_id', curriculum.id),
      // Everything filed against the topic, so the lesson can point at
      // material the reader already has rather than sending them off to
      // find something new.
      db.from('resource_topics')
        .select('resources(title, summary, url, status)')
        .eq('topic_id', curriculum.topic_id),
    ])

  // Material filed against the topic's neighbours in the same subjects.
  // A reader's library is not sorted the way the map is: the article
  // that explains settlement may be filed under custody, and a lesson
  // that can only see its own topic cannot reach it. These are offered
  // as the further shelf rather than as the near one, so the prompt can
  // prefer what was filed here.
  const { data: memberships } = await db.from('topic_subjects')
    .select('subject_id').eq('topic_id', curriculum.topic_id)
  const subjectIds = (memberships ?? []).map(m => m.subject_id)

  const { data: siblingTopics } = subjectIds.length
    ? await db.from('topic_subjects').select('topic_id').in('subject_id', subjectIds)
    : { data: [] }
  const nearbyIds = [
    ...new Set((siblingTopics ?? []).map(t => t.topic_id)),
  ].filter(t => t !== curriculum.topic_id)

  const { data: nearby } = nearbyIds.length
    ? await db.from('resource_topics')
        .select('resources(title, summary, url, status)')
        .in('topic_id', nearbyIds)
        .limit(40)
    : { data: [] }

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
        s.resources
          ? [s.resources as unknown as {
              title: string; summary: string | null; url: string | null
            }]
          : []
      ),
      library: (filed ?? []).flatMap(r =>
        r.resources
          ? [r.resources as unknown as {
              title: string; summary: string | null; url: string | null; status: string
            }]
          : []
      ),
      nearby: dedupe(
        (nearby ?? []).flatMap(r =>
          r.resources
            ? [r.resources as unknown as {
                title: string; summary: string | null; url: string | null; status: string
              }]
            : []
        ),
        (filed ?? []).flatMap(r =>
          r.resources ? [(r.resources as unknown as { title: string }).title] : []
        )
      ),
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    dropCache()
    return NextResponse.json(
      { error: message },
      { status: message.includes('ANTHROPIC_API_KEY') ? 503 : 502 }
    )
  }

  const { error } = await db.from('lessons').update({ body }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  dropCache()
  return NextResponse.json({ body, cached: false })
}

/** Drop anything already offered on the near shelf, and any repeat. */
function dedupe<T extends { title: string }>(rows: T[], already: string[]): T[] {
  const seen = new Set(already)
  const out: T[] = []
  for (const row of rows) {
    if (seen.has(row.title)) continue
    seen.add(row.title)
    out.push(row)
  }
  return out
}
