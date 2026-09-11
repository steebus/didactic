import { cacheTag } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { cosineSimilarity } from './resolver'
import { config } from './config'
import { tags } from './tags'
import { supabaseAdmin } from './supabase'

export interface PendingTopic {
  id: string
  title: string
  summary: string | null
  nearest: {
    id: string
    title: string
    summary: string | null
    similarity: number
  } | null
}

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
  // The client is built in here rather than passed in: an argument
  // crossing a `use cache` boundary is serialised, and a Supabase
  // client does not survive that -- it arrives as a dead reference and
  // the first `.from()` throws on the server.
  return readPendingTopics(supabaseAdmin())
}

export async function readPendingTopics(db: SupabaseClient): Promise<PendingTopic[]> {
  const { data } = await db.from('topics')
    .select('id, title, summary, embedding')
    .eq('state', 'pending')
    .order('created_at', { ascending: false })

  return Promise.all(
    (data ?? []).map(async topic => {
      let nearest: PendingTopic['nearest'] = null

      if (topic.embedding) {
        const embedding =
          typeof topic.embedding === 'string' ? JSON.parse(topic.embedding) : topic.embedding
        // Two, because the nearest row may be the topic itself.
        const { data: matches } = await db.rpc('match_topics', {
          query_embedding: embedding,
          match_count: 2,
        })
        const top = (matches ?? []).find((m: { id: string }) => m.id !== topic.id)

        if (top) {
          const theirs =
            typeof top.embedding === 'string' ? JSON.parse(top.embedding) : top.embedding
          const similarity = cosineSimilarity(embedding, theirs)
          // match_topics returns the nearest row whatever its distance,
          // so on a near-empty map it names the only topic there is and
          // calls it close. Below the band the resolver would have
          // deferred over, there is nothing to compare and an offer to
          // merge is noise dressed as a recommendation.
          if (similarity >= config.RESOLVER_AMBIGUOUS) {
            nearest = {
              id: top.id,
              title: top.title,
              summary: top.summary ?? null,
              similarity,
            }
          }
        }
      }

      return {
        id: topic.id,
        title: topic.title,
        summary: topic.summary ?? null,
        nearest,
      }
    })
  )
}
