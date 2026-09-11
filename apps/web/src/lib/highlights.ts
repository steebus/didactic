import type { SupabaseClient } from '@supabase/supabase-js'
import { config } from '@didactic/core/config'
import { recomputeAbility } from './scoring'
import type { Highlight } from '@didactic/core/types'

// The shape moved to `@didactic/core/shapes`, where the phone can name
// it too; the query that builds it needs a client and the cache, so it
// stays here. Re-exported so `@/lib/highlights` still answers for both.
import type { HighlightRow } from '@didactic/core/shapes'

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
