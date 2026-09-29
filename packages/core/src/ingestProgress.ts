import { filingOf, type Filing, type JobState } from './filingState'

/**
 * What the reading of one resource has done so far, step by step.
 *
 * `filingState` says where a resource has got to in a word, which is
 * what a row in the inbox has room for. The send sheet has the whole
 * page and the reader's attention for the half-minute the reading takes,
 * so it is told the reading as it happens: the page fetched and how long
 * it was, what the model made of it, each concept it found and where
 * each one went on the map.
 *
 * The worker appends one of these to the ingestion job as it passes each
 * point (`ingestion_jobs.progress`, 068); a sheet that polls the job
 * prints them in order. Each attempt starts its own list, so a retry
 * does not print a failed attempt's steps as though they led anywhere.
 *
 * Pure, and here rather than in the sheet, because the phone's share
 * extension will print the same lines.
 */
export type IngestStep =
  /** The page is being fetched. `from` is the host, for the line. */
  | { kind: 'fetching'; from: string }
  /** The page, a video's transcript or a post's caption is in hand. */
  | { kind: 'fetched'; words: number; title: string | null }
  /** A document read in rounds: how far through it the reading is. */
  | { kind: 'pages'; done: number; of: number }
  /** The text has gone to the model to be read for what it is about. */
  | { kind: 'reading'; words: number }
  /** What the model said: its summary, the one thing the piece is about
   *  if it is about one thing, and the concepts it found. */
  | {
      kind: 'read'
      summary: string | null
      whole: string | null
      concepts: Array<{ name: string; description: string | null }>
    }
  /** Each concept is being looked for on the map. */
  | { kind: 'placing'; count: number }
  /** Where each one went: onto a topic already grown, a new topic, or
   *  the adjudication queue to be asked about. */
  | { kind: 'placed'; linked: string[]; created: string[]; asked: string[] }
  /** Already filed under the topic it was sent from; the reading added
   *  its summary and nothing else. */
  | { kind: 'kept' }
  /** The new topics have been drawn into the map. */
  | { kind: 'connected'; edges: number; bedded: number }

export type TimedStep = IngestStep & { at: string }

/** A topic the resource is filed against, as the sheet names it. */
export interface ProgressTopic {
  id: string
  title: string
  /** `pending` is a topic the reading was unsure of, waiting in the
   *  inbox to be asked about; `active` is one on the map. */
  state: string
}

/** What `GET /api/resources/[id]/progress` answers. */
export interface IngestProgress {
  id: string
  title: string
  summary: string | null
  job: { state: JobState; attempts: number; error: string | null } | null
  /** Empty before 068, and for a resource read before it. */
  steps: TimedStep[]
  topics: ProgressTopic[]
  filing: Filing
}

/** Nothing more will happen to it without someone asking again. */
export function isSettled(p: Pick<IngestProgress, 'job'>): boolean {
  return p.job === null || p.job.state === 'done' || p.job.state === 'failed'
}

const count = (n: number, one: string, many = `${one}s`) =>
  `${n.toLocaleString('en-GB')} ${n === 1 ? one : many}`

/** A list said as a sentence: "a", "a and b", "a, b and c". */
export function listed(names: string[]): string {
  if (names.length <= 1) return names[0] ?? ''
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/**
 * One step, said. `line` is the step; `aside`, where there is one, is
 * what the model said at that point, printed under it in its own voice.
 */
export function stepLine(step: IngestStep): { line: string; aside: string | null } {
  switch (step.kind) {
    case 'fetching':
      return { line: `Fetching it from ${step.from}`, aside: null }
    case 'fetched':
      return {
        line: step.words > 0 ? `Fetched · ${count(step.words, 'word')}` : 'Fetched',
        aside: step.title,
      }
    case 'pages':
      return { line: `Read ${step.done} of ${count(step.of, 'page')}`, aside: null }
    case 'reading':
      return { line: 'Reading it for what it is about', aside: null }
    case 'read': {
      const found = step.concepts.length
      const line = step.whole
        ? `It is about one thing: ${step.whole}`
        : found
          ? `Found ${count(found, 'concept')}`
          : 'Found nothing to file it by'
      return { line, aside: step.summary }
    }
    case 'placing':
      return { line: `Looking for ${step.count === 1 ? 'it' : `all ${step.count}`} on the map`, aside: null }
    case 'placed': {
      const parts = [
        step.linked.length ? `${step.linked.length} already growing` : null,
        step.created.length ? `${step.created.length} new` : null,
        step.asked.length ? `${step.asked.length} to ask you about` : null,
      ].filter((p): p is string => p !== null)
      return { line: parts.length ? `Placed: ${listed(parts)}` : 'Placed nowhere', aside: null }
    }
    case 'kept':
      return { line: 'Kept under the topic it was sent from', aside: null }
    case 'connected': {
      const drawn = step.edges ? `Drew ${count(step.edges, 'connection')}` : 'Drew no new connections'
      return {
        line: step.bedded ? `${drawn}, and filed ${step.bedded} into a subject` : drawn,
        aside: null,
      }
    }
  }
}

/**
 * The line for where it has got to now: under the last step while the
 * job is running, or the end of it once it has settled.
 */
export function progressNow(p: IngestProgress): string | null {
  if (p.job?.state === 'failed') return 'It could not be read, and has stopped trying.'
  if (p.job?.state === 'pending' && p.job.attempts > 0) {
    return `That attempt did not finish. It is tried again shortly (${p.job.attempts} of 3).`
  }
  if (p.job?.state === 'pending') return 'Waiting its turn to be read.'
  if (p.job?.state === 'running') return null
  if (p.filing === 'nothing') {
    return 'Read, and it matched no topic you are growing. Sow a subject that covers it and it will find a home.'
  }
  if (p.filing === 'filed') return `Filed under ${count(p.topics.length, 'topic')}.`
  return null
}

/** The pair read from the job row, as `filingState` reads it. */
export function progressFiling(job: IngestProgress['job'], topics: number): Filing {
  return filingOf({ job: job?.state ?? null, topics })
}

/** The progress column as stored, made safe to print. */
export function readSteps(value: unknown): TimedStep[] {
  if (!Array.isArray(value)) return []
  return value.filter(
    (s): s is TimedStep =>
      typeof s === 'object' && s !== null && typeof (s as { kind?: unknown }).kind === 'string' &&
      KINDS.has((s as { kind: string }).kind)
  )
}

const KINDS = new Set<string>([
  'fetching', 'fetched', 'pages', 'reading', 'read', 'placing', 'placed', 'kept', 'connected',
])
