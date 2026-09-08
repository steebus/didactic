import type { SupabaseClient } from '@supabase/supabase-js'
import { config } from './config'

export type Resolution =
  | { action: 'link'; topicId: string; similarity: number }
  | { action: 'pending'; title: string; similarity: number; nearestId: string }
  | { action: 'create'; title: string }

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, magA = 0, magB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    magA += a[i] * a[i]
    magB += b[i] * b[i]
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB)
  return denom === 0 ? 0 : dot / denom
}

export function resolveConcept(
  concept: string,
  candidates: Array<{ id: string; title: string; embedding: number[] }>,
  conceptEmbedding: number[]
): Resolution {
  if (candidates.length === 0) return { action: 'create', title: concept }

  let best = { id: '', similarity: -1 }
  for (const c of candidates) {
    const similarity = cosineSimilarity(conceptEmbedding, c.embedding)
    if (similarity > best.similarity) best = { id: c.id, similarity }
  }

  if (best.similarity >= config.RESOLVER_MATCH) {
    return { action: 'link', topicId: best.id, similarity: best.similarity }
  }
  if (best.similarity >= config.RESOLVER_AMBIGUOUS) {
    // Defer to the user. A wrong merge destroys information; a wrong
    // split costs one click. When unsure, ask.
    return {
      action: 'pending',
      title: concept,
      similarity: best.similarity,
      nearestId: best.id,
    }
  }
  return { action: 'create', title: concept }
}

export async function fetchCandidates(
  db: SupabaseClient,
  conceptEmbedding: number[],
  limit = 10
): Promise<Array<{ id: string; title: string; embedding: number[] }>> {
  const { data, error } = await db.rpc('match_topics', {
    query_embedding: conceptEmbedding,
    match_count: limit,
  })
  if (error) throw error

  // PostgREST serialises a pgvector column as a JSON string. Left
  // unparsed it reaches cosineSimilarity as characters, every score
  // comes back near zero, and the resolver creates a duplicate for
  // every concept it should have linked.
  return (data ?? []).map((row: { id: string; title: string; embedding: number[] | string }) => ({
    id: row.id,
    title: row.title,
    embedding: typeof row.embedding === 'string' ? JSON.parse(row.embedding) : row.embedding,
  }))
}
