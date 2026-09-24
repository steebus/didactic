import type { SupabaseClient } from '@supabase/supabase-js'
import { config } from '@didactic/core/config'
import { cosineSimilarity } from '@didactic/core/similarity'
import type { Reading } from '@didactic/core/resolution'

export type Resolution =
  | { action: 'link'; topicId: string; similarity: number }
  | { action: 'pending'; title: string; similarity: number; nearestId: string }
  | { action: 'create'; title: string }

export function resolveConcept(
  concept: string,
  candidates: Array<{ id: string; title: string; embedding: number[] }>,
  conceptEmbedding: number[],
  /**
   * Candidates proposed in the same breath as this one, rather than
   * found on the map. A subject is broken into topics that are meant
   * to sit beside each other, so being close to a sibling is the
   * design and not a collision: everything under one subject shares
   * its vocabulary, and gte-small reads that shared vocabulary as
   * similarity. Judging siblings by the same bar as strangers sent a
   * whole freshly-sown bed to adjudication.
   */
  siblingIds: ReadonlySet<string> = new Set()
): Resolution {
  if (candidates.length === 0) return { action: 'create', title: concept }

  let best = { id: '', similarity: -1 }
  for (const c of candidates) {
    const similarity = cosineSimilarity(conceptEmbedding, c.embedding)
    if (similarity > best.similarity) best = { id: c.id, similarity }
  }

  // A sibling has to be an outright restatement before it is worth
  // asking about. Below that the two are simply neighbours in one
  // subject, which is what was ordered.
  const floor = siblingIds.has(best.id)
    ? config.RESOLVER_SIBLING_AMBIGUOUS
    : config.RESOLVER_AMBIGUOUS

  if (best.similarity >= config.RESOLVER_MATCH) {
    return { action: 'link', topicId: best.id, similarity: best.similarity }
  }
  if (best.similarity >= floor) {
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

/**
 * What the reading says, with the embedding's answer held in reserve.
 *
 * This used to arbitrate between two opinions of roughly equal
 * standing, and the arbitration was the problem. The embedding's
 * opinion was never worth much on this question -- `config.ts` records
 * that no cutoff separates "React / React Hooks" at 0.916, which must
 * not merge, from "CDN Distribution / Content Delivery Network" at
 * 0.852, which should -- and giving a weak opinion a vote is how the
 * bands ended up overlapping in the first place.
 *
 * So the reading decides, and the cosine is the degraded path rather
 * than a second voice. When there is no reading -- the gateway is down,
 * the key is missing, the minute ran out -- `resolveConcept`'s answer
 * stands, because a resource filed by name alone is still a resource
 * filed and that is what ingestion did before any of this. The
 * similarity is still computed and still carried, because the
 * adjudication queue prints it and a pending row without one would
 * show the reader nothing.
 */
export function settleWithReading(
  concept: string,
  reading: Reading | undefined,
  fallback: Resolution,
  similarityOf: (topicId: string) => number
): Resolution {
  if (!reading) return fallback

  switch (reading.action) {
    case 'link':
      return {
        action: 'link',
        topicId: reading.topicId,
        similarity: similarityOf(reading.topicId),
      }
    case 'pending':
      return {
        action: 'pending',
        title: concept,
        similarity: similarityOf(reading.nearestId),
        nearestId: reading.nearestId,
      }
    case 'create':
      return { action: 'create', title: concept }
  }
}

export async function fetchCandidates(
  db: SupabaseClient,
  conceptEmbedding: number[],
  // Wider than the ten this asked for while the cosine was also
  // deciding. Recall is the ceiling on everything downstream, and
  // `config.RESOLVER_NOMINATED` carries the measurement that set it.
  limit = config.RESOLVER_NOMINATED
): Promise<Array<{ id: string; title: string; summary: string | null; embedding: number[] }>> {
  const { data, error } = await db.rpc('match_topics', {
    query_embedding: conceptEmbedding,
    match_count: limit,
  })
  if (error) throw error

  // PostgREST serialises a pgvector column as a JSON string. Left
  // unparsed it reaches cosineSimilarity as characters, every score
  // comes back near zero, and the resolver creates a duplicate for
  // every concept it should have linked.
  return (data ?? []).map((row: {
    id: string
    title: string
    summary?: string | null
    embedding: number[] | string
  }) => ({
    id: row.id,
    title: row.title,
    // `019` returns it, and it is what tells two near names apart when
    // ingestion asks whether a concept is one of these.
    summary: row.summary ?? null,
    embedding: typeof row.embedding === 'string' ? JSON.parse(row.embedding) : row.embedding,
  }))
}

/**
 * The existing topics a freshly sown bed should be offered to relate
 * itself to.
 *
 * Offering only what the sowing reused verbatim meant a new bed could
 * only connect to itself -- "Options Trading" would never be told that
 * "Risk, Volatility and Return Measurement" already sits one subject
 * over, and would float as an island. Subjects overlap heavily, which
 * is the premise of one map rather than several.
 *
 * So the neighbours are the nearest existing topics by embedding,
 * taken from the search the resolver already ran on the way in. A
 * topic keeps its best score across the whole bed, because being close
 * to any one of the new topics is what makes it worth offering.
 */
export function neighboursFor(
  searched: Array<{
    vector: number[]
    candidates: Array<{ id: string; title: string; embedding: number[] }>
  }>,
  /** Ids created by this sowing: new topics are not existing neighbours. */
  exclude: ReadonlySet<string>,
  limit: number
): Array<{ id: string; title: string; score: number }> {
  const best = new Map<string, { id: string; title: string; score: number }>()

  for (const { vector, candidates } of searched) {
    for (const candidate of candidates) {
      if (exclude.has(candidate.id)) continue
      const score = cosineSimilarity(vector, candidate.embedding)
      const held = best.get(candidate.id)
      if (!held || score > held.score) {
        best.set(candidate.id, { id: candidate.id, title: candidate.title, score })
      }
    }
  }

  // Nearest first, so a cap keeps the ones most likely to be genuinely
  // related rather than an arbitrary slice.
  return [...best.values()].sort((a, b) => b.score - a.score).slice(0, limit)
}
