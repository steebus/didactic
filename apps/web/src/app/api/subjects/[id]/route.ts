import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { ownerId } from '@/lib/auth'
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
  for (const tag of [tags.subjects, tags.topics, tags.resources, tags.highlights]) revalidateTag(tag, 'max')
}


/** What deleting a subject would take with it, and what it would leave. */
async function reckon(db: ReturnType<typeof supabaseAdmin>, subjectId: string) {
  const { data: filed } = await db.from('topic_subjects')
    .select('topic_id').eq('subject_id', subjectId)
  const topicIds = (filed ?? []).map(t => t.topic_id)

  if (topicIds.length === 0) {
    return { topicIds: [], goingIds: [], keptElsewhere: 0, curricula: 0, lessons: 0, marks: 0, resources: 0, exposures: 0 }
  }

  // A topic filed under more than this subject is not this subject's to
  // delete: exposure belongs to portrait and to landscape photography
  // both. Those keep everything and simply lose one filing.
  const { data: allFilings } = await db.from('topic_subjects')
    .select('topic_id, subject_id').in('topic_id', topicIds)
  const elsewhere = new Set(
    (allFilings ?? []).filter(f => f.subject_id !== subjectId).map(f => f.topic_id)
  )
  const goingIds = topicIds.filter(t => !elsewhere.has(t))

  if (goingIds.length === 0) {
    return { topicIds, goingIds, keptElsewhere: elsewhere.size, curricula: 0, lessons: 0, marks: 0, resources: 0, exposures: 0 }
  }

  const [{ data: curricula }, { data: marks }, { data: exposures }, { data: resourceLinks }] =
    await Promise.all([
      db.from('curricula').select('id').in('topic_id', goingIds),
      db.from('highlights').select('id').in('topic_id', goingIds),
      db.from('exposures').select('id').in('topic_id', goingIds),
      db.from('resource_topics').select('resource_id').in('topic_id', goingIds),
    ])

  const curriculumIds = (curricula ?? []).map(c => c.id)
  const { data: lessons } = curriculumIds.length
    ? await db.from('lessons').select('id').in('curriculum_id', curriculumIds)
    : { data: [] }

  return {
    topicIds,
    goingIds,
    keptElsewhere: elsewhere.size,
    curricula: curriculumIds.length,
    lessons: (lessons ?? []).length,
    marks: (marks ?? []).length,
    exposures: (exposures ?? []).length,
    resources: new Set((resourceLinks ?? []).map(r => r.resource_id)).size,
  }
}

/**
 * What would go, without going.
 *
 * The sheet asks before it acts, and a warning that cannot count is a
 * warning nobody can weigh. This is the same reckoning the delete
 * itself runs.
 */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await ownerId()
  if (!userId) return NextResponse.json({ error: 'not signed in' }, { status: 401 })

  const { id } = await params
  const db = supabaseAdmin()

  const { data: subject } = await db.from('subjects')
    .select('id, title, user_id').eq('id', id).single()
  if (!subject) return NextResponse.json({ error: 'not found' }, { status: 404 })
  if (subject.user_id !== userId) {
    return NextResponse.json({ error: 'not yours' }, { status: 403 })
  }

  const count = await reckon(db, id)
  return NextResponse.json({
    title: subject.title,
    topics: count.goingIds.length,
    topicsKeptElsewhere: count.keptElsewhere,
    curricula: count.curricula,
    lessons: count.lessons,
    marks: count.marks,
    exposures: count.exposures,
    resources: count.resources,
  })
}

/**
 * Grubbing out a bed.
 *
 * The planting goes: every topic filed only here, the routes through
 * them, and those routes' lessons. A topic that also sits under another
 * subject is not this subject's to delete, so it keeps everything and
 * loses one filing.
 *
 * Two things are deliberately kept and left orphaned rather than
 * destroyed:
 *
 * - **Marked passages.** A lesson body is regenerable and a topic can
 *   be sown again, but nobody can reconstruct which sentence struck a
 *   reader as worth keeping. They are detached first so the cascade
 *   cannot reach them, and the Marked sheet still prints a passage with
 *   no lesson and no topic.
 * - **Resources.** The library is a shelf, not a subject's property.
 *   The filing goes; the material stays, and shows on the Library sheet
 *   as filed against no topic.
 *
 * The exposure log does go with its topics. It is the working behind a
 * figure that no longer exists, and keeping rows that point at nothing
 * would leave the map explaining a number it can no longer show.
 */
export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await ownerId()
  if (!userId) return NextResponse.json({ error: 'not signed in' }, { status: 401 })

  const { id } = await params
  const db = supabaseAdmin()

  const { data: subject } = await db.from('subjects')
    .select('id, title, user_id').eq('id', id).single()
  if (!subject) return NextResponse.json({ error: 'not found' }, { status: 404 })
  if (subject.user_id !== userId) {
    return NextResponse.json({ error: 'not yours' }, { status: 403 })
  }

  const count = await reckon(db, id)

  // Marks come off their topic before anything is deleted. The column
  // is `set null` now, but doing it explicitly means the passage
  // survives even if a future migration tightens that back up.
  if (count.goingIds.length > 0 && count.marks > 0) {
    const { error: markError } = await db.from('highlights')
      .update({ topic_id: null })
      .in('topic_id', count.goingIds)
    if (markError) {
      return NextResponse.json(
        { error: `the marked passages could not be set aside: ${markError.message}` },
        { status: 500 }
      )
    }
  }

  // The topics themselves, which takes curricula, lessons and the
  // exposure rows behind them.
  if (count.goingIds.length > 0) {
    const { error: topicError } = await db.from('topics')
      .delete().in('id', count.goingIds).eq('user_id', userId)
    if (topicError) {
      return NextResponse.json({ error: topicError.message }, { status: 500 })
    }
  }

  const { error } = await db.from('subjects')
    .delete().eq('id', id).eq('user_id', userId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  dropCache()
  return NextResponse.json({
    ok: true,
    title: subject.title,
    topicsRemoved: count.goingIds.length,
    topicsKeptElsewhere: count.keptElsewhere,
    curriculaRemoved: count.curricula,
    lessonsRemoved: count.lessons,
    marksKept: count.marks,
    resourcesKept: count.resources,
  })
}
