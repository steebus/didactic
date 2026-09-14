import { cacheLife, cacheTag } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { cosineSimilarity } from '@didactic/core/similarity'
import { config } from '@didactic/core/config'
import { tags } from '@didactic/core/tags'
import { supabaseAdmin } from './supabase'
import { EMPTY_EVIDENCE, gatherEvidence } from './evidence'

// The shape moved to `@didactic/core/shapes`, where the phone can name
// it too; the query that builds it needs a client and the cache, so it
// stays here. Re-exported so `@/lib/pending` still answers for both.
import type { PendingTopic } from '@didactic/core/shapes'

/**
 * The adjudication queue: topics the resolver would not decide alone.
 *
 * Lived in two places -- the inbox sheet and the pending route -- which
 * had drifted into two slightly different answers to the same question.
 * One copy, so what the sheet shows and what the API returns cannot
 * disagree.
 */
export async function getPendingTopics(): Promise<PendingTopic[]> {
  'use cache'
  cacheTag(tags.pending, tags.topics)
  // Held until a write drops one of the tags above. See the `held`
  // profile in next.config.ts for why nothing here expires on time.
  cacheLife('held')
  // The client is built in here rather than passed in: an argument
  // crossing a `use cache` boundary is serialised, and a Supabase
  // client does not survive that -- it arrives as a dead reference and
  // the first `.from()` throws on the server.
  return readPendingTopics(supabaseAdmin())
}

export async function readPendingTopics(db: SupabaseClient): Promise<PendingTopic[]> {
  const { data } = await db.from('topics')
    .select('id, title, summary, created_at, embedding')
    .eq('state', 'pending')
    .order('created_at', { ascending: false })

  const rows = data ?? []

  // The nearest match for each, found first and on its own, because
  // the evidence read below is one query per table over *every* topic
  // in the queue and it cannot be written until it knows which topics
  // the queue is actually about.
  const matched = await Promise.all(
    rows.map(async topic => ({ topic, nearest: await nearestTo(db, topic) }))
  )

  const evidence = await gatherEvidence(
    db,
    matched.flatMap(m => [m.topic.id as string, ...(m.nearest ? [m.nearest.id] : [])])
  )

  return matched.map(({ topic, nearest }) => ({
    id: topic.id,
    title: topic.title,
    summary: topic.summary ?? null,
    created_at: topic.created_at ?? null,
    evidence: evidence.get(topic.id) ?? EMPTY_EVIDENCE,
    nearest: nearest && { ...nearest, evidence: evidence.get(nearest.id) ?? EMPTY_EVIDENCE },
  }))
}

interface Nearest {
  id: string
  title: string
  summary: string | null
  similarity: number
}

/** The closest active topic on the map, where there is one close
 *  enough to be worth asking about. */
async function nearestTo(
  db: SupabaseClient,
  topic: { id: string; embedding: unknown }
): Promise<Nearest | null> {
  if (!topic.embedding) return null

  const embedding =
    typeof topic.embedding === 'string' ? JSON.parse(topic.embedding) : topic.embedding
  // Two, because the nearest row may be the topic itself.
  const { data: matches } = await db.rpc('match_topics', {
    query_embedding: embedding,
    match_count: 2,
  })
  const top = (matches ?? []).find((m: { id: string }) => m.id !== topic.id)
  if (!top) return null

  const theirs = typeof top.embedding === 'string' ? JSON.parse(top.embedding) : top.embedding
  const similarity = cosineSimilarity(embedding, theirs)
  // match_topics returns the nearest row whatever its distance, so on
  // a near-empty map it names the only topic there is and calls it
  // close. Below the band the resolver would have deferred over, there
  // is nothing to compare and an offer to merge is noise dressed as a
  // recommendation.
  if (similarity < config.RESOLVER_AMBIGUOUS) return null

  return {
    id: top.id,
    title: top.title,
    summary: top.summary ?? null,
    similarity,
  }
}
