import type { SupabaseClient } from '@supabase/supabase-js'
import { extractConcepts } from './llm/concepts'
import { proposeEdges } from './llm/edges'
import { fileWhatTheBedIsSureOf } from './filing'
import { embed } from './embedding'
import { resolveConcept, fetchCandidates, settleResolution } from './resolver'
import {
  judgeConcepts,
  NEAREST_SHOWN,
  SUBJECT_SAMPLE,
  type ConceptToJudge,
  type SubjectToJudge,
  type Verdict,
} from './llm/overlap'
import { cosineSimilarity } from '@didactic/core/similarity'
import { extractFromHtml } from './extract/url'
import { readDocumentRound } from './document'

const slugify = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

/**
 * How much of a document the concept extractor is shown.
 *
 * It is being asked what the thing is about, which the opening of a
 * book answers about as well as the whole of it -- and the whole of a
 * four-hundred page book is not a prompt, it is a bill. The passages
 * are already cut and stored by this point, so this is a read from the
 * table rather than a second pass over the file.
 */
const CONCEPT_WORDS = 12_000

/**
 * What reading the descriptions needs, and what must still be left
 * after it.
 *
 * It is one model call over every concept, and after it come the commit
 * and the edge pass, which is another. Started with less than this of
 * the minute left it does not improve the filing -- it pushes the edge
 * pass past the platform's ceiling after the commit has landed, and a
 * retried ingestion files its topics twice. Skipped, the concepts are
 * judged by their names, as they always were, and the result says so.
 */
const JUDGING_NEEDS_MS = 35_000

export interface IngestResult {
  linked: number
  created: number
  pending: number
  /** How many of the new topics the bed itself placed, once the edges
   *  were drawn. Additive, and absent on the early returns that file
   *  nothing at all. */
  filedByBed?: number
  /** True when the document is only part read and the queue should
   *  bring it back. Nothing has been filed into the graph yet. */
  more?: boolean
  pagesDone?: number
  pageCount?: number
  warnings?: string[]
}

export async function ingestResource(
  db: SupabaseClient,
  resourceId: string,
  { deadline }: { deadline?: number } = {}
): Promise<IngestResult> {
  const { data: resource, error } = await db
    .from('resources').select('*').eq('id', resourceId).single()
  if (error) throw error

  // 1. Get the text.
  let title = resource.title
  let text = resource.raw_text

  // A stored PDF is read into passages first, in rounds, because a book
  // does not fit in one request. Only once the whole document is read
  // does it get filed into the graph -- concepts pulled from the first
  // forty pages of a book would be a reading of the introduction.
  if (!text && resource.kind === 'pdf' && resource.storage_path) {
    const round = await readDocumentRound(db, resourceId, {
      deadline: deadline ?? Date.now() + 45_000,
    })

    if (!round.done) {
      // Put it back in the queue itself. The worker deletes the message
      // it took on a successful return, so this is a fresh one rather
      // than a redelivery, and the attempt counter is not spent on work
      // that is going fine.
      await db.rpc('enqueue_ingestion', { p_resource_id: resourceId })
      return {
        linked: 0,
        created: 0,
        pending: 0,
        more: true,
        pagesDone: round.pagesDone,
        pageCount: round.pageCount,
        warnings: round.warnings,
      }
    }

    // Read and already filed: a document re-queued after finishing has
    // nothing left to do, and filing it twice would double its concepts.
    if (resource.summary) {
      return { linked: 0, created: 0, pending: 0, pagesDone: round.pagesDone, pageCount: round.pageCount }
    }

    const { data: passages } = await db
      .from('resource_passages')
      .select('content')
      .eq('resource_id', resourceId)
      .order('ordinal')

    let held = ''
    for (const passage of passages ?? []) {
      if (held.split(/\s+/).length > CONCEPT_WORDS) break
      held += `${passage.content as string}\n\n`
    }
    text = held.trim()
    if (!text) throw new Error('ingest: no readable content')
  }

  if (!text) {
    if (resource.kind === 'article' && resource.url) {
      const res = await fetch(resource.url, { headers: { 'user-agent': 'didactic/1.0' } })
      if (!res.ok) throw new Error(`ingest: fetch failed ${res.status}`)
      const extracted = extractFromHtml(await res.text(), resource.url)
      title = extracted.title
      text = extracted.text
    } else if (resource.kind === 'book') {
      // A book carries metadata and never its contents -- full-text
      // ingestion is out of scope by design (PRODUCT.md). One looked up
      // through Open Library arrives with the subjects the record
      // carries written into `raw_text`; one typed by hand has only
      // what was typed. Either way the title is a real statement about
      // what it is about, and filing "The Intelligent Investor" under
      // value investing is most of what anyone wanted from adding it.
      text = [resource.title, resource.summary].filter(Boolean).join('. ')
      if (!text.trim()) throw new Error('ingest: that book has nothing to file it by')
    } else {
      throw new Error('ingest: no text available')
    }
  }

  // 2. Extract concepts.
  const { summary, concepts, why } = await extractConcepts(title, text)

  // A reading that found nothing is a failure, and has to say so.
  //
  // It used to return `{linked: 0, created: 0}` with a 200 -- the job
  // was marked done, the message was deleted, and the inbox printed
  // "Filed under nothing", which is the phrase for an article about
  // something genuinely new rather than for one that was never read.
  // The two are indistinguishable to the reader and only one of them
  // is worth retrying.
  //
  // Thrown rather than recorded quietly, so the worker retries it: the
  // model is not deterministic, and the run that came back empty is
  // often followed by one that does not.
  if (concepts.length === 0) {
    throw new Error(
      `ingest: read ${text.length} characters of "${title}" and found no concepts in it (${why})`
    )
  }

  // 3. Resolve each against the graph: first by name, then by reading.
  const searched: Array<{
    concept: (typeof concepts)[number]
    vector: number[]
    candidates: Awaited<ReturnType<typeof fetchCandidates>>
  }> = []
  for (const concept of concepts) {
    const vector = await embed(concept.name)
    searched.push({ concept, vector, candidates: await fetchCandidates(db, vector) })
  }

  const warnings: string[] = []
  const verdicts = await judge(db, {
    userId: resource.user_id,
    resourceTitle: title,
    searched,
    deadline,
    warnings,
  })

  const links: Array<{ topic_id: string; relevance: number; summary: string | null }> = []
  const newTopics: Array<Record<string, unknown>> = []
  let pendingCount = 0

  searched.forEach(({ concept, vector, candidates }, index) => {
    const verdict = verdicts?.get(keyOf(index))
    const similarityOf = (id: string) => {
      const found = candidates.find(c => c.id === id)
      return found ? cosineSimilarity(vector, found.embedding) : 0
    }
    const resolution = settleResolution(
      resolveConcept(concept.name, candidates, vector),
      verdict,
      similarityOf
    )

    if (resolution.action === 'link') {
      // The description rides along so a topic that has never had one
      // gets this one. `045` writes it only where the summary is empty:
      // a description somebody wrote, or an earlier reading, stands.
      links.push({
        topic_id: resolution.topicId,
        relevance: concept.relevance,
        summary: concept.description,
      })
    } else {
      if (resolution.action === 'pending') pendingCount++
      newTopics.push({
        title: concept.name,
        slug: slugify(concept.name),
        summary: concept.description,
        embedding: JSON.stringify(vector),
        state: resolution.action === 'pending' ? 'pending' : 'active',
        relevance: concept.relevance,
        // Where the reading placed it. Present only when it was read:
        // an absent key is what tells `045` to fall back on `039`'s
        // agreement rule, and an empty array is a reading that said it
        // stands alone -- two different answers that must not collapse.
        ...(verdict ? { subject_ids: verdict.subjects } : {}),
      })
    }
  })

  // 4. Commit topics first, so the new ones have real ids to relate.
  const { data: createdIds, error: commitError } = await db.rpc('commit_ingestion', {
    p_resource_id: resourceId,
    p_user_id: resource.user_id,
    // A reading that came back without one keeps the summary the
    // resource already had, rather than wiping it: the model not
    // saying anything this time is not the same as there being
    // nothing to say.
    p_summary: summary ?? resource.summary ?? null,
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

  let filedByBed = 0

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

    // 5b. Now that the edges exist, the bed can be asked about anything
    // still filed under nothing. It is the only reading that could not
    // run in `commit_ingestion`: the evidence is drawn in the pass
    // above, so at step 4 there was none. A resource whose concepts
    // matched nothing by name used to leave every one of them loose
    // however plainly they sat among a subject's topics -- five edges
    // into one bed and no membership in it.
    //
    // Never fatal. A topic that stays loose is on a sheet that exists
    // to list it; failing the whole ingestion for want of a filing
    // would lose the reading itself.
    try {
      filedByBed = (await fileWhatTheBedIsSureOf(db, newTopicRefs.map((t: { id: string }) => t.id))).length
    } catch (e) {
      warnings.push(
        `Filed nothing from the bed: ${e instanceof Error ? e.message : String(e)}`
      )
    }
  }

  // 6. Status stays 'queued'. Filing is not reading.
  return {
    linked: links.length,
    created: newTopics.length,
    pending: pendingCount,
    filedByBed,
    ...(warnings.length ? { warnings } : {}),
  }
}

const keyOf = (index: number) => `c${index + 1}`

/**
 * Read the concepts' descriptions against the map, or say why not.
 *
 * Never throws. A failed reading costs the reading: the concepts are
 * judged by name, exactly as ingestion did before, and the warning is
 * the only trace -- failing a whole resource for want of a second
 * opinion would be the tail wagging the dog.
 */
async function judge(
  db: SupabaseClient,
  input: {
    userId: string
    resourceTitle: string
    searched: Array<{
      concept: { name: string; description: string | null }
      vector: number[]
      candidates: Array<{ id: string; title: string; summary: string | null; embedding: number[] }>
    }>
    deadline?: number
    warnings: string[]
  }
): Promise<Map<string, Verdict> | null> {
  if (input.deadline !== undefined && input.deadline - Date.now() < JUDGING_NEEDS_MS) {
    input.warnings.push('Judged by name only: too little of the minute was left to read the descriptions.')
    return null
  }

  try {
    const { data: subjectRows } = await db
      .from('subjects').select('id, title').eq('user_id', input.userId).order('title')
    const subjectList = (subjectRows ?? []) as Array<{ id: string; title: string }>
    const subjectTitle = new Map(subjectList.map(s => [s.id, s.title]))

    // Every membership in every subject: it says what each subject holds
    // and where each candidate already sits, in one read.
    const { data: memberships } = subjectList.length
      ? await db
          .from('topic_subjects').select('topic_id, subject_id')
          .in('subject_id', subjectList.map(s => s.id))
      : { data: [] }

    const subjectsOf = new Map<string, string[]>()
    const heldBy = new Map<string, string[]>()
    for (const m of (memberships ?? []) as Array<{ topic_id: string; subject_id: string }>) {
      const title = subjectTitle.get(m.subject_id)
      if (title) subjectsOf.set(m.topic_id, [...(subjectsOf.get(m.topic_id) ?? []), title])
      heldBy.set(m.subject_id, [...(heldBy.get(m.subject_id) ?? []), m.topic_id])
    }

    const sampled = [...new Set([...heldBy.values()].flatMap(ids => ids.slice(0, SUBJECT_SAMPLE)))]
    const { data: sampleRows } = sampled.length
      ? await db.from('topics').select('id, title').in('id', sampled)
      : { data: [] }
    const topicTitle = new Map(
      ((sampleRows ?? []) as Array<{ id: string; title: string }>).map(t => [t.id, t.title])
    )

    const subjects: SubjectToJudge[] = subjectList.map(s => ({
      id: s.id,
      title: s.title,
      topics: (heldBy.get(s.id) ?? [])
        .slice(0, SUBJECT_SAMPLE)
        .flatMap(id => topicTitle.get(id) ?? []),
    }))

    const concepts: ConceptToJudge[] = input.searched.map(({ concept, vector, candidates }, index) => ({
      key: keyOf(index),
      name: concept.name,
      description: concept.description,
      nearest: candidates
        .map(c => ({
          id: c.id,
          title: c.title,
          summary: c.summary,
          similarity: cosineSimilarity(vector, c.embedding),
          subjects: subjectsOf.get(c.id) ?? [],
        }))
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, NEAREST_SHOWN),
    }))

    return await judgeConcepts({ resourceTitle: input.resourceTitle, concepts, subjects })
  } catch (e) {
    input.warnings.push(
      `Judged by name only: reading the descriptions failed (${e instanceof Error ? e.message : String(e)}).`
    )
    return null
  }
}
