import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { ownerId } from '@/lib/auth'
import { revalidateTag } from 'next/cache'
import { tags } from '@didactic/core/tags'
import { slugFor } from '@didactic/core/sections'
import { embed } from '@/lib/embedding'

/**
 * Drop what accepting a topic changed.
 *
 * A new topic is a new row on the map, which every bed sheet and the
 * loose list are built from.
 */
function dropCache() {
  for (const tag of [tags.topics, tags.subjects]) revalidateTag(tag, 'max')
}

/**
 * Accept a proposed topic.
 *
 * The one thing in this feature that puts a row in the map, and the only
 * place it can happen: the agent's loop has no path to here. Which is
 * the whole of the argument for letting it keep marks and cards by
 * itself -- those are the reader's own material, and this is not.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await ownerId()
  if (!userId) return NextResponse.json({ error: 'not signed in' }, { status: 401 })

  const { id } = await params

  const { name, summary } = (await req.json().catch(() => ({}))) as {
    name?: string
    summary?: string
  }
  if (!name) return NextResponse.json({ error: 'no name' }, { status: 400 })

  const db = supabaseAdmin()

  // The conversation is checked before anything is created: the id names
  // it and arrives from a browser.
  const { data: conversation } = await db
    .from('conversations')
    .select('id')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle()
  if (!conversation) return NextResponse.json({ error: 'not found' }, { status: 404 })

  // `topics` is `nodes` renamed (012), so the column is `title`, and
  // there is a unique on (user_id, slug) to respect. A topic already
  // standing is returned rather than refused: accepting twice is a
  // double tap, not an error worth showing.
  const slug = slugFor(name)
  const { data: standing } = await db
    .from('topics')
    .select('id')
    .eq('user_id', userId)
    .eq('slug', slug)
    .maybeSingle()

  if (standing) return NextResponse.json({ topicId: standing.id })

  // The embedding is not optional furniture. `match_topics` selects
  // `where state = 'active' and embedding is not null`, so a topic
  // written without one is invisible to the resolver for good -- and the
  // next ingestion that meets the same concept would create the very
  // near-duplicate `search_map` exists to prevent. A topic the resolver
  // cannot see is worse than no topic.
  let vector: number[]
  try {
    vector = await embed(name)
  } catch {
    return NextResponse.json(
      { error: 'the topic could not be added just now' },
      { status: 503 }
    )
  }

  const { data, error } = await db
    .from('topics')
    .insert({
      user_id: userId,
      title: name,
      slug,
      summary: summary ?? null,
      embedding: JSON.stringify(vector),
      created_by: 'user',
    })
    .select('id')
    .single()

  if (error || !data) return NextResponse.json({ error: 'could not create the topic' }, { status: 500 })

  dropCache()
  return NextResponse.json({ topicId: data.id })
}
