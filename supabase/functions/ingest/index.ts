import { createClient } from 'jsr:@supabase/supabase-js@2'

const MAX_ATTEMPTS = 3

Deno.serve(async () => {
  const db = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const { data: msgs } = await db.rpc('read_ingestion', { p_vt: 300, p_qty: 1 })
  if (!msgs?.length) return new Response('idle')

  const msg = msgs[0]
  const resourceId = msg.message.resource_id

  const { data: job } = await db.from('ingestion_jobs')
    .select('*').eq('resource_id', resourceId).single()

  const attempts = (job?.attempts ?? 0) + 1

  try {
    await db.from('ingestion_jobs')
      .update({ state: 'running', attempts, updated_at: new Date().toISOString() })
      .eq('resource_id', resourceId)

    const res = await fetch(`${Deno.env.get('APP_URL')}/api/internal/ingest`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-internal-key': Deno.env.get('INTERNAL_KEY')!,
      },
      body: JSON.stringify({ resourceId }),
    })
    if (!res.ok) throw new Error(await res.text())

    await db.from('ingestion_jobs')
      .update({ state: 'done', error: null, updated_at: new Date().toISOString() })
      .eq('resource_id', resourceId)
    await db.rpc('delete_ingestion', { p_msg_id: msg.msg_id })
  } catch (e) {
    const permanent = attempts >= MAX_ATTEMPTS
    await db.from('ingestion_jobs').update({
      state: permanent ? 'failed' : 'pending',
      error: String(e),
      updated_at: new Date().toISOString(),
    }).eq('resource_id', resourceId)

    if (permanent) {
      // Give up: leave the resource queued with a visible error so the
      // user can retry it or turn it into a manual note.
      await db.rpc('delete_ingestion', { p_msg_id: msg.msg_id })
    }
  }

  return new Response('ok')
})
