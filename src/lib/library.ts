import type { SupabaseClient } from '@supabase/supabase-js'
import type { Resource } from './types'

export interface LibraryRow extends Resource {
  /** The topics it is filed against, so a row says where it sits. */
  topics: Array<{ id: string; title: string }>
  /** Whether anything has been read out of it. A resource with
   *  exposures behind it cannot be deleted without rewriting history,
   *  so the sheet says so rather than offering an action that fails. */
  readInto: boolean
}

/**
 * Everything in the library, in one list.
 *
 * The inbox shows what is waiting and a topic sheet shows what is filed
 * against that topic; neither answers "what do I have". A resource
 * filed under nothing appeared on no sheet at all, which is how twenty
 * orphaned links went unnoticed.
 */
export async function getLibrary(db: SupabaseClient): Promise<LibraryRow[]> {
  const [{ data: resources }, { data: links }, { data: exposures }] = await Promise.all([
    db.from('resources').select('*').order('added_at', { ascending: false }),
    db.from('resource_topics').select('resource_id, topics(id, title)'),
    // Only the source ids matter: this is a "has anything been read out
    // of it" question, not a count.
    db.from('exposures').select('source_id').eq('source', 'resource'),
  ])

  const filed = new Map<string, Array<{ id: string; title: string }>>()
  for (const link of links ?? []) {
    const topic = link.topics as unknown as { id: string; title: string } | null
    if (!topic) continue
    const list = filed.get(link.resource_id)
    if (list) list.push(topic)
    else filed.set(link.resource_id, [topic])
  }

  const read = new Set((exposures ?? []).map(e => e.source_id))

  return (resources ?? []).map(r => ({
    ...r,
    topics: (filed.get(r.id) ?? []).sort((a, b) => a.title.localeCompare(b.title)),
    readInto: read.has(r.id),
  }))
}
