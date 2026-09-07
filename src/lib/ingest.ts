import type { SupabaseClient } from '@supabase/supabase-js'
import { extractConcepts } from './llm/concepts'
import { proposeEdges } from './llm/edges'
import { embed } from './embedding'
import { resolveConcept, fetchCandidates } from './resolver'
import { extractFromHtml } from './extract/url'
import { extractFromPdf } from './extract/pdf'

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

export async function ingestResource(db: SupabaseClient, resourceId: string) {
  const { data: resource, error } = await db
    .from('resources').select('*').eq('id', resourceId).single()
  if (error) throw error

  // 1. Get the text.
  let title = resource.title
  let text = resource.raw_text
  if (!text) {
    if (resource.kind === 'article' && resource.url) {
      const res = await fetch(resource.url, { headers: { 'user-agent': 'didactic/1.0' } })
      if (!res.ok) throw new Error(`ingest: fetch failed ${res.status}`)
      const extracted = extractFromHtml(await res.text(), resource.url)
      title = extracted.title
      text = extracted.text
    } else if (resource.kind === 'pdf' && resource.storage_path) {
      const { data: file } = await db.storage.from('resources').download(resource.storage_path)
      const extracted = await extractFromPdf(Buffer.from(await file!.arrayBuffer()))
      title = extracted.title
      text = extracted.text
    } else {
      throw new Error('ingest: no text available')
    }
  }

  // 2. Extract concepts.
  const { summary, concepts } = await extractConcepts(title, text)

  // 3. Resolve each against the graph.
  const links: Array<{ topic_id: string; relevance: number }> = []
  const newTopics: Array<Record<string, unknown>> = []
  let pendingCount = 0

  for (const concept of concepts) {
    const vector = await embed(concept.name)
    const candidates = await fetchCandidates(db, vector)
    const resolution = resolveConcept(concept.name, candidates, vector)

    if (resolution.action === 'link') {
      links.push({ topic_id: resolution.topicId, relevance: concept.relevance })
    } else {
      if (resolution.action === 'pending') pendingCount++
      newTopics.push({
        title: concept.name,
        slug: slugify(concept.name),
        summary: null,
        embedding: JSON.stringify(vector),
        state: resolution.action === 'pending' ? 'pending' : 'active',
        relevance: concept.relevance,
      })
    }
  }

  // 4. Commit topics first, so the new ones have real ids to relate.
  const { data: createdIds, error: commitError } = await db.rpc('commit_ingestion', {
    p_resource_id: resourceId,
    p_user_id: resource.user_id,
    p_summary: summary,
    p_new_topics: newTopics,
    p_links: links,
  })
  if (commitError) throw commitError

  // 5. Propose edges between the newly created topics and their existing
  // neighbours, then write them. Edges are a second pass because the
  // LLM needs real topic ids to reference.
  const { data: existingTopics } = await db
    .from('topics').select('id, title').in('id', links.map(l => l.topic_id))

  // commit_ingestion returns out_id/out_title: a plpgsql function whose
  // OUT params are named id/title shadows those column names inside its
  // own body, so the prefix is load-bearing, not cosmetic.
  const newTopicRefs = (createdIds ?? []).map((c: { out_id: string; out_title: string }) => ({
    id: c.out_id,
    title: c.out_title,
  }))

  if (newTopicRefs.length > 0) {
    const edges = await proposeEdges(newTopicRefs, existingTopics ?? [])
    if (edges.length > 0) {
      await db.from('edges').insert(edges.map(e => ({
        user_id: resource.user_id,
        from_topic: e.from,
        to_topic: e.to,
        kind: e.kind,
        weight: e.weight,
        created_by: 'ai' as const,
      })))
    }
  }

  // 6. Status stays 'queued'. Filing is not reading.
  return {
    linked: links.length,
    created: newTopics.length,
    pending: pendingCount,
  }
}
