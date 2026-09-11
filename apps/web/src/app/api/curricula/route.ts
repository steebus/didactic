import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { proposeCurriculum } from '@/lib/llm/curriculum'
import { findPrereqCycle } from '@didactic/core/curriculum'
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


const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'lesson'

/**
 * Draft a curriculum for a topic. The agent proposes; the result is
 * saved as a draft and nothing about it counts until the user approves
 * it. Reference material the user has already filed can be handed in as
 * `sourceResourceIds` to steer the shape.
 */
export async function POST(req: Request) {
  const { topicId, goal, sourceResourceIds } = await req.json()
  if (!topicId) return NextResponse.json({ error: 'topicId is required' }, { status: 400 })

  const db = supabaseAdmin()

  const { data: topic } = await db.from('topics')
    .select('id, user_id, title, summary, ability, ability_confidence')
    .eq('id', topicId).single()
  if (!topic) return NextResponse.json({ error: 'topic not found' }, { status: 404 })

  const sourceIds: string[] = Array.isArray(sourceResourceIds) ? sourceResourceIds : []

  const [{ data: memberships }, { data: prereqEdges }, { data: sourceRows }] = await Promise.all([
    db.from('topic_subjects').select('subjects(title)').eq('topic_id', topicId),
    // Topics the graph says come first. Their current levels are what
    // stop the curriculum re-teaching ground already held.
    db.from('edges').select('from_topic').eq('to_topic', topicId).eq('kind', 'prereq'),
    sourceIds.length
      ? db.from('resources').select('id, title, summary').in('id', sourceIds)
      : Promise.resolve({ data: [] as Array<{ id: string; title: string; summary: string | null }> }),
  ])

  const prereqIds = (prereqEdges ?? []).map(e => e.from_topic)
  const { data: prereqTopics } = prereqIds.length
    ? await db.from('topics').select('title, ability').in('id', prereqIds)
    : { data: [] }

  let proposal
  try {
    proposal = await proposeCurriculum({
      subjectTitles: (memberships ?? []).flatMap(m =>
        (m.subjects as unknown as Array<{ title: string }> | { title: string } | null) == null
          ? []
          : [(m.subjects as unknown as { title: string }).title]
      ),
      topicTitle: topic.title,
      topicSummary: topic.summary,
      ability: Number(topic.ability),
      abilityConfidence: Number(topic.ability_confidence),
      goal: typeof goal === 'string' && goal.trim() ? goal.trim() : null,
      sources: (sourceRows ?? []).map(r => ({ title: r.title, note: null, summary: r.summary })),
      prerequisiteTopics: (prereqTopics ?? []).map(t => ({
        title: t.title,
        ability: Number(t.ability),
      })),
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    dropCache()
    return NextResponse.json(
      { error: message },
      { status: message.includes('ANTHROPIC_API_KEY') ? 503 : 502 }
    )
  }

  if (proposal.lessons.length === 0) {
    return NextResponse.json(
      { error: 'The draft came back empty. Try saying what you want out of it.' },
      { status: 502 }
    )
  }

  const { data: curriculum, error: curriculumError } = await db.from('curricula').insert({
    user_id: topic.user_id,
    topic_id: topic.id,
    title: proposal.title,
    goal: typeof goal === 'string' && goal.trim() ? goal.trim() : null,
    shape: proposal.shape,
    status: 'draft',
    created_by: 'ai',
  }).select('*').single()
  if (curriculumError) {
    return NextResponse.json({ error: curriculumError.message }, { status: 500 })
  }

  // Slugs are unique per curriculum, and two proposed keys can slugify
  // to the same thing. Suffix collisions rather than losing a lesson.
  const seen = new Set<string>()
  const rows = proposal.lessons.map((lesson, i) => {
    let slug = slugify(lesson.key)
    while (seen.has(slug)) slug = `${slugify(lesson.key)}-${seen.size}`
    seen.add(slug)
    return {
      user_id: topic.user_id,
      curriculum_id: curriculum.id,
      topic_id: topic.id,
      title: lesson.title,
      slug,
      summary: lesson.summary || null,
      position: i,
      stage: lesson.stage,
      estimated_minutes: lesson.estimated_minutes,
      created_by: 'ai' as const,
    }
  })

  const { data: lessons, error: lessonError } = await db.from('lessons')
    .insert(rows).select('id, slug')
  if (lessonError) {
    await db.from('curricula').delete().eq('id', curriculum.id)
    return NextResponse.json({ error: lessonError.message }, { status: 500 })
  }

  const idBySlug = new Map((lessons ?? []).map(l => [l.slug, l.id]))
  const idByKey = new Map(
    proposal.lessons.map((lesson, i) => [lesson.key, idBySlug.get(rows[i].slug)!])
  )

  const prereqRows = proposal.lessons.flatMap(lesson =>
    lesson.requires
      .map(key => idByKey.get(key))
      .filter((id): id is string => Boolean(id))
      .map(requires_lesson_id => ({
        lesson_id: idByKey.get(lesson.key)!,
        requires_lesson_id,
      }))
  )

  // A cycle would leave lessons that can never become available. Drop
  // the whole prerequisite set rather than saving an unreachable plan;
  // the curriculum is still a usable list, and the user is told.
  const cycle = findPrereqCycle(prereqRows)
  if (!cycle && prereqRows.length > 0) {
    const { error } = await db.from('lesson_prereqs').insert(prereqRows)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  dropCache()
  return NextResponse.json({
    curriculumId: curriculum.id,
    lessonsCreated: rows.length,
    shape: proposal.shape,
    droppedPrereqs: cycle
      ? 'The draft looped back on itself, so the ordering was left out. Set it yourself, or draft again.'
      : null,
  })
}
