import { after } from 'next/server'
import { revalidateTag } from 'next/cache'
import { supabaseAdmin } from './supabase'
import { ingestResource } from './ingest'
import { tags } from '@didactic/core/tags'

/** The same ceiling the Edge Function worker gives up at. */
const MAX_ATTEMPTS = 3

/**
 * How long a message is hidden from every other reader once taken.
 * Matches the worker, so the two never read the same resource at once.
 */
const VISIBILITY_S = 300

/** Another message is taken only while this much of the call is left unspent. */
const TAKE_WITHIN_MS = 15_000

/** When a round must stop, leaving room for the answer to get out. */
const BUDGET_MS = 50_000

/**
 * Work the ingestion queue from inside the app, after the response.
 *
 * The queue used to be worked only by the Edge Function, called once a
 * minute by pg_cron -- which is three settings nobody's deploy makes:
 * `app.edge_url` and `app.service_key` on the database, `APP_URL` and
 * `INTERNAL_KEY` on the function, and `INTERNAL_KEY` again on Vercel.
 * Any one missing and every resource said "Waiting" forever, silently.
 *
 * So whatever queues a resource, or looks at a waiting one, drains the
 * queue itself. The cron is still there, and when it is set up the two
 * share the queue safely: a taken message is invisible to the other for
 * five minutes, the same as it always was.
 *
 * The route or page calling this needs `maxDuration = 60`: work run
 * after the response gets the route's time and no more.
 */
export function drainAfter(started = Date.now()) {
  after(() => drain(started))
}

/**
 * @param started When the calling route began. A route that has already
 *   spent some of its minute passes its own start, so the rounds run
 *   here are budgeted against what is actually left of it.
 */
export async function drain(started = Date.now()): Promise<void> {
  const db = supabaseAdmin()
  let worked = false

  try {
    while (Date.now() - started < TAKE_WITHIN_MS) {
      const outcome = await workOne(db, started + BUDGET_MS)
      if (outcome === 'idle') break
      worked = true
    }
  } catch (e) {
    // The queue itself could not be read. Nothing was taken, so nothing
    // is stuck; the next caller tries again.
    console.error('drain:', e instanceof Error ? e.message : e)
  }

  if (worked) {
    for (const tag of [tags.resources, tags.topics, tags.subjects, tags.pending]) {
      revalidateTag(tag, 'max')
    }
  }
}

/**
 * Take one message and file its resource. The worker's contract, kept:
 * every path either deletes the message or leaves it to come round
 * again on purpose, because the queue is ordered and a message neither
 * finished nor given up blocks everything behind it.
 */
async function workOne(
  db: ReturnType<typeof supabaseAdmin>,
  deadline: number
): Promise<'idle' | 'worked'> {
  const { data: msgs, error } = await db.rpc('read_ingestion', {
    p_vt: VISIBILITY_S,
    p_qty: 1,
  })
  if (error) throw error
  if (!msgs?.length) return 'idle'

  const msg = msgs[0] as { msg_id: number; message: { resource_id?: string } | null }
  const resourceId = msg.message?.resource_id

  if (!resourceId) {
    await db.rpc('delete_ingestion', { p_msg_id: msg.msg_id })
    return 'worked'
  }

  const [{ data: job }, { data: resource }] = await Promise.all([
    db.from('ingestion_jobs').select('attempts').eq('resource_id', resourceId).maybeSingle(),
    db.from('resources').select('id').eq('id', resourceId).maybeSingle(),
  ])

  if (!resource || !job) {
    await db.rpc('delete_ingestion', { p_msg_id: msg.msg_id })
    return 'worked'
  }

  const attempts = ((job.attempts as number | null) ?? 0) + 1

  try {
    await db.from('ingestion_jobs')
      .update({ state: 'running', attempts, updated_at: new Date().toISOString() })
      .eq('resource_id', resourceId)

    // A document read in rounds re-queues itself from in here; the
    // message taken above is finished with either way.
    await ingestResource(db, resourceId, { deadline })

    await db.from('ingestion_jobs')
      .update({ state: 'done', error: null, updated_at: new Date().toISOString() })
      .eq('resource_id', resourceId)
    await db.rpc('delete_ingestion', { p_msg_id: msg.msg_id })
  } catch (e) {
    const permanent = attempts >= MAX_ATTEMPTS
    await db.from('ingestion_jobs').update({
      state: permanent ? 'failed' : 'pending',
      // A database error is a plain object, not an Error.
      error: (e as { message?: string } | null)?.message ?? String(e),
      updated_at: new Date().toISOString(),
    }).eq('resource_id', resourceId)

    // Given up: the row keeps its error for the reader to see. Short of
    // that the message is left, to come round again once it is visible.
    if (permanent) await db.rpc('delete_ingestion', { p_msg_id: msg.msg_id })
  }

  return 'worked'
}
