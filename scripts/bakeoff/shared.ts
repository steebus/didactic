import { createClient } from '@supabase/supabase-js'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * The bake-off's read side.
 *
 * This runs against whatever `apps/web/.env` points at, which is the
 * cloud project holding the real map -- that is the whole point, because
 * the thresholds in `config.ts` describe one graph and the replacement
 * has to be measured on the same one. It also means a stray write here
 * would land in production.
 *
 * So the client is not exported. What leaves this module is a façade
 * with three reads on it and no writer, which makes "the harness must
 * not write" a property of the code rather than a note someone has to
 * remember at the end of a long file.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  throw new Error(
    'bakeoff: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.\n' +
      'Run through the env file, as scripts/seed-dev.sh does:\n' +
      '  NODE_OPTIONS=--env-file=apps/web/.env npx vite-node scripts/bakeoff/<script>.ts'
  )
}

const db = createClient(url, key, { auth: { persistSession: false } })

export interface MapTopic {
  id: string
  title: string
  summary: string | null
  /** Subject ids it is actually filed under. The ground truth for the
   *  filing half of the question. */
  subjectIds: string[]
}

export interface MapSubject {
  id: string
  title: string
  /** A sample of what it holds, which is the nearest thing a subject
   *  has to a description of itself. */
  topics: string[]
}

/** Every active topic on the map, with the subjects it sits in. */
export async function readTopics(): Promise<MapTopic[]> {
  const { data, error } = await db
    .from('topics')
    .select('id, title, summary, topic_subjects(subject_id)')
    .eq('state', 'active')
  if (error) throw error

  return (data ?? []).map(row => ({
    id: row.id as string,
    title: row.title as string,
    summary: (row.summary as string | null) ?? null,
    subjectIds: ((row.topic_subjects ?? []) as Array<{ subject_id: string }>).map(
      s => s.subject_id
    ),
  }))
}

/** Every subject, with a sample of what it holds. */
export async function readSubjects(sample = 12): Promise<MapSubject[]> {
  const { data, error } = await db
    .from('subjects')
    .select('id, title, topics(title)')
  if (error) throw error

  return (data ?? []).map(row => ({
    id: row.id as string,
    title: row.title as string,
    topics: ((row.topics ?? []) as Array<{ title: string }>).map(t => t.title).slice(0, sample),
  }))
}

/**
 * The topics an embedding nominates, nearest first.
 *
 * Deliberately not `fetchCandidates` from the app: that one defaults to
 * ten and parses what it needs for the resolver. The harness asks for
 * far more than either arm will use, once, and each arm takes the slice
 * it is entitled to -- so both arms are judged on one search rather than
 * on two searches that might not agree.
 */
export async function nominate(
  vector: number[],
  limit: number
): Promise<Array<{ id: string; title: string; summary: string | null; embedding: number[] }>> {
  const { data, error } = await db.rpc('match_topics', {
    query_embedding: JSON.stringify(vector),
    match_count: limit,
  })
  if (error) throw error

  return (data ?? []).map(
    (row: {
      id: string
      title: string
      summary?: string | null
      embedding: number[] | string
    }) => ({
      id: row.id,
      title: row.title,
      summary: row.summary ?? null,
      // PostgREST serialises pgvector as a JSON string. Left unparsed it
      // reaches cosineSimilarity as characters and every score comes back
      // near zero -- the same trap `fetchCandidates` documents.
      embedding: typeof row.embedding === 'string' ? JSON.parse(row.embedding) : row.embedding,
    })
  )
}

/** One labelled question for the pipeline, with the answer known. */
export interface Probe {
  /** `alias` is the same topic under another name and must resolve to
   *  `topicId`. `neighbour` is a genuinely different topic that sits
   *  next to it and must not resolve to anything. */
  kind: 'alias' | 'neighbour'
  name: string
  description: string
  /** The topic this probe was generated from. For an alias it is the
   *  right answer; for a neighbour it is the trap. */
  topicId: string
  topicTitle: string
  /** Subjects the source topic is really filed under. Scored on
   *  aliases only, where it is the probe's truth too. */
  subjectIds: string[]
}

const here = dirname(fileURLToPath(import.meta.url))
const PROBE_FILE = join(here, 'probes.json')

/**
 * The probe set is cached on disk and never regenerated implicitly.
 *
 * Both arms have to answer the identical questions or the comparison
 * says nothing, and a set regenerated between runs is a different exam.
 * Delete the file to build a new one.
 */
export function saveProbes(probes: Probe[]): void {
  mkdirSync(dirname(PROBE_FILE), { recursive: true })
  writeFileSync(PROBE_FILE, JSON.stringify(probes, null, 2))
}

export function loadProbes(): Probe[] {
  if (!existsSync(PROBE_FILE)) {
    throw new Error(
      'bakeoff: no probe set yet. Build one first:\n' +
        '  NODE_OPTIONS=--env-file=apps/web/.env npx vite-node scripts/bakeoff/probes.ts'
    )
  }
  return JSON.parse(readFileSync(PROBE_FILE, 'utf8')) as Probe[]
}

/** A percentage, or a dash where there was nothing to take one of. */
export function pct(part: number, whole: number): string {
  return whole === 0 ? '   —  ' : `${((part / whole) * 100).toFixed(1).padStart(5)}%`
}

export function heading(text: string): void {
  console.log(`\n${text}\n${'─'.repeat(text.length)}`)
}
