import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { generateRefresher } from '@/lib/llm/refresher'

export async function POST(_: Request, { params }: { params: Promise<{ nodeId: string }> }) {
  const { nodeId } = await params
  const db = supabaseAdmin()

  const { data: node } = await db.from('nodes').select('*').eq('id', nodeId).single()
  if (!node) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const { data: links } = await db.from('resource_nodes')
    .select('resources(title, summary, url, status)').eq('node_id', nodeId)

  const consumed = (links ?? [])
    .map(l => l.resources as unknown as {
      title: string; summary: string | null; url: string | null; status: string
    })
    .filter(r => r?.status === 'consumed')

  // Reuse a stored refresher rather than paying to regenerate one.
  const { data: existing } = await db.from('conversations')
    .select('id, started_at, messages(content)')
    .eq('node_id', nodeId).eq('kind', 'refresher')
    .order('started_at', { ascending: false }).limit(1).maybeSingle()

  const stored = (existing?.messages as Array<{ content: string }> | undefined)?.[0]
  if (stored) {
    return NextResponse.json({
      content: stored.content,
      resources: consumed,
      cached: true,
    })
  }

  let content: string
  try {
    content = await generateRefresher(
      { title: node.title, summary: node.summary, ability: Number(node.ability) },
      consumed
    )
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    // No key, or the model failed. Say so plainly rather than showing an
    // empty page: the user's own material below is still worth having.
    return NextResponse.json(
      { error: message, resources: consumed },
      { status: message.includes('ANTHROPIC_API_KEY') ? 503 : 502 }
    )
  }

  const { data: convo } = await db.from('conversations')
    .insert({ user_id: node.user_id, kind: 'refresher', node_id: nodeId })
    .select('id').single()
  await db.from('messages').insert({
    conversation_id: convo!.id, role: 'assistant', content,
  })

  return NextResponse.json({ content, resources: consumed, cached: false })
}
