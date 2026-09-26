import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * A reading: what marks, summaries and clozes are written against.
 *
 * Until 053 that was always a lesson. A resource read in the app is the
 * second kind, and everything written while reading one is written the
 * same way -- only the column it hangs from differs, and which topic it
 * counts toward.
 */

/** Where something was written: a lesson, or a resource read here. */
export type ReadingRef = { lessonId: string } | { resourceId: string }

/** The column and id a row written against this reading carries. */
export function parentOf(where: ReadingRef) {
  return 'lessonId' in where
    ? { column: 'lesson_id' as const, id: where.lessonId }
    : { column: 'resource_id' as const, id: where.resourceId }
}

/**
 * The title and the topic a reading counts toward.
 *
 * A lesson's topic is on the row. A resource is filed under as many
 * topics as it is about, and a mark or a summary counts toward the one
 * it is most about -- the same single topic a mark in it is denormalised
 * onto, so a reading's marks and summaries sit under one topic sheet
 * rather than scattering across six.
 */
export async function readingOf(
  db: SupabaseClient,
  userId: string,
  where: ReadingRef
): Promise<{ title: string; topicId: string | null } | null> {
  if ('lessonId' in where) {
    const { data } = await db
      .from('lessons')
      .select('id, title, topic_id, user_id')
      .eq('id', where.lessonId)
      .maybeSingle()
    if (!data || data.user_id !== userId) return null
    return { title: data.title as string, topicId: (data.topic_id as string | null) ?? null }
  }

  const [{ data: resource }, { data: filed }] = await Promise.all([
    db.from('resources').select('id, title, user_id').eq('id', where.resourceId).maybeSingle(),
    db
      .from('resource_topics')
      .select('topic_id, relevance')
      .eq('resource_id', where.resourceId)
      .order('relevance', { ascending: false })
      .limit(1),
  ])
  if (!resource || resource.user_id !== userId) return null
  return {
    title: resource.title as string,
    topicId: (filed?.[0]?.topic_id as string | undefined) ?? null,
  }
}

