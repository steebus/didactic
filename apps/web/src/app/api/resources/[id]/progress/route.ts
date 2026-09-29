import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { ownerId } from '@/lib/auth'
import { drainAfter } from '@/lib/drain'
import {
  progressFiling,
  readSteps,
  type IngestProgress,
  type ProgressTopic,
} from '@didactic/core/ingestProgress'
import type { JobState } from '@didactic/core/filingState'

/** A waiting job is nudged after this long, and not before: the route
 *  that filed it is usually working it already. */
const NUDGE_AFTER_MS = 15_000

/** The queue may be worked after the response. */
export const maxDuration = 60

/**
 * How the reading of one resource is going, for the send sheet to poll
 * (`core/ingestProgress`): the job's state, each step it has passed, and
 * every topic it is filed against so far.
 *
 * A read, polled every second or two while the reader watches, so it
 * drops no tags. Like the inbox, it works the queue itself when it finds
 * the job still waiting after the route that queued it should have taken
 * it: otherwise a missed `after` leaves the sheet saying *Waiting* until
 * the cron comes round, if it is set up at all.
 */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await ownerId()
  if (!userId) return NextResponse.json({ error: 'not signed in' }, { status: 401 })

  const { id } = await params
  const db = supabaseAdmin()

  const { data: resource } = await db
    .from('resources')
    .select('id, title, summary')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle()
  if (!resource) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const [job, { data: links }] = await Promise.all([
    readJob(db, id),
    db.from('resource_topics')
      .select('relevance, topics(id, title, state)')
      .eq('resource_id', id)
      .order('relevance', { ascending: false }),
  ])

  const topics: ProgressTopic[] = (links ?? []).flatMap(l => {
    const t = l.topics as unknown as { id: string; title: string; state: string } | null
    return t ? [{ id: t.id, title: t.title, state: t.state }] : []
  })

  if (job?.state === 'pending' && Date.now() - Date.parse(job.updatedAt) > NUDGE_AFTER_MS) {
    drainAfter()
  }

  const body: IngestProgress = {
    id: resource.id,
    title: resource.title,
    summary: resource.summary ?? null,
    job: job ? { state: job.state, attempts: job.attempts, error: job.error } : null,
    steps: job?.steps ?? [],
    topics,
    filing: progressFiling(job ? { state: job.state, attempts: job.attempts, error: job.error } : null, topics.length),
  }
  return NextResponse.json(body)
}

/**
 * The job row, with its steps where the column exists. Before 068 it
 * does not, and the row is read again without it: the sheet then says
 * where the job has got to in a word, as the inbox does.
 */
async function readJob(db: ReturnType<typeof supabaseAdmin>, resourceId: string) {
  const wanted = 'state, attempts, error, updated_at'
  let { data, error } = await db
    .from('ingestion_jobs')
    .select(`${wanted}, progress`)
    .eq('resource_id', resourceId)
    .limit(1)
    .maybeSingle()
  if (error) {
    ;({ data, error } = await db
      .from('ingestion_jobs')
      .select(wanted)
      .eq('resource_id', resourceId)
      .limit(1)
      .maybeSingle() as unknown as { data: typeof data; error: typeof error })
  }
  if (!data) return null
  const row = data as {
    state: JobState
    attempts: number | null
    error: string | null
    updated_at: string
    progress?: unknown
  }
  return {
    state: row.state,
    attempts: row.attempts ?? 0,
    error: row.error,
    updatedAt: row.updated_at,
    steps: readSteps(row.progress),
  }
}
