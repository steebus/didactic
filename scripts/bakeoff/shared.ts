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

/**
 * A PostgREST failure as something with a stack on it.
 *
 * `{ data, error }` hands back a plain object, not an `Error`. Thrown as
 * it arrives from a script whose work is top-level `await`, Node reports
 * the whole thing as `UnhandledPromiseRejection ... the reason
 * "#<Object>"` and nothing else -- no message, no code, no hint, and no
 * line. Which is how an ambiguous embed spent a run looking like a fault
 * in the gateway.
 */
function fault(where: string, error: unknown): Error {
  const e = (error ?? {}) as Record<string, unknown>
  const parts = [`bakeoff: ${where} failed`]
  if (e.code) parts.push(`[${String(e.code)}]`)
  if (e.message) parts.push(String(e.message))
  const thrown = new Error(parts.join(' '))
  if (e.hint) thrown.message += `
  hint: ${String(e.hint)}`
  if (e.details) thrown.message += `
  details: ${JSON.stringify(e.details)}`
  return thrown
}

// Every script here is top-level await, so a rejection escaping one is
// reported by Node with the value stringified and nothing else. This
// prints what was actually thrown before the process goes.
process.on('unhandledRejection', reason => {
  console.error('')
  console.error('bakeoff: unhandled rejection')
  console.error('')
  if (reason instanceof Error) console.error(reason.stack ?? reason.message)
  else console.dir(reason, { depth: 6 })
  process.exit(1)
})

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
  if (error) throw fault('reading topics', error)

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
  // `topics!topic_subjects` rather than `topics`: there are two
  // relationships between the tables -- `primary_subject_id`, which is
  // the topic's home, and the `topic_subjects` join, which is every bed
  // it sits in -- so an unqualified embed is ambiguous and PostgREST
  // refuses it with PGRST201. Membership is the one wanted here, because
  // what a subject holds is the nearest thing it has to a description of
  // itself, and `012` made that many-to-many.
  const { data, error } = await db
    .from('subjects')
    .select('id, title, topics!topic_subjects(title)')
  if (error) throw fault('reading subjects', error)

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
  if (error) throw fault('match_topics', error)

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

/** One probe's distribution, kept for the threshold sweep. */
export interface SavedDistribution {
  kind: 'alias' | 'neighbour'
  name: string
  topicId: string
  topicTitle: string
  answered: boolean
  probabilities: Record<string, number> | null
}

const DISTRIBUTION_FILE = join(here, 'distributions.json')

export function saveDistributions(rows: SavedDistribution[]): void {
  writeFileSync(DISTRIBUTION_FILE, JSON.stringify(rows, null, 2))
  console.log('')
  console.log('Distributions written to scripts/bakeoff/distributions.json')
}

export function loadDistributions(): SavedDistribution[] {
  if (!existsSync(DISTRIBUTION_FILE)) {
    throw new Error(
      'bakeoff: no distributions yet. Run the bake-off first: ' +
        'node --env-file=apps/web/.env node_modules/vite-node/dist/cli.mjs scripts/bakeoff/bakeoff.ts'
    )
  }
  return JSON.parse(readFileSync(DISTRIBUTION_FILE, 'utf8')) as SavedDistribution[]
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
