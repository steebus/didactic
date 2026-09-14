import type { SupabaseClient } from '@supabase/supabase-js'
import type { TopicEvidence } from '@didactic/core/shapes'

/**
 * What each topic is actually holding: the beds it sits in, what it was
 * drawn from, and whether anyone has ever read it.
 *
 * Written for the adjudication queue, where two topics that sound alike
 * are told apart by what has been filed against them rather than by
 * their wording. The loose stock sheet asks the same question for a
 * different reason -- what a delete would destroy -- so it lives here
 * rather than inside either caller.
 */

/** A topic holding nothing, which is the honest answer for one that
 *  arrived a minute ago and has never been read. */
export const EMPTY_EVIDENCE: TopicEvidence = {
  subjects: [],
  sources: [],
  resources: 0,
  lessons: 0,
  marks: 0,
  exposures: 0,
}

/** How many of a topic's sources are named before the rest are counted.
 *  Enough to recognise where a topic came from; short enough that one
 *  well-read topic does not bury the other twenty-four decisions. */
const SOURCES_NAMED = 3

/**
 * What each of these topics is actually holding.
 *
 * Five reads over the whole set rather than five per topic: both callers
 * ask this about fifty topics at once -- a long reading files that many,
 * and loose stock accumulates that many -- and a round trip each would be
 * the slowest thing in the app by an order of magnitude. Counted here rather than with
 * `count: 'exact'` per topic for the same reason -- the rows are a
 * handful of ids and grouping them is free next to the journey.
 */
export async function gatherEvidence(
  db: SupabaseClient,
  topicIds: string[]
): Promise<Map<string, TopicEvidence>> {
  const ids = [...new Set(topicIds)]
  const evidence = new Map<string, TopicEvidence>()
  if (ids.length === 0) return evidence

  const [memberships, filed, lessons, marks, exposures] = await Promise.all([
    db.from('topic_subjects').select('topic_id, subjects(id, title)').in('topic_id', ids),
    db.from('resource_topics')
      .select('topic_id, relevance, resources(title)')
      .in('topic_id', ids)
      .order('relevance', { ascending: false }),
    db.from('lessons').select('topic_id').in('topic_id', ids),
    db.from('highlights').select('topic_id').in('topic_id', ids),
    db.from('exposures').select('topic_id').in('topic_id', ids),
  ])

  for (const id of ids) evidence.set(id, { ...EMPTY_EVIDENCE, subjects: [], sources: [] })

  for (const row of memberships.data ?? []) {
    const subject = row.subjects as unknown as { id: string; title: string } | null
    if (subject) evidence.get(row.topic_id as string)?.subjects.push(subject)
  }

  for (const row of filed.data ?? []) {
    const held = evidence.get(row.topic_id as string)
    if (!held) continue
    held.resources += 1
    const resource = row.resources as unknown as { title: string } | null
    // Named in relevance order, so the three shown are the three that
    // most say what the topic is about.
    if (resource?.title && held.sources.length < SOURCES_NAMED) held.sources.push(resource.title)
  }

  const tally = (
    rows: Array<{ topic_id: string | null }> | null,
    field: 'lessons' | 'marks' | 'exposures'
  ) => {
    for (const row of rows ?? []) {
      const held = row.topic_id ? evidence.get(row.topic_id) : undefined
      if (held) held[field] += 1
    }
  }

  tally(lessons.data, 'lessons')
  tally(marks.data, 'marks')
  tally(exposures.data, 'exposures')

  return evidence
}
