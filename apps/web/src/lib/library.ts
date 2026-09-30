import { cacheLife, cacheTag } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { tags } from '@didactic/core/tags'
import { supabaseAdmin } from './supabase'

// The shape moved to `@didactic/core/shapes`, where the phone can name
// it too; the query that builds it needs a client and the cache, so it
// stays here. Re-exported so `@/lib/library` still answers for both.
import type { LibraryRow } from '@didactic/core/shapes'
import { saidFrom } from '@didactic/core/shelf'
import { filingOf, type JobState } from '@didactic/core/filingState'


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
  // Marks too: a row prints what was said back about it, and a summary
  // written in a resource is a mark (053).
  cacheTag(tags.resources, tags.topics, tags.highlights, tags.bookmarks)
  // Held until a write drops one of the tags above. See the `held`
  // profile in next.config.ts for why nothing here expires on time.
  cacheLife('held')
  // The client is built in here rather than passed in: an argument
  // crossing a `use cache` boundary is serialised, and a Supabase
  // client does not survive that -- it arrives as a dead reference
  // and the first `.from()` throws on the server.
  return readLibrary(supabaseAdmin())
}

export async function readLibrary(db: SupabaseClient): Promise<LibraryRow[]> {
  const [
    { data: resources },
    { data: links },
    { data: exposures },
    { data: jobs },
    { data: written },
    { data: places },
  ] = await Promise.all([
    db.from('resources').select('*').order('added_at', { ascending: false }),
    db.from('resource_topics').select('resource_id, relevance, topics(id, title)'),
    // Only the source ids matter: this is a "has anything been read out
    // of it" question, not a count. Marked read, or said back whole
    // (054): either way an exposure rests on it and removing it fails.
    db.from('exposures').select('source_id').in('source', ['resource', 'summary']),
    // Where each one has got to. Read with the shelf rather than on
    // demand: the sheet prints a line about every row, and a query per
    // row would be a round trip per row.
    db.from('ingestion_jobs').select('resource_id, state, attempts, error'),
    // What was written in each resource read in the app (053), for the
    // summary under its title. Only the columns the row prints from; an
    // error before 053 is simply nothing written.
    db
      .from('highlights')
      .select('resource_id, kind, section, note')
      .not('resource_id', 'is', null),
    // Where the reader stopped, for the *Currently reading* strip.
    db.from('bookmarks').select('resource_id, at').not('resource_id', 'is', null),
  ])

  const stopped = new Map((places ?? []).map(b => [b.resource_id as string, Number(b.at)]))

  const said = saidFrom(written ?? [], 'resource_id')
  const marked = new Map<string, number>()
  for (const w of written ?? []) {
    if (w.kind === 'summary' || !w.resource_id) continue
    marked.set(w.resource_id, (marked.get(w.resource_id) ?? 0) + 1)
  }

  // Most relevant first: the row's first topic is what it is most about,
  // which is the topic the shelf groups it under (`core/shelf.byTopic`).
  const filed = new Map<string, Array<{ id: string; title: string; relevance: number }>>()
  for (const link of links ?? []) {
    const topic = link.topics as unknown as { id: string; title: string } | null
    if (!topic) continue
    const entry = { ...topic, relevance: Number(link.relevance ?? 0) }
    const list = filed.get(link.resource_id)
    if (list) list.push(entry)
    else filed.set(link.resource_id, [entry])
  }

  const read = new Set((exposures ?? []).map(e => e.source_id))

  const job = new Map(
    (jobs ?? []).map(j => [
      j.resource_id as string,
      j as { state: JobState; attempts: number; error: string | null },
    ])
  )

  const all = resources ?? []

  return all.map(r => {
    const topics = (filed.get(r.id) ?? [])
      .sort((a, b) => b.relevance - a.relevance || a.title.localeCompare(b.title))
      .map(({ id, title }) => ({ id, title }))
    const own = job.get(r.id)
    return {
    ...r,
    topics,
    filing: filingOf({ job: own?.state ?? null, topics: topics.length }),
    filingError: own?.error ?? null,
    readInto: read.has(r.id),
    said: said.get(r.id) ?? null,
    marks: marked.get(r.id) ?? 0,
    readTo: stopped.get(r.id) ?? null,
    sameAs: all
      .filter(other => other.id !== r.id && titleOverlap(r.title, other.title) >= SAME_THING)
      .map(other => ({ id: other.id, title: other.title })),
    }
  })
}
