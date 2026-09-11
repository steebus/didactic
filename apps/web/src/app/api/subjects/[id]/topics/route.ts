import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { embed } from '@/lib/embedding'
import { resolveConcept, fetchCandidates } from '@/lib/resolver'
import { revalidateTag } from 'next/cache'
import { tags } from '@/lib/tags'

/**
 * Drop what this route just changed.
 *
 * The cache is only safe because every write says what it touched.
 * Erring wide is deliberate: serving a stale map is the one failure
 * this app cannot afford, and re-reading a sheet costs a few hundred
 * milliseconds once.
 */
function dropCache() {
  for (const tag of [tags.subjects, tags.topics, tags.pending]) revalidateTag(tag, 'max')
}


/**
 * Add a topic to a subject by name.
 *
 * The name goes through the same resolver every other write path uses,
 * so typing "Postgres" into a subject that already holds "PostgreSQL"
 * files the existing topic rather than growing a second one beside it.
 * A near-duplicate the resolver cannot call goes to the pending queue
 * for the user to adjudicate — a wrong merge destroys history, a wrong
 * split costs a click.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: subjectId } = await params
  const body = await req.json()
  const title = typeof body.title === 'string' ? body.title.trim() : ''

  if (!title) return NextResponse.json({ error: 'title is required' }, { status: 400 })

  const db = supabaseAdmin()
  const { data: subject } = await db
    .from('subjects').select('id, user_id').eq('id', subjectId).single()
  if (!subject) return NextResponse.json({ error: 'no such subject' }, { status: 404 })

  const vector = await embed(title)
  const candidates = await fetchCandidates(db, vector)
  const resolution = resolveConcept(title, candidates, vector)

  if (resolution.action === 'link') {
    const { data: existing } = await db
      .from('topic_subjects')
      .select('topic_id')
      .eq('topic_id', resolution.topicId)
      .eq('subject_id', subjectId)
      .maybeSingle()

    if (existing) {
      dropCache()
      return NextResponse.json(
        { topicId: resolution.topicId, action: 'already-filed' },
        { status: 200 }
      )
    }

    const { error } = await db.from('topic_subjects').insert({
      topic_id: resolution.topicId,
      subject_id: subjectId,
      created_by: 'user',
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    dropCache()
    return NextResponse.json({ topicId: resolution.topicId, action: 'linked' })
  }

  const { data: topic, error } = await db.from('topics').insert({
    user_id: subject.user_id,
    title,
    slug: `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${crypto.randomUUID().slice(0, 4)}`,
    summary: null,
    embedding: JSON.stringify(vector),
    primary_subject_id: subjectId,
    state: resolution.action === 'pending' ? 'pending' : 'active',
    created_by: 'user',
  }).select('id').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // No exposure is written. Adding a topic says it belongs on the map,
  // not that any of it has been learned: ability stays at the floor
  // until something real is filed against it.
  dropCache()
  return NextResponse.json({
    topicId: topic.id,
    action: resolution.action === 'pending' ? 'pending' : 'created',
  })
}

/**
 * Take a topic out of a subject.
 *
 * This unfiles rather than deletes. A topic carries its own exposure
 * history and may sit under several subjects, so removing it here must
 * not destroy what it holds elsewhere — a topic filed nowhere becomes
 * loose stock on the stock list and can be filed again.
 */
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: subjectId } = await params
  const body = await req.json().catch(() => ({}))
  const topicId = typeof body.topicId === 'string' ? body.topicId : ''

  if (!topicId) return NextResponse.json({ error: 'topicId is required' }, { status: 400 })

  const db = supabaseAdmin()
  const { error } = await db.from('topic_subjects')
    .delete().eq('topic_id', topicId).eq('subject_id', subjectId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // A topic whose home was this subject would otherwise keep claiming
  // it while no longer being filed under it, which is the exact
  // inconsistency the membership table exists to prevent. It is rehomed
  // to somewhere it actually sits, or to nowhere.
  const { data: topic } = await db
    .from('topics').select('primary_subject_id').eq('id', topicId).single()

  if (topic?.primary_subject_id === subjectId) {
    const { data: remaining } = await db
      .from('topic_subjects').select('subject_id').eq('topic_id', topicId).limit(1)

    await db.from('topics')
      .update({ primary_subject_id: remaining?.[0]?.subject_id ?? null })
      .eq('id', topicId)
  }

  const { count } = await db
    .from('topic_subjects')
    .select('subject_id', { count: 'exact', head: true })
    .eq('topic_id', topicId)

  dropCache()
  return NextResponse.json({ ok: true, loose: (count ?? 0) === 0 })
}
