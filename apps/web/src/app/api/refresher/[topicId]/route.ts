import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { generateRefresher } from '@/lib/llm/refresher'
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
  for (const tag of [tags.topics, tags.subjects]) revalidateTag(tag, 'max')
}


export async function POST(_: Request, { params }: { params: Promise<{ topicId: string }> }) {
  const { topicId } = await params
  const db = supabaseAdmin()

  const { data: topic } = await db.from('topics').select('*').eq('id', topicId).single()
  if (!topic) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const { data: links } = await db.from('resource_topics')
    .select('resources(title, summary, url, status)').eq('topic_id', topicId)

  const consumed = (links ?? [])
    .map(l => l.resources as unknown as {
      title: string; summary: string | null; url: string | null; status: string
    })
    .filter(r => r?.status === 'consumed')

  // Reuse a stored refresher rather than paying to regenerate one.
  const { data: existing } = await db.from('conversations')
    .select('id, started_at, messages(content)')
    .eq('topic_id', topicId).eq('kind', 'refresher')
    .order('started_at', { ascending: false }).limit(1).maybeSingle()

  const stored = (existing?.messages as Array<{ content: string }> | undefined)?.[0]
  if (stored) {
    dropCache()
    return NextResponse.json({
      content: stored.content,
      resources: consumed,
      cached: true,
    })
  }

  let content: string
  try {
    content = await generateRefresher(
      { title: topic.title, summary: topic.summary, ability: Number(topic.ability) },
      consumed
    )
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    // No key, or the model failed. Say so plainly rather than showing an
    // empty page: the user's own material below is still worth having.
    dropCache()
    return NextResponse.json(
      { error: message, resources: consumed },
      { status: message.includes('ANTHROPIC_API_KEY') ? 503 : 502 }
    )
  }

  const { data: convo } = await db.from('conversations')
    .insert({ user_id: topic.user_id, kind: 'refresher', topic_id: topicId })
    .select('id').single()
  await db.from('messages').insert({
    conversation_id: convo!.id, role: 'assistant', content,
  })

  dropCache()
  return NextResponse.json({ content, resources: consumed, cached: false })
}
