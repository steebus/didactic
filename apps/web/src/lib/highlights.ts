import type { SupabaseClient } from '@supabase/supabase-js'
import { config } from './config'
import { recomputeAbility } from './scoring'
import type { Highlight } from './types'
import { tagsIn, type Tag } from './mentions'

/** A highlight with the lesson and topic it came from, for listing. */
export interface HighlightRow extends Highlight {
  lesson: { id: string; title: string } | null
  topic: { id: string; title: string } | null
}

const SELECT = '*, lesson:lessons(id, title), topic:topics(id, title)'

/**
 * Mark a passage, or write a note on the lesson.
 *
 * The quote is stored verbatim rather than as an offset into the
 * lesson body, because a body is regenerable and an offset into prose
 * that has been rewritten points at nothing. The highlight is the
 * record; finding it again in the text is a convenience that is
 * allowed to fail.
 *
 * An empty quote is a note on the lesson as a whole. It is a highlight
 * like any other -- it belongs to the topic, it is searched with the
 * rest and it counts the same -- except that there are no words to
 * draw it back onto.
 *
 * A highlight writes a very light exposure. Marking a sentence is
 * evidence you were there and thought something, not evidence you read
 * the piece, so the weight sits far below a skim and compounds through
 * the same log curve as everything else.
 */
export async function createHighlight(
  db: SupabaseClient,
  input: {
    userId: string
    lessonId: string
    quote: string
    prefix?: string | null
    note?: string | null
  }
): Promise<{ highlight: Highlight; abilityBefore: number | null; abilityAfter: number | null }> {
  const { data: lesson, error: lessonError } = await db.from('lessons')
    .select('id, title, topic_id, user_id')
    .eq('id', input.lessonId)
    .single()
  if (lessonError || !lesson) throw new Error('That lesson does not exist.')

  const { data: highlight, error } = await db.from('highlights')
    .insert({
      user_id: input.userId,
      lesson_id: input.lessonId,
      topic_id: lesson.topic_id,
      quote: input.quote,
      prefix: input.prefix ?? null,
      note: input.note ?? null,
    })
    .select('*')
    .single()
  if (error) throw new Error(error.message)

  // The mark is written. Indexing what its note names is the lesser
  // half of the job, and it is not worth failing a kept passage over
  // -- including on the deploy where the code is out and the table it
  // writes to is not yet.
  try {
    await fileTags(db, input.userId, highlight.id, input.note ?? null)
  } catch (e) {
    console.error('highlights: could not file what the note names', e)
  }

  // A scaffolding lesson teaches no single topic, so there is nothing
  // for the mark to count toward.
  if (!lesson.topic_id) {
    return { highlight, abilityBefore: null, abilityAfter: null }
  }

  const { data: before } = await db.from('topics')
    .select('ability').eq('id', lesson.topic_id).single()

  await db.from('exposures').insert({
    user_id: input.userId,
    topic_id: lesson.topic_id,
    source: 'highlight',
    source_id: highlight.id,
    depth: 'marked',
    ability_delta: config.DEPTH_WEIGHTS.marked,
    // A mark with no passage is a note on the lesson itself, and the
    // ledger should say which of the two happened rather than claim a
    // passage nobody selected.
    reason: input.quote
      ? `marked a passage in "${lesson.title}"`
      : `wrote a note on "${lesson.title}"`,
  })

  const after = await recomputeAbility(db, lesson.topic_id)
  return {
    highlight,
    abilityBefore: before ? Number(before.ability) : null,
    abilityAfter: after.ability,
  }
}

/**
 * Rewrite what a mark names, from the note it names it in.
 *
 * The note is the record: the reader put the name in a sentence and
 * that sentence is where it reads. This is only its index, kept so
 * the graph can draw the connection without re-reading every note
 * ever written to lay out the bed.
 *
 * Rewritten whole rather than diffed. A note is short, it is saved
 * whole, and one reading of it by one caller is what keeps the index
 * and the note from ever disagreeing.
 *
 * A name that points at something gone -- a grubbed-out topic, a
 * lesson from a reshaped route, a path someone typed by hand -- is
 * dropped from the index and left alone in the note. The sentence
 * still says what it said; there is simply nothing to draw.
 */
export async function fileTags(
  db: SupabaseClient,
  userId: string,
  highlightId: string,
  note: string | null
): Promise<Tag[]> {
  const named = tagsIn(note ?? '')

  await db.from('highlight_tags').delete().eq('highlight_id', highlightId)
  if (named.length === 0) return []

  const topicIds = named.filter(t => t.kind === 'topic').map(t => t.id)
  const lessonIds = named.filter(t => t.kind === 'lesson').map(t => t.id)

  // Scoped to the owner as well as to the id. The admin client is past
  // row-level security, so a tag is only ever allowed to reach a row
  // this user actually holds.
  const [{ data: topics }, { data: lessons }] = await Promise.all([
    topicIds.length
      ? db.from('topics').select('id').eq('user_id', userId).in('id', topicIds)
      : Promise.resolve({ data: [] as Array<{ id: string }> }),
    lessonIds.length
      ? db.from('lessons').select('id').eq('user_id', userId).in('id', lessonIds)
      : Promise.resolve({ data: [] as Array<{ id: string }> }),
  ])

  const real = new Set([
    ...(topics ?? []).map(t => `topic:${t.id}`),
    ...(lessons ?? []).map(l => `lesson:${l.id}`),
  ])
  const kept = named.filter(t => real.has(`${t.kind}:${t.id}`))
  if (kept.length === 0) return []

  const { error } = await db.from('highlight_tags').insert(
    kept.map(t => ({
      user_id: userId,
      highlight_id: highlightId,
      topic_id: t.kind === 'topic' ? t.id : null,
      lesson_id: t.kind === 'lesson' ? t.id : null,
    }))
  )
  if (error) throw new Error(error.message)

  return kept
}

/** Every highlight taken against one topic, newest first. */
export async function highlightsForTopic(
  db: SupabaseClient,
  topicId: string
): Promise<HighlightRow[]> {
  const { data } = await db.from('highlights')
    .select(SELECT)
    .eq('topic_id', topicId)
    .order('created_at', { ascending: false })
  return (data ?? []) as unknown as HighlightRow[]
}

/** Every highlight in one lesson, so the reader sees their own marks. */
export async function highlightsForLesson(
  db: SupabaseClient,
  lessonId: string
): Promise<HighlightRow[]> {
  const { data } = await db.from('highlights')
    .select(SELECT)
    .eq('lesson_id', lessonId)
    .order('created_at', { ascending: true })
  return (data ?? []) as unknown as HighlightRow[]
}

/**
 * Search the marks.
 *
 * Postgres full text over the quote and the note together, because
 * what is being looked for is as often what you wrote as what you
 * marked. An empty query browses instead of searching -- the list is
 * the point as much as the search is, and a search box that shows
 * nothing until typed into hides everything you have.
 */
export async function searchHighlights(
  db: SupabaseClient,
  query: string,
  limit = 100
): Promise<HighlightRow[]> {
  let request = db.from('highlights').select(SELECT)

  const trimmed = query.trim()
  if (trimmed) {
    // websearch syntax: quoted phrases and OR behave the way anyone
    // who has used a search box expects, and unparseable input is
    // tolerated rather than throwing.
    request = request.textSearch('search', trimmed, {
      type: 'websearch',
      config: 'english',
    })
  }

  const { data, error } = await request.order('created_at', { ascending: false }).limit(limit)
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as HighlightRow[]
}
