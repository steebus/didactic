import { cacheTag } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Resource } from './types'
import { tags } from './tags'

/**
 * Two rows that look like the same piece of material.
 *
 * Titles are compared rather than embeddings: a URL settles identity
 * where there is one and the database now enforces that, so what is
 * left is the same book typed once and looked up later. Normalising
 * punctuation and articles makes those an exact match, and token
 * overlap catches the rest -- measured on the real rows, the same book
 * scores 1.00 and 0.60 to 0.67 across spelling variants while
 * different books share nothing. No round trip, no model, no cost per
 * page load.
 */
const normalise = (t: string) =>
  t
    .toLowerCase()
    .replace(/[‐-―−]/g, '-')
    .replace(/[‘’“”]/g, "'")
    .replace(/\b(by|the|a|an)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')

const tokens = (t: string) =>
  new Set(normalise(t).split(' ').filter(w => w.length > 2))

/** Jaccard overlap of the meaningful words in two titles. */
function titleOverlap(a: string, b: string): number {
  const A = tokens(a)
  const B = tokens(b)
  if (A.size === 0 || B.size === 0) return 0
  const shared = [...A].filter(x => B.has(x)).length
  return shared / (A.size + B.size - shared)
}

/** Loose enough for a spelling variant, tight enough that two books by
 *  the same author do not match each other. */
const SAME_THING = 0.6

export interface LibraryRow extends Resource {
  /** The topics it is filed against, so a row says where it sits. */
  topics: Array<{ id: string; title: string }>
  /** Whether anything has been read out of it. A resource with
   *  exposures behind it cannot be deleted without rewriting history,
   *  so the sheet says so rather than offering an action that fails. */
  readInto: boolean
  /** Other rows that look like the same piece of material. Named on
   *  the shelf rather than merged quietly: merging moves exposures and
   *  cannot be undone. */
  sameAs: Array<{ id: string; title: string }>
}

/**
 * Everything in the library, in one list.
 *
 * The inbox shows what is waiting and a topic sheet shows what is filed
 * against that topic; neither answers "what do I have". A resource
 * filed under nothing appeared on no sheet at all, which is how twenty
 * orphaned links went unnoticed.
 */
/** The shelf, cached. The query is separate so it can be tested
 *  outside Next's runtime, where `cacheTag` does not exist. */
export async function getLibrary(db: SupabaseClient): Promise<LibraryRow[]> {
  'use cache'
  cacheTag(tags.resources, tags.topics)
  return readLibrary(db)
}

export async function readLibrary(db: SupabaseClient): Promise<LibraryRow[]> {
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

  const all = resources ?? []

  return all.map(r => ({
    ...r,
    topics: (filed.get(r.id) ?? []).sort((a, b) => a.title.localeCompare(b.title)),
    readInto: read.has(r.id),
    sameAs: all
      .filter(other => other.id !== r.id && titleOverlap(r.title, other.title) >= SAME_THING)
      .map(other => ({ id: other.id, title: other.title })),
  }))
}
