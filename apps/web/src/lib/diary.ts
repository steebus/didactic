/**
 * The learning diary.
 *
 * An entry is a highlight with no quote and no lesson -- see
 * `040_diary.sql` for why it is the same row rather than a table of its
 * own. What is different is not the shape but what the app does with
 * it: a mark is a passage someone kept, and an entry is a page about a
 * week, written to be read back.
 *
 * Writing one is deliberately cheap. The entry is saved, what it names
 * is indexed, and the reading of it happens later on the queue -- so
 * the reader closes the sheet the moment they have finished typing,
 * which is the case the bench exists for.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { config } from '@didactic/core/config'
import type { ExposureDepth, Highlight } from '@didactic/core/types'
import type { HighlightRow } from '@didactic/core/shapes'
import { fileTags } from './highlights'
import { recomputeAbilities, recomputeAbility } from './scoring'
import { depthOf, readEntry, type Reading } from './llm/diary'

const SELECT = '*, lesson:lessons(id, title), topic:topics(id, title)'

/**
 * Write an entry.
 *
 * `topicId` is where the reader was standing when they pressed the
 * button, kept so the entry files under that topic the way a mark files
 * under the lesson it was taken from. It is a starting point and not a
 * claim: what the entry is actually *about* is what it names, which is
 * indexed from the prose by the same `fileTags` every note goes through.
 *
 * No exposure is written here. Nothing has read the entry yet, and
 * guessing at a depth from the fact that someone typed something would
 * be exactly the flattery the map exists to avoid.
 */
export async function createEntry(
  db: SupabaseClient,
  input: { userId: string; note: string; topicId?: string | null }
): Promise<{ entry: Highlight }> {
  const note = input.note.trim()
  if (!note) throw new Error('An entry needs something in it.')

  // A topic the owner does not hold is dropped rather than refused:
  // the entry is the thing worth keeping, and filing it under nothing
  // loses a caption rather than the writing.
  let topicId: string | null = null
  if (input.topicId) {
    const { data } = await db.from('topics')
      .select('id')
      .eq('id', input.topicId)
      .eq('user_id', input.userId)
      .maybeSingle()
    topicId = data?.id ?? null
  }

  const { data: entry, error } = await db.from('highlights')
    .insert({
      user_id: input.userId,
      kind: 'diary',
      lesson_id: null,
      topic_id: topicId,
      quote: null,
      prefix: null,
      note,
    })
    .select('*')
    .single()
  if (error) throw new Error(error.message)

  // As with a mark: the entry is written, and indexing what it names is
  // the lesser half of the job. It is not worth losing someone's
  // writing over.
  try {
    await fileTags(db, input.userId, entry.id, note)
  } catch (e) {
    console.error('diary: could not file what the entry names', e)
  }

  return { entry }
}

/**
 * The entries filed under one topic, newest first.
 *
 * Both ends count: the topic the entry was written from, and every
 * topic the entry names. Someone writing about settlement while
 * standing on custody has written about settlement, and the settlement
 * sheet should say so -- which is the whole reason `highlight_tags`
 * exists.
 */
export async function entriesForTopic(
  db: SupabaseClient,
  userId: string,
  topicId: string
): Promise<HighlightRow[]> {
  const { data: tagged } = await db.from('highlight_tags')
    .select('highlight_id')
    .eq('user_id', userId)
    .eq('topic_id', topicId)

  const ids = (tagged ?? []).map(t => t.highlight_id)

  // `or` rather than two reads and a merge: one of the two conditions
  // is an index lookup and the other is a list of ids, and Postgres is
  // better at that union than this module would be.
  const filter = ids.length
    ? `topic_id.eq.${topicId},id.in.(${ids.join(',')})`
    : `topic_id.eq.${topicId}`

  const { data } = await db.from('highlights')
    .select(SELECT)
    .eq('kind', 'diary')
    .or(filter)
    .order('created_at', { ascending: false })

  return (data ?? []) as unknown as HighlightRow[]
}

/**
 * Read an entry back and record what it shows.
 *
 * Runs on the queue, behind the bench, after the entry is already
 * saved. Everything here is best-effort in the sense that the entry
 * survives whatever happens: the writing is the record, and what the
 * app made of it is a reading over the top.
 *
 * Only the topics the entry names are considered, and only those the
 * owner actually holds. A verdict of `mentioned` writes nothing, which
 * is the common case and is meant to be.
 */
export async function readBack(
  db: SupabaseClient,
  userId: string,
  entryId: string
): Promise<{ recorded: number }> {
  const { data: entry } = await db.from('highlights')
    .select('id, note, kind, user_id')
    .eq('id', entryId)
    .eq('user_id', userId)
    .maybeSingle()
  if (!entry || entry.kind !== 'diary' || !entry.note) return { recorded: 0 }

  // What the entry names, resolved to titles the model can read.
  const { data: tags } = await db.from('highlight_tags')
    .select('topic_id, topic:topics(id, title)')
    .eq('highlight_id', entryId)
    .not('topic_id', 'is', null)

  const topics = (tags ?? [])
    .map(t => (t as unknown as { topic: { id: string; title: string } | null }).topic)
    .filter((t): t is { id: string; title: string } => Boolean(t))
  if (topics.length === 0) return { recorded: 0 }

  const readings = await readEntry(entry.note, topics)

  const rows = readings
    .map(r => ({ reading: r, depth: depthOf(r.verdict) }))
    .filter((r): r is { reading: Reading; depth: ExposureDepth } => r.depth !== null)
    .map(({ reading, depth }) => ({
      user_id: userId,
      topic_id: reading.topicId,
      source: 'diary' as const,
      source_id: entryId,
      depth,
      ability_delta: config.DEPTH_WEIGHTS[depth],
      // The reader's own words, so the topic sheet explains its figure
      // without anyone opening the diary to find out why it moved.
      reason: reading.because
        ? `diary: "${reading.because}"`
        : 'from a diary entry',
    }))

  if (rows.length === 0) return { recorded: 0 }

  // Written once. A re-read of the same entry replaces what the last
  // one said rather than stacking a second opinion on top of it: the
  // entry has not changed, so the app should not end up with two
  // readings of it in the log.
  await db.from('exposures').delete().eq('source', 'diary').eq('source_id', entryId)

  const { error } = await db.from('exposures').insert(rows)
  if (error) throw new Error(error.message)

  await recomputeAbilities(db, [...new Set(rows.map(r => r.topic_id))])
  return { recorded: rows.length }
}

/**
 * What an entry wrote, so it can be shown on the entry and taken back.
 *
 * The undo is the whole reason the parse is allowed to run unattended
 * -- see the plan. An exposure the reader disagrees with is one press
 * from gone, and the figure recomputes from the log without it.
 */
export async function exposuresFor(
  db: SupabaseClient,
  userId: string,
  entryId: string
): Promise<Array<{ id: string; depth: string; reason: string; topic: { id: string; title: string } | null }>> {
  const { data } = await db.from('exposures')
    .select('id, depth, reason, topic:topics(id, title)')
    .eq('user_id', userId)
    .eq('source', 'diary')
    .eq('source_id', entryId)
    .order('created_at', { ascending: true })

  return (data ?? []) as unknown as Array<{
    id: string
    depth: string
    reason: string
    topic: { id: string; title: string } | null
  }>
}

/**
 * Take one of them back.
 *
 * The exposure is deleted and the topic recomputed, which is the whole
 * of it: ability is a cache over the log, so removing the row is
 * removing the claim. Scoped to the owner and to `source = 'diary'`, so
 * this can never reach an exposure written by reading or by tending.
 */
export async function revoke(
  db: SupabaseClient,
  userId: string,
  exposureId: string
): Promise<{ topicId: string | null }> {
  const { data: exposure } = await db.from('exposures')
    .select('id, topic_id')
    .eq('id', exposureId)
    .eq('user_id', userId)
    .eq('source', 'diary')
    .maybeSingle()
  if (!exposure) return { topicId: null }

  const { error } = await db.from('exposures').delete().eq('id', exposureId)
  if (error) throw new Error(error.message)

  await recomputeAbility(db, exposure.topic_id)
  return { topicId: exposure.topic_id }
}
