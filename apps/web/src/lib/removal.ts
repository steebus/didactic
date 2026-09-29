import type { SupabaseClient } from '@supabase/supabase-js'
import { onlyFrom } from './refile'

/**
 * Removing a resource, and what it would take with it.
 *
 * A resource that is read files itself under topics, and some of those
 * topics exist only because it brought them in: bare names nothing else
 * has touched. Removing the resource used to leave them standing,
 * filed under nothing, on sheets that exist to list loose topics. The
 * reader may now take them too, and is shown which ones first.
 *
 * "Nothing else holds it" is `onlyFrom`'s rule, the one re-filing
 * already uses: another resource, a lesson, a mark, a card, a
 * conversation, a bed it was sown into, anything a person made or drew.
 * When in doubt, a topic is kept.
 */

export interface Loose {
  id: string
  title: string
  state: string
}

/** The topics removing this resource could take with it. */
export async function looseTopics(db: SupabaseClient, userId: string, id: string): Promise<Loose[]> {
  const { data: links } = await db.from('resource_topics').select('topic_id').eq('resource_id', id)
  const topicIds = [...new Set(((links ?? []) as Array<{ topic_id: string }>).map(l => l.topic_id))]
  const loose = await onlyFrom(db, topicIds, { besides: id })
  if (loose.length === 0) return []

  const { data } = await db
    .from('topics')
    .select('id, title, state')
    .in('id', loose)
    .eq('user_id', userId)
    .order('title')
  return (data ?? []) as Loose[]
}

export type Removed =
  | { ok: true; topicsRemoved: number }
  | { ok: false; status: 404 | 409 | 500; error: string }

/**
 * Remove a resource outright, and with `topics` the topics only it
 * brought in. The topics are worked out before the row goes, and asked
 * again once its links have gone, so one that something else took hold
 * of in between is kept.
 */
export async function removeResource(
  db: SupabaseClient,
  userId: string,
  id: string,
  { topics = false }: { topics?: boolean } = {}
): Promise<Removed> {
  const { data: resource } = await db
    .from('resources')
    .select('id, user_id, storage_path')
    .eq('id', id)
    .maybeSingle()
  if (!resource || resource.user_id !== userId) {
    return { ok: false, status: 404, error: 'There is no such resource.' }
  }

  const { count } = await db
    .from('exposures')
    .select('id', { count: 'exact', head: true })
    .eq('source_id', id)
  if ((count ?? 0) > 0) {
    return {
      ok: false,
      status: 409,
      error: 'This has already been read into the record. Abandon it instead of deleting it.',
    }
  }

  const candidates = topics ? (await looseTopics(db, userId, id)).map(t => t.id) : []

  // Its links first, said rather than left to the cascade, so the
  // topics are asked about below with nothing of this resource holding
  // them.
  await db.from('resource_topics').delete().eq('resource_id', id)
  const { error } = await db.from('resources').delete().eq('id', id)
  if (error) return { ok: false, status: 500, error: error.message }

  // The row is gone either way; a file left in the bucket is litter,
  // not a failure worth reporting to the caller.
  if (resource.storage_path) {
    await db.storage.from('resources').remove([resource.storage_path as string])
  }

  let topicsRemoved = 0
  if (candidates.length > 0) {
    const still = await onlyFrom(db, candidates)
    if (still.length > 0) {
      const { error: topicError } = await db.from('topics').delete().in('id', still).eq('user_id', userId)
      if (!topicError) topicsRemoved = still.length
      else console.error('remove: the resource went but its topics stayed', topicError.message)
    }
  }

  return { ok: true, topicsRemoved }
}
