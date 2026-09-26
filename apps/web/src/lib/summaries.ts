import type { SupabaseClient } from '@supabase/supabase-js'
import { config } from '@didactic/core/config'
import { sectionKey, summaryDepth } from '@didactic/core/summaries'
import type { Highlight } from '@didactic/core/types'
import { recomputeAbility } from './scoring'
import { fileTags } from './highlights'
import { parentOf, readingOf, type ReadingRef } from './reading'

export type { ReadingRef } from './reading'

/**
 * Summaries: a section, or a whole reading, said back in the reader's
 * own words.
 *
 * A summary is a mark of kind `summary` (053), so it is searched with
 * the marks, printed on the Marked sheet, and indexed for whatever its
 * note names -- all of which comes with the row. What is its own is
 * that there is one per section: writing another replaces the last,
 * because the point is the reader's current account of the section and
 * not a pile of drafts.
 */

/** Every summary written against one reading, oldest first. */
export async function summariesFor(
  db: SupabaseClient,
  userId: string,
  where: ReadingRef
): Promise<Highlight[]> {
  const parent = parentOf(where)
  const { data, error } = await db
    .from('highlights')
    .select('*')
    .eq('user_id', userId)
    .eq('kind', 'summary')
    .eq(parent.column, parent.id)
    .order('created_at')
  if (error) throw new Error(error.message)
  return (data ?? []) as Highlight[]
}

/**
 * Keep a summary, replacing whatever was said about that section
 * before.
 *
 * The first summary of a section writes the same light exposure a note
 * on a lesson does. The whole of the reading said back writes an
 * `applied` one -- as much as working with it (`core/summaries.
 * summaryDepth`). Neither is written twice: a second draft of one
 * paragraph is not a second reading, and a figure that climbed every
 * time someone fixed a typo would be a figure nobody could explain.
 */
export async function writeSummary(
  db: SupabaseClient,
  input: {
    userId: string
    where: ReadingRef
    section: string | null
    sectionAt: number | null
    note: string
  }
): Promise<{ summary: Highlight; created: boolean }> {
  const reading = await readingOf(db, input.userId, input.where)
  if (!reading) throw new Error('That is not there to summarise.')

  const parent = parentOf(input.where)
  const section = sectionKey(input.section)
  const note = input.note.trim()
  const now = new Date().toISOString()

  const findStanding = async () => {
    let query = db
      .from('highlights')
      .select('id')
      .eq('user_id', input.userId)
      .eq('kind', 'summary')
      .eq(parent.column, parent.id)
    query = section === null ? query.is('section', null) : query.eq('section', section)
    const { data } = await query.limit(1)
    return (data?.[0]?.id as string | undefined) ?? null
  }

  const replace = async (id: string) => {
    const { data, error } = await db
      .from('highlights')
      .update({
        note,
        section_at: section === null ? null : input.sectionAt,
        updated_at: now,
      })
      .eq('id', id)
      .eq('user_id', input.userId)
      .select('*')
      .single()
    if (error) throw new Error(error.message)
    return data as Highlight
  }

  let summary: Highlight
  let created = false

  const standing = await findStanding()
  if (standing) {
    summary = await replace(standing)
  } else {
    const { data, error } = await db
      .from('highlights')
      .insert({
        user_id: input.userId,
        kind: 'summary',
        [parent.column]: parent.id,
        topic_id: reading.topicId,
        quote: '',
        prefix: null,
        note,
        section,
        section_at: section === null ? null : input.sectionAt,
      })
      .select('*')
      .single()

    if (error) {
      // Two presses racing: the unique index (053) turned the second
      // away, and the first is now there to be replaced.
      const raced = error.code === '23505' ? await findStanding() : null
      if (!raced) throw new Error(error.message)
      summary = await replace(raced)
    } else {
      summary = data as Highlight
      created = true
    }
  }

  // What the note names is indexed from the note, as a mark's is. Not
  // worth failing a kept summary over.
  try {
    await fileTags(db, input.userId, summary.id, note)
  } catch (e) {
    console.error('summaries: could not file what the note names', e)
  }

  if (section !== null) {
    // A section said back: a light mark, once, as a note is.
    if (created && reading.topicId) {
      await db.from('exposures').insert({
        user_id: input.userId,
        topic_id: reading.topicId,
        source: 'highlight',
        source_id: summary.id,
        depth: summaryDepth(section),
        ability_delta: config.DEPTH_WEIGHTS[summaryDepth(section)],
        reason: `summarised "${section}" in "${reading.title}"`,
      })
      await recomputeAbility(db, reading.topicId)
    }
  } else {
    // The whole of it said back counts as working with it -- on every
    // topic the reading counts toward, once. Checked on a rewrite too,
    // so a resource filed under a new topic since picks it up there.
    await rewardWhole(db, input.userId, parent.id, reading)
  }

  return { summary, created }
}

/** Take a summary back. The exposure it wrote stays, for the reason a
 *  removed mark's does: it happened. */
export async function removeSummary(db: SupabaseClient, userId: string, id: string) {
  const { error } = await db
    .from('highlights')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)
    .eq('kind', 'summary')
  if (error) throw new Error(error.message)
}

/**
 * Write the `applied` exposure the whole of a reading said back earns,
 * on each of its topics that does not have it yet.
 *
 * Once per reading and topic, whatever happens to the summary: its
 * source is `summary` and its `source_id` is the reading, not the
 * summary row, so removing a summary and writing another finds the
 * exposure already standing. Like any exposure it outlives the thing
 * that wrote it -- the reader did say the reading back, on that day.
 *
 * Tolerant of the minutes between this code and 054: before the enum
 * has its value, the check finds nothing and the write falls back to a
 * `highlight` source at the same depth, so the reward still lands.
 */
async function rewardWhole(
  db: SupabaseClient,
  userId: string,
  readingId: string,
  reading: { title: string; topicIds: string[] }
) {
  if (reading.topicIds.length === 0) return

  const { data: standing } = await db
    .from('exposures')
    .select('topic_id')
    .eq('user_id', userId)
    .eq('source', 'summary')
    .eq('source_id', readingId)
  const held = new Set((standing ?? []).map(e => e.topic_id as string))
  const owed = reading.topicIds.filter(id => !held.has(id))

  for (const topicId of owed) {
    const row = {
      user_id: userId,
      topic_id: topicId,
      source_id: readingId,
      depth: summaryDepth(null),
      ability_delta: config.DEPTH_WEIGHTS[summaryDepth(null)],
      reason: `said "${reading.title}" back in their own words`,
    }
    const { error } = await db.from('exposures').insert({ ...row, source: 'summary' })
    if (error) await db.from('exposures').insert({ ...row, source: 'highlight' })
    await recomputeAbility(db, topicId)
  }
}
