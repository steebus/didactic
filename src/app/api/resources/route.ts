import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { ownerId } from '@/lib/auth'

export async function POST(req: Request) {
  const { url, title, kind, text, topicId, consumed } = await req.json()

  // Who is writing is settled by the session, never by the request. A
  // client that could name its own owner is a client that could write
  // rows nobody can sign in to read.
  const userId = await ownerId()
  if (!userId) return NextResponse.json({ error: 'not signed in' }, { status: 401 })

  if (!kind) return NextResponse.json({ error: 'kind is required' }, { status: 400 })
  if (kind === 'article' && !url) {
    return NextResponse.json({ error: 'url is required for articles' }, { status: 400 })
  }
  if (kind === 'note' && !text) {
    return NextResponse.json({ error: 'text is required for notes' }, { status: 400 })
  }

  const db = supabaseAdmin()
  const { data, error } = await db.from('resources').insert({
    user_id: userId,
    url: url ?? null,
    title: title ?? url ?? 'Untitled',
    kind,
    raw_text: text ?? null,
    // Material offered as evidence of what you already hold arrives
    // read, not queued. It writes no exposure: nothing is linked to a
    // topic yet, and the same evidence is already folded into whatever
    // starting figure it was offered against, so counting it here would
    // count it twice.
    status: consumed ? 'consumed' : 'queued',
    consumed_at: consumed ? new Date().toISOString() : null,
  }).select('id, title').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Added from a topic sheet: the association is stated, not guessed.
  // Ingestion still runs and may find further topics, but this one is
  // certain and should not wait on a model to agree.
  if (topicId) {
    await db.from('resource_topics').insert({
      resource_id: data.id,
      topic_id: topicId,
      relevance: 0.9,
    })
  }

  await db.from('ingestion_jobs').insert({ resource_id: data.id })
  const { error: queueError } = await db.rpc('enqueue_ingestion', { p_resource_id: data.id })
  if (queueError) {
    return NextResponse.json(
      { id: data.id, title: data.title, warning: `saved but not queued: ${queueError.message}` },
      { status: 202 }
    )
  }

  return NextResponse.json({ id: data.id, title: data.title })
}

export async function GET() {
  const db = supabaseAdmin()
  const { data, error } = await db.from('resources')
    .select('*').order('added_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ resources: data })
}
