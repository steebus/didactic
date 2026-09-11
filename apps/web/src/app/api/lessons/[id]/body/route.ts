import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { generateLessonBody, ROUNDS_MAX } from '@/lib/llm/curriculum'
import { lessonsWithinReach } from '@/lib/curriculum'
import { revalidateTag } from 'next/cache'
import { tags } from '@didactic/core/tags'

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
 * Writing a lesson is a model call, and a lesson that runs into the
 * token ceiling is a second one to finish it. The platform's default
 * cuts that off part way through and what reaches the browser is an
 * empty body rather than a lesson.
 *
 * Sixty seconds rather than more: it is the ceiling on the cheapest
 * plan, and asking for more than the plan allows is refused at deploy
 * rather than granted at runtime.
 */
export const maxDuration = 60

/**
 * Write one round of the lesson.
 *
 * Most drafted lessons are never reached and a reshaped curriculum
 * invalidates anything written early, so the body is generated on first
 * open and cached on the row. Pass `regenerate` to start again on one
 * the reader was not happy with.
 *
 * One round, not one lesson. A full lesson takes longer to generate
 * than the sixty seconds this function is allowed, so asking for all of
 * it in one request meant being cut off part way with nothing saved.
 * Each call writes as much as fits, saves it, and says whether there is
 * more; the caller comes back for the rest. Which also makes it
 * resumable -- a reader who reloads mid-way finds the rounds so far on
 * the row, and the next call carries on from them rather than starting
 * the lesson again.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { regenerate } = await req.json().catch(() => ({ regenerate: false }))
  const db = supabaseAdmin()

  const { data: lesson } = await db.from('lessons').select('*').eq('id', id).single()
  if (!lesson) return NextResponse.json({ error: 'not found' }, { status: 404 })

  // Finished and not being asked for again: there is nothing to do.
  if (lesson.body && lesson.body_finished && !regenerate) {
    return NextResponse.json({
      body: lesson.body,
      cached: true,
      done: true,
      round: lesson.body_rounds ?? 1,
      words: words(lesson.body),
    })
  }

  // What has been written so far, unless this is a fresh start.
  const carried: string = regenerate ? '' : (lesson.body ?? '')
  const roundsSoFar: number = regenerate ? 0 : (lesson.body_rounds ?? 0)

  // A lesson the model will not stop writing is called finished rather
  // than billed for indefinitely. What is on the row is real prose and
  // readable; it simply stops sooner than it meant to.
  if (roundsSoFar >= ROUNDS_MAX) {
    await db.from('lessons').update({ body_finished: true }).eq('id', id)
    dropCache()
    return NextResponse.json({
      body: carried,
      cached: false,
      done: true,
      round: roundsSoFar,
      words: words(carried),
      warning: 'The lesson ran long and was stopped where it stands.',
    })
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

  // The lessons this one may point at, so the body can be written into
  // a map rather than into a page on its own. The same reading the
  // reader's own request makes, so what is offered here is what will
  // resolve there.
  const links = await lessonsWithinReach(db, curriculum.topic_id, id)

  let written: { text: string; finished: boolean }
  try {
    written = await generateLessonBody({
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
      links,
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
    },
    carried
    )
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    dropCache()
    return NextResponse.json(
      { error: message },
      { status: message.includes('ANTHROPIC_API_KEY') ? 503 : 502 }
    )
  }

  const round = roundsSoFar + 1
  const { error } = await db
    .from('lessons')
    .update({
      body: written.text,
      body_finished: written.finished,
      body_rounds: round,
    })
    .eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Only a finished lesson changes what any sheet prints: until then
  // `has_body` is still false and the stamp still reads "Not written".
  // Dropping the cache on every round would re-read the whole map three
  // times for one lesson.
  if (written.finished) dropCache()

  return NextResponse.json({
    body: written.text,
    cached: false,
    done: written.finished,
    round,
    words: words(written.text),
  })
}

/** Roughly, for the reader. Whitespace-separated runs are close enough
 *  to a word count for a progress note and cost nothing to count. */
function words(text: string): number {
  const trimmed = text.trim()
  return trimmed ? trimmed.split(/\s+/).length : 0
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
