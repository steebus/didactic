import type { SupabaseClient } from '@supabase/supabase-js'
import { keptReading, readKept } from '@didactic/core/resolution'
import { fetchCandidates } from './resolver'
import { judge, keyOf } from './ingest'

/**
 * How many queued topics one opening of the queue has read: about three
 * hundred options, four requests side by side, well inside the route's
 * minute. A longer queue is read over the next few openings rather than
 * in one call that runs out of time and keeps nothing.
 */
const AT_ONCE = 12

export interface Reread {
  /** Read as their own topics, and taken out of the queue. */
  released: number
  /** Kept in the queue, now asked against the topic the reading chose. */
  read: number
  /** Why nothing could be read, where nothing could. */
  warning: string | null
}

/**
 * Read the topics that were queued on wording alone.
 *
 * Ingestion queues a concept on its title's nearness to an existing one
 * when the reading of its description fails or runs out of time, and in
 * this embedding model a field's titles all sit near each other:
 * "Hash Functions" is 0.83 from "JavaScript", "Set Membership Testing"
 * 0.86 from "End-to-End Testing". So each is read now, exactly as a new
 * concept would have been (`ingest.judge`), against the map as it
 * stands:
 *
 * - read as its own topic, it is taken out of the queue -- which is
 *   what ingestion would have done -- and filed where the reading
 *   placed it;
 * - read as one already there, or unsure, it stays, and is asked
 *   against the topic the reading chose, with what it said (`058`).
 *
 * Nothing is merged here. A merge cannot be undone, and the person is
 * looking at the queue: a reading sure they are one thing says so and
 * leaves the press to them.
 *
 * Before 058 there is nowhere to keep what was read, so nothing is: it
 * would be read again on every opening.
 */
export async function rereadPending(db: SupabaseClient, userId: string): Promise<Reread> {
  const nothing: Reread = { released: 0, read: 0, warning: null }

  const { data } = await db
    .from('topics')
    .select('*')
    .eq('user_id', userId)
    .eq('state', 'pending')
    .order('created_at', { ascending: false })
  const rows = data ?? []
  if (rows.length === 0 || !('pending_reading' in rows[0])) return nothing

  // A reading whose topic has since been merged away or thrown out asks
  // about nothing, and is read again like one never read.
  const asked = [...new Set(rows.flatMap(topic => readKept(topic.pending_reading)?.against ?? []))]
  const { data: standing } = asked.length
    ? await db.from('topics').select('id').in('id', asked).eq('state', 'active')
    : { data: [] }
  const onMap = new Set(((standing ?? []) as Array<{ id: string }>).map(t => t.id))
  const answered = (value: unknown) => {
    const kept = readKept(value)
    return kept !== null && kept.against !== null && onMap.has(kept.against)
  }

  const unread = rows
    .filter(topic => !answered(topic.pending_reading))
    .map(topic => ({ topic, vector: vectorOf(topic.embedding) }))
    .filter((t): t is { topic: typeof t.topic; vector: number[] } => t.vector !== null)
    .slice(0, AT_ONCE)
  if (unread.length === 0) return nothing

  const searched = await Promise.all(
    unread.map(async ({ topic, vector }) => ({
      concept: { name: topic.title as string, description: (topic.summary as string | null) ?? null },
      vector,
      candidates: await fetchCandidates(db, vector),
    }))
  )

  const warnings: string[] = []
  const verdicts = await judge(db, {
    userId,
    resourceTitle: 'Topics already brought in, waiting to be told whether they are new',
    searched,
    warnings,
  })
  if (!verdicts) return { ...nothing, warning: warnings[0] ?? 'The reading came back with nothing to go on.' }

  let released = 0
  let read = 0
  await Promise.all(
    unread.map(async ({ topic }, i) => {
      const verdict = verdicts.get(keyOf(i))
      if (!verdict) return
      const kept = keptReading(verdict.reading)

      if (verdict.reading.action !== 'create') {
        const { error } = await db.from('topics').update({ pending_reading: kept }).eq('id', topic.id)
        if (!error) read++
        return
      }

      const { error } = await db
        .from('topics')
        .update({ state: 'active', pending_reading: kept })
        .eq('id', topic.id)
        .eq('state', 'pending')
      if (error) return
      released++
      // Filed where the reading placed it, as ingestion files a topic it
      // creates (045). None is an answer too: it stands alone, on the
      // loose sheet, which says where it looks like it goes.
      if (verdict.subjects.length > 0) {
        await db.from('topic_subjects').upsert(
          verdict.subjects.map(subjectId => ({ topic_id: topic.id, subject_id: subjectId, created_by: 'ai' as const })),
          { onConflict: 'topic_id,subject_id', ignoreDuplicates: true }
        )
      }
    })
  )

  return { released, read, warning: warnings[0] ?? null }
}

function vectorOf(value: unknown): number[] | null {
  if (Array.isArray(value)) return value as number[]
  if (typeof value !== 'string') return null
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}
