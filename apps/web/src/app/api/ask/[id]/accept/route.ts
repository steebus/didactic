import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { ownerId } from '@/lib/auth'
import { revalidateTag } from 'next/cache'
import { tags } from '@didactic/core/tags'
import { slugFor } from '@didactic/core/sections'
import { embed } from '@/lib/embedding'
import { cosineSimilarity } from '@didactic/core/similarity'
import { keptReading } from '@didactic/core/resolution'
import type { Accepted } from '@didactic/core/ask'
import { fetchCandidates, resolveConcept, settleWithReading } from '@/lib/resolver'
import { judge, keyOf } from '@/lib/ingest'

/**
 * Drop what accepting a topic changed.
 *
 * A new topic is a new row on the map, which every bed sheet and the
 * loose list are built from.
 */
function dropCache() {
  for (const tag of [tags.topics, tags.subjects, tags.pending]) revalidateTag(tag, { expire: 0 })
}

/** One embedding, one search, one reading. */
export const maxDuration = 60

/**
 * Accept a proposed topic.
 *
 * The one thing in this feature that puts a row in the map, and the only
 * place it can happen: the agent's loop has no path to here. Which is
 * the whole of the argument for letting it keep marks and cards by
 * itself -- those are the reader's own material, and this is not.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await ownerId()
  if (!userId) return NextResponse.json({ error: 'not signed in' }, { status: 401 })

  const { id } = await params

  const { name, summary } = (await req.json().catch(() => ({}))) as {
    name?: string
    summary?: string
  }
  if (!name) return NextResponse.json({ error: 'no name' }, { status: 400 })

  const db = supabaseAdmin()

  // The conversation is checked before anything is created: the id names
  // it and arrives from a browser.
  const { data: conversation } = await db
    .from('conversations')
    .select('id')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle()
  if (!conversation) return NextResponse.json({ error: 'not found' }, { status: 404 })

  // `topics` is `nodes` renamed (012), so the column is `title`, and
  // there is a unique on (user_id, slug) to respect. A topic already
  // standing is returned rather than refused: accepting twice is a
  // double tap, not an error worth showing.
  const slug = slugFor(name)
  const { data: standing } = await db
    .from('topics')
    .select('id')
    .eq('user_id', userId)
    .eq('slug', slug)
    .maybeSingle()

  if (standing) {
    const accepted: Accepted = { outcome: 'existing', topicId: standing.id, title: name }
    return NextResponse.json(accepted)
  }

  // The embedding is not optional furniture. `match_topics` selects
  // `where state = 'active' and embedding is not null`, so a topic
  // written without one is invisible to the resolver for good -- and the
  // next ingestion that meets the same concept would create the very
  // near-duplicate `search_map` exists to prevent. A topic the resolver
  // cannot see is worse than no topic.
  let vector: number[]
  try {
    vector = await embed(name)
  } catch {
    return NextResponse.json(
      { error: 'the topic could not be added just now' },
      { status: 503 }
    )
  }

  // Read against the map before anything is written, as a concept from
  // a resource is (`ingest`): the embedding nominates, the reading
  // decides. This was the one way onto the map that asked nothing -- a
  // proposal was written as a new topic however plainly it was one
  // already there, and filed under nothing.
  const candidates = await fetchCandidates(db, vector)
  const warnings: string[] = []
  const verdicts = await judge(db, {
    userId,
    resourceTitle: 'A topic proposed in conversation, and accepted by the reader',
    searched: [{ concept: { name, description: summary ?? null }, vector, candidates }],
    warnings,
  })
  const verdict = verdicts?.get(keyOf(0))
  const resolution = settleWithReading(
    name,
    verdict?.reading,
    resolveConcept(name, candidates, vector),
    id => {
      const found = candidates.find(c => c.id === id)
      return found ? cosineSimilarity(vector, found.embedding) : 0
    }
  )

  if (resolution.action === 'link') {
    const title = candidates.find(c => c.id === resolution.topicId)?.title ?? name
    const accepted: Accepted = { outcome: 'existing', topicId: resolution.topicId, title }
    return NextResponse.json(accepted)
  }

  const queued = resolution.action === 'pending'
  const { data, error } = await db
    .from('topics')
    .insert({
      user_id: userId,
      title: name,
      slug,
      summary: summary ?? null,
      embedding: JSON.stringify(vector),
      state: queued ? 'pending' : 'active',
      created_by: 'user',
    })
    .select('id')
    .single()

  if (error || !data) return NextResponse.json({ error: 'could not create the topic' }, { status: 500 })

  if (queued && verdict) {
    // What the reading was unsure of, so the queue asks about that pair
    // (059). Never fatal: without it the queue reads the topic again.
    await db.from('topics').update({ pending_reading: keptReading(verdict.reading) }).eq('id', data.id)
  }

  // Filed where the reading placed it, as ingestion files a topic it
  // creates (045). A queued topic is filed nowhere until it is settled.
  const placed = !queued && verdict ? verdict.subjects : []
  if (placed.length > 0) {
    await db.from('topic_subjects').upsert(
      placed.map(subject_id => ({ topic_id: data.id, subject_id, created_by: 'ai' as const })),
      { onConflict: 'topic_id,subject_id', ignoreDuplicates: true }
    )
  }

  dropCache()
  const accepted: Accepted = queued
    ? { outcome: 'queued', topicId: data.id }
    : { outcome: 'added', topicId: data.id, filed: placed.length }
  return NextResponse.json(accepted)
}
