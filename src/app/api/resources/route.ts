import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(req: Request) {
  const { url, title, kind, text, userId } = await req.json()

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
    status: 'queued',
  }).select('id').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await db.from('ingestion_jobs').insert({ resource_id: data.id })
  const { error: queueError } = await db.rpc('enqueue_ingestion', { p_resource_id: data.id })
  if (queueError) {
    return NextResponse.json(
      { id: data.id, warning: `saved but not queued: ${queueError.message}` },
      { status: 202 }
    )
  }

  return NextResponse.json({ id: data.id })
}

export async function GET() {
  const db = supabaseAdmin()
  const { data, error } = await db.from('resources')
    .select('*').order('added_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ resources: data })
}
