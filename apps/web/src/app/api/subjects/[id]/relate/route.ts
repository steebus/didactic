import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { ownerId } from '@/lib/auth'
import { revalidateTag } from 'next/cache'
import { tags } from '@didactic/core/tags'
import { drawConnections, neighboursOfBed } from '@/lib/sowing'

/** Edges change every sheet the bed appears on and the graph itself,
 *  and the subject's own sheet carries the wide tag as well as its own
 *  id, so the wide drop takes it with the rest. */
function dropCache() {
  for (const tag of [tags.subjects, tags.topics]) revalidateTag(tag, 'max')
}

/** One model call over the whole bed, and a similarity search per
 *  topic before it. The same ceiling as the sowing, for the same
 *  reason. */
export const maxDuration = 60

/**
 * Draw the connections between the topics in a bed.
 *
 * This is the sowing's last step, on its own. The sowing gives it up
 * when the platform's minute runs short -- it is one more model call
 * over the whole bed and it is the longest single thing in the
 * request, so finishing without it is better than being cut off with
 * it -- and a bed that lost it that way is a set of unconnected nodes
 * on the graph until something asks again. This is the asking.
 *
 * It is also worth pressing on a bed that was grown by hand: topics
 * added by name one at a time are related to nothing, because the
 * resolver files a topic without ever being asked what it follows.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    return await relate(id)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json(
      { error: `Could not draw the connections: ${message}` },
      { status: 500 }
    )
  }
}

async function relate(subjectId: string) {
  const userId = await ownerId()
  if (!userId) return NextResponse.json({ error: 'not signed in' }, { status: 401 })

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY not set, so nothing can be related yet.' },
      { status: 503 }
    )
  }

  const db = supabaseAdmin()
  const { data: subject } = await db
    .from('subjects').select('id, user_id').eq('id', subjectId).single()
  if (!subject) return NextResponse.json({ error: 'no such subject' }, { status: 404 })

  const { data: memberships } = await db
    .from('topic_subjects').select('topic_id').eq('subject_id', subjectId)
  const topicIds = (memberships ?? []).map(m => m.topic_id)

  if (topicIds.length < 2) {
    return NextResponse.json(
      { error: 'A connection needs two ends. Sow another topic here first.' },
      { status: 409 }
    )
  }

  const { data: rows } = await db
    .from('topics').select('id, title, embedding').in('id', topicIds)

  // PostgREST serialises a pgvector column as a JSON string. Left
  // unparsed it reaches the similarity search as characters, and every
  // neighbour comes back scored at nothing.
  const bed = (rows ?? [])
    .map(row => ({
      id: row.id as string,
      title: row.title as string,
      embedding: readVector(row.embedding),
    }))
    .filter(t => t.embedding.length > 0)

  if (bed.length < 2) {
    return NextResponse.json(
      {
        error:
          'The topics here have no embeddings, so there is nothing to measure them against. That usually means the embedding function is not answering.',
      },
      { status: 502 }
    )
  }

  // What the bed can attach to on the rest of the map, so relating it
  // does not shut it into itself. A failure here costs the outward
  // connections, not the inward ones, so the bed is still related to
  // itself rather than not at all.
  let neighbours: Array<{ id: string; title: string }> = []
  const warnings: string[] = []
  try {
    neighbours = await neighboursOfBed(db, bed)
  } catch (e) {
    warnings.push(
      `the rest of the map could not be searched, so this bed was related only to itself: ${
        e instanceof Error ? e.message : String(e)
      }`
    )
  }

  const drawn = await drawConnections(
    db,
    subject.user_id,
    bed.map(t => ({ id: t.id, title: t.title })),
    neighbours
  )

  dropCache()
  return NextResponse.json({ drawn, considered: bed.length, warnings })
}

function readVector(raw: unknown): number[] {
  if (Array.isArray(raw)) return raw as number[]
  if (typeof raw !== 'string') return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}
