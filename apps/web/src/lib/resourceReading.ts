import type { SupabaseClient } from '@supabase/supabase-js'
import type { ResourceKind, ResourceStatus, Highlight } from '@didactic/core/types'
import type { ResourceReading } from '@didactic/core/shapes'
import { readableBody } from './resourceBody'

export type { ResourceReading } from '@didactic/core/shapes'

/**
 * A resource, as the reader opens it: what it is, where it is filed,
 * its readable body where there is one, and everything already written
 * in it -- marks and summaries both, which the sheet parts.
 *
 * One read for the page and for the route the phone will use, so the
 * two are the same answer. The shape is `core/shapes.ResourceReading`.
 */
export async function readResource(
  db: SupabaseClient,
  userId: string,
  id: string
): Promise<ResourceReading | null> {
  const [{ data: resource }, { data: filed }, written] = await Promise.all([
    db
      .from('resources')
      .select('id, user_id, title, kind, url, status, consumed_at, added_at, raw_text, storage_path')
      .eq('id', id)
      .maybeSingle(),
    db
      .from('resource_topics')
      .select('relevance, topics(id, title)')
      .eq('resource_id', id)
      .order('relevance', { ascending: false }),
    writtenIn(db, userId, id),
  ])

  // Not found rather than forbidden for someone else's: whether it
  // exists is not a question a stranger is owed an answer to either.
  if (!resource || resource.user_id !== userId) return null

  const readable = await readableBody(db, {
    id: resource.id as string,
    user_id: resource.user_id as string,
    kind: resource.kind as ResourceKind,
    url: (resource.url as string | null) ?? null,
    raw_text: (resource.raw_text as string | null) ?? null,
    storage_path: (resource.storage_path as string | null) ?? null,
  })

  return {
    resource: {
      id: resource.id as string,
      title: resource.title as string,
      kind: resource.kind as ResourceKind,
      url: (resource.url as string | null) ?? null,
      status: resource.status as ResourceStatus,
      consumed_at: (resource.consumed_at as string | null) ?? null,
      added_at: resource.added_at as string,
      has_file: Boolean(resource.storage_path),
    },
    topics: (filed ?? []).flatMap(f => {
      const topic = f.topics as unknown as { id: string; title: string } | null
      return topic ? [topic] : []
    }),
    readable,
    written,
  }
}

/**
 * Marks and summaries taken in one resource.
 *
 * Empty rather than an error before 053, when there is no column to ask
 * by: the reading is still worth opening with nothing drawn on it.
 */
async function writtenIn(db: SupabaseClient, userId: string, id: string): Promise<Highlight[]> {
  const { data, error } = await db
    .from('highlights')
    .select('*')
    .eq('user_id', userId)
    .eq('resource_id', id)
    .order('created_at')
  if (error) return []
  return (data ?? []) as Highlight[]
}
