import type { SupabaseClient } from '@supabase/supabase-js'
import { REFILE_READ, type Filing } from '@didactic/core/whole'

export type Refiled =
  | { ok: true; cleared: number; queued: boolean }
  | { ok: false; status: 404 | 409 | 503; error: string }

/**
 * File a resource again, as one topic or by its parts.
 *
 * Not rearranged in place: which one thing a piece is about, or which
 * things it covers, is a reading, so it is read again with the reader's
 * say kept on it (060) and `ingest` files it the way it was told. What
 * the old filing leaves behind is cleared first -- the resource's links,
 * and every topic that exists only because this resource brought it in
 * (`onlyFrom`), which is what "Bloom Filter in Python" left: Hash
 * Functions, Set Membership Testing and the rest, bare names nothing
 * else had touched.
 *
 * Refused once the resource has been read into the record, for the
 * reason a read resource cannot be deleted: its exposures are counted
 * against the topics it is filed under, and moving the material would
 * leave those figures resting on topics it no longer explains.
 */
export async function refileResource(
  db: SupabaseClient,
  userId: string,
  id: string,
  as: Exclude<Filing, null>
): Promise<Refiled> {
  const { data: resource } = await db
    .from('resources')
    .select('id, user_id, kind')
    .eq('id', id)
    .maybeSingle()
  if (!resource || resource.user_id !== userId) {
    return { ok: false, status: 404, error: 'There is no such resource.' }
  }

  const { count: read } = await db
    .from('exposures')
    .select('id', { count: 'exact', head: true })
    .eq('source_id', id)
  if ((read ?? 0) > 0) return { ok: false, status: 409, error: REFILE_READ }

  // The say, kept before anything is taken away: without it the reading
  // would only file it the way it did before. A document is read into
  // the graph once, and knows it has been by its summary.
  const { error: said } = await db
    .from('resources')
    .update({ filing: as, ...(resource.kind === 'pdf' ? { summary: null } : {}) })
    .eq('id', id)
  if (said) {
    return {
      ok: false,
      status: 503,
      error: 'This cannot be filed another way until the database has somewhere to keep the choice (migration 060).',
    }
  }

  const { data: links } = await db.from('resource_topics').select('topic_id').eq('resource_id', id)
  const topicIds = [...new Set(((links ?? []) as Array<{ topic_id: string }>).map(l => l.topic_id))]
  await db.from('resource_topics').delete().eq('resource_id', id)

  const orphans = await onlyFrom(db, topicIds)
  if (orphans.length > 0) {
    await db.from('topics').delete().in('id', orphans).eq('user_id', userId)
  }

  // Read again. The job row is reset rather than added: there is one per
  // resource, and its attempts belong to this reading, not the last.
  const { data: job } = await db.from('ingestion_jobs').select('id').eq('resource_id', id).maybeSingle()
  if (job) {
    await db
      .from('ingestion_jobs')
      .update({ state: 'pending', attempts: 0, error: null, updated_at: new Date().toISOString() })
      .eq('resource_id', id)
  } else {
    await db.from('ingestion_jobs').insert({ resource_id: id })
  }
  const { error: queueError } = await db.rpc('enqueue_ingestion', { p_resource_id: id })

  return { ok: true, cleared: orphans.length, queued: !queueError }
}

/**
 * The topics, of those given, that nothing but the resource being
 * re-filed ever touched -- once its links are gone.
 *
 * A topic stays if anything else holds it: another resource, a lesson
 * or a route, a reading in the record, a mark or a tag, a card, a
 * conversation, a membership a person made or a bed it was sown into,
 * an edge a person drew, or its having been made by a person at all.
 * Membership the reading placed and edges it drew are its own work and
 * go with it. A table that cannot be read counts as holding everything
 * it was asked about: when in doubt, a topic is kept.
 */
export async function onlyFrom(db: SupabaseClient, topicIds: readonly string[]): Promise<string[]> {
  if (topicIds.length === 0) return []
  const ids = [...topicIds]
  const held = new Set<string>()

  /** Every id `column` names in `table`, narrowed to rows not of the
   *  reading's making (`byPerson`) or placed in a sown bed (`sown`). */
  const holding = async (table: string, column: string, only?: 'byPerson' | 'sown') => {
    const base = db.from(table).select(column).in(column, ids)
    const narrowed =
      only === 'byPerson' ? base.neq('created_by', 'ai') : only === 'sown' ? base.not('position', 'is', null) : base
    const { data, error } = await narrowed
    if (error) {
      for (const id of ids) held.add(id)
      return
    }
    for (const row of (data ?? []) as unknown as Array<Record<string, string>>) held.add(row[column])
  }

  await Promise.all([
    holding('topics', 'id', 'byPerson'),
    holding('resource_topics', 'topic_id'),
    holding('lessons', 'topic_id'),
    holding('curricula', 'topic_id'),
    holding('exposures', 'topic_id'),
    holding('highlights', 'topic_id'),
    holding('highlight_tags', 'topic_id'),
    holding('clozes', 'topic_id'),
    holding('cloze_concepts', 'topic_id'),
    holding('conversations', 'topic_id'),
    holding('topic_subjects', 'topic_id', 'byPerson'),
    holding('topic_subjects', 'topic_id', 'sown'),
    holding('edges', 'from_topic', 'byPerson'),
    holding('edges', 'to_topic', 'byPerson'),
  ])

  // Pending topics included: one queued from this resource alone is a
  // question about material that is no longer filed this way.
  return ids.filter(id => !held.has(id))
}
