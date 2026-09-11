import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { ownerId } from '@/lib/auth'
import { revalidateTag } from 'next/cache'
import { tags } from '@didactic/core/tags'

/**
 * Drop what this route just changed.
 *
 * The cache is only safe because every write says what it touched.
 * Erring wide is deliberate: serving a stale map is the one failure
 * this app cannot afford, and re-reading a sheet costs a few hundred
 * milliseconds once.
 */
function dropCache() {
  for (const tag of [tags.resources, tags.topics]) revalidateTag(tag, 'max')
}


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

  // The same thing filed twice is one thing, not two.
  //
  // This inserted unconditionally, so sending a link a second time --
  // or looking a book up again months later -- made a second row with
  // its own topic links and its own read state. The map then counted
  // one book as two pieces of evidence. A URL is the identity where
  // there is one: Open Library resolves a work to a stable URL, so a
  // book looked up twice arrives with the same one.
  //
  // Filing it again is not an error and does not overwrite anything.
  // What it does is file the existing row against the topic you were
  // filing from, which is almost always what was actually meant.
  const trimmedUrl = typeof url === 'string' && url.trim() ? url.trim() : null
  if (trimmedUrl) {
    const { data: already } = await db.from('resources')
      .select('id, title, status')
      .eq('user_id', userId)
      .eq('url', trimmedUrl)
      .limit(1)
      .maybeSingle()

    if (already) {
      if (topicId) {
        await db.from('resource_topics').upsert(
          { resource_id: already.id, topic_id: topicId, relevance: 0.9 },
          { onConflict: 'resource_id,topic_id', ignoreDuplicates: true }
        )
      }
      dropCache()
      return NextResponse.json({
        id: already.id,
        title: already.title,
        alreadyFiled: true,
        filedHereToo: Boolean(topicId),
      })
    }
  }

  const { data, error } = await db.from('resources').insert({
    user_id: userId,
    url: trimmedUrl,
    title: title ?? trimmedUrl ?? 'Untitled',
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
    dropCache()
    return NextResponse.json(
      { id: data.id, title: data.title, warning: `saved but not queued: ${queueError.message}` },
      { status: 202 }
    )
  }

  dropCache()
  return NextResponse.json({ id: data.id, title: data.title })
}

export async function GET() {
  const db = supabaseAdmin()
  const { data, error } = await db.from('resources')
    .select('*').order('added_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ resources: data })
}
