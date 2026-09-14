import { createClient } from 'jsr:@supabase/supabase-js@2'

const MAX_ATTEMPTS = 3

/**
 * The ingestion worker: takes one message, files one resource.
 *
 * Run once a minute by pg_cron (010). One message per invocation
 * deliberately -- a round is budgeted against the platform's function
 * ceiling, and a worker that took a batch would be killed part way
 * through the second one.
 *
 * **Every path out of here either deletes the message or leaves it to
 * be redelivered on purpose.** That is the whole contract. A message
 * that can be taken and neither finished nor given up is a message that
 * blocks the queue behind it forever, and the queue is ordered: one
 * stuck at the head stops every resource added after it.
 */
Deno.serve(async () => {
  const db = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // The two secrets this worker cannot work without, checked before a
  // message is taken rather than after.
  //
  // Unset, `fetch` was called with the string "undefined/api/internal/
  // ingest" and threw a TypeError about an invalid URL -- which was
  // recorded against the job as the reason ingestion failed, three
  // attempts deep, for a resource that was perfectly fine. Said plainly
  // here, and said *without* spending an attempt: a misconfigured
  // deployment is not a resource that cannot be read, and burning
  // MAX_ATTEMPTS on it would mark every queued resource permanently
  // failed the moment someone forgot to set a secret.
  const appUrl = Deno.env.get('APP_URL')
  const internalKey = Deno.env.get('INTERNAL_KEY')
  if (!appUrl || !internalKey) {
    const missing = [!appUrl && 'APP_URL', !internalKey && 'INTERNAL_KEY']
      .filter(Boolean)
      .join(' and ')
    console.error(`ingest: ${missing} not set; nothing can be filed until it is`)
    return new Response(`not configured: ${missing} not set`, { status: 500 })
  }

  const { data: msgs } = await db.rpc('read_ingestion', { p_vt: 300, p_qty: 1 })
  if (!msgs?.length) return new Response('idle')

  const msg = msgs[0]
  const resourceId = msg.message?.resource_id

  // A message naming nothing. Nothing can be done with it and nothing
  // ever will be, so it goes rather than coming round again every
  // minute for the life of the database.
  if (!resourceId) {
    await db.rpc('delete_ingestion', { p_msg_id: msg.msg_id })
    return new Response('dropped a message with no resource')
  }

  // The job row this message belongs to.
  //
  // `maybeSingle` rather than `single`: a resource removed from the
  // inbox takes its job row with it and leaves the message behind, and
  // `single` answers that with an error this worker used to ignore --
  // after which every update below matched zero rows, the attempt
  // counter never moved off zero, MAX_ATTEMPTS was never reached, and
  // the message was put back to be taken again a minute later. One
  // resource deleted before it was read jammed the queue permanently,
  // and every resource added afterwards sat at 'queued' forever.
  const { data: job } = await db.from('ingestion_jobs')
    .select('attempts').eq('resource_id', resourceId).maybeSingle()

  // Nothing to file. The resource is gone, or the job row it was
  // written with is. Either way this message has no work in it.
  const { data: resource } = await db.from('resources')
    .select('id').eq('id', resourceId).maybeSingle()

  if (!resource || !job) {
    await db.rpc('delete_ingestion', { p_msg_id: msg.msg_id })
    return new Response('dropped a message for a resource that is gone')
  }

  const attempts = (job.attempts ?? 0) + 1

  try {
    await db.from('ingestion_jobs')
      .update({ state: 'running', attempts, updated_at: new Date().toISOString() })
      .eq('resource_id', resourceId)

    const res = await fetch(`${appUrl}/api/internal/ingest`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-internal-key': internalKey,
      },
      body: JSON.stringify({ resourceId }),
    })
    if (!res.ok) {
      // What the app actually said, not "Error".
      //
      // The route answers `{"error": "..."}`; `String(e)` on an Error
      // built from that body gave "Error" plus the JSON, and what was
      // recorded against the job was the word alone -- so a resource
      // that failed for a nameable reason said nothing about it on the
      // sheet. The reason is what the reader needs and the only thing
      // worth keeping.
      const body = await res.text()
      let reason = body
      try {
        reason = (JSON.parse(body) as { error?: string }).error ?? body
      } catch {
        // Not JSON: an upstream proxy, a timeout, an HTML error page.
        // The status is then the most useful thing there is.
        reason = `${res.status}: ${body.slice(0, 200)}`
      }
      throw new Error(reason)
    }

    // A document read in rounds re-queues itself from inside the route
    // and is not finished yet; the message taken here is still done
    // with either way, and the fresh one takes its place.
    await db.from('ingestion_jobs')
      .update({ state: 'done', error: null, updated_at: new Date().toISOString() })
      .eq('resource_id', resourceId)
    await db.rpc('delete_ingestion', { p_msg_id: msg.msg_id })
  } catch (e) {
    const permanent = attempts >= MAX_ATTEMPTS
    await db.from('ingestion_jobs').update({
      state: permanent ? 'failed' : 'pending',
      error: e instanceof Error ? e.message : String(e),
      updated_at: new Date().toISOString(),
    }).eq('resource_id', resourceId)

    if (permanent) {
      // Give up: leave the resource queued with a visible error so the
      // user can retry it or turn it into a manual note.
      await db.rpc('delete_ingestion', { p_msg_id: msg.msg_id })
    }
    return new Response(`failed (attempt ${attempts})`)
  }

  return new Response('ok')
})
