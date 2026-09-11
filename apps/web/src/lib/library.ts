import { cacheTag } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { tags } from '@didactic/core/tags'
import { supabaseAdmin } from './supabase'

// The shape moved to `@didactic/core/shapes`, where the phone can name
// it too; the query that builds it needs a client and the cache, so it
// stays here. Re-exported so `@/lib/library` still answers for both.
import type { LibraryRow } from '@didactic/core/shapes'


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
export async function getLibrary(): Promise<LibraryRow[]> {
  'use cache'
  cacheTag(tags.resources, tags.topics)
  // The client is built in here rather than passed in: an argument
  // crossing a `use cache` boundary is serialised, and a Supabase
  // client does not survive that -- it arrives as a dead reference
  // and the first `.from()` throws on the server.
  return readLibrary(supabaseAdmin())
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
