import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { embed } from '@/lib/embedding'
import { resolveConcept, fetchCandidates } from '@/lib/resolver'
import { sortIntoBed, type BedTopic, type Sorted } from '@/lib/llm/filing'
import { buildTopicTree } from '@didactic/core/subject'
import { revalidateTag } from 'next/cache'
import { tags } from '@didactic/core/tags'
import type { SupabaseClient } from '@supabase/supabase-js'

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


/** The resolver's similarity search, and then one model call over the
 *  bed. The same ceiling as relating a bed, for the same reason. */
export const maxDuration = 60

/**
 * Add a topic to a subject by name.
 *
 * Two readings, and they answer different questions. The resolver
 * reads the title against the whole map through an embedding, which is
 * what stops "Postgres" typed into a subject that already holds
 * "PostgreSQL" from growing a second topic beside it. Then the sort
 * reads the topic against *this bed* -- the subject it was typed into
 * and everything already standing in it -- which is what says where it
 * goes.
 *
 * The second reading is the one that was missing. A topic added by
 * hand was filed and then left unplaced: no edges, so the outline
 * printed it as one more root at the foot of the bed and the graph
 * drew it floating beside everything it belongs to. The bed was never
 * consulted, and the bed is what places a topic.
 *
 * They also check each other, in one direction only. Where the
 * embedding was unsure and the sort says this is nothing already here,
 * the topic is sown rather than queued -- a second opinion that clears
 * it. Where the embedding was sure it was new and the sort says it is
 * a restatement of something in the bed, it is queued rather than
 * merged. A wrong merge destroys history and a wrong split costs a
 * click, so the model may always raise a question and may never
 * settle one.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: subjectId } = await params
  const body = await req.json()
  const title = typeof body.title === 'string' ? body.title.trim() : ''
  // A topic named by id rather than by name. Additive: a client that
  // sends only a title behaves exactly as it did.
  const topicId = typeof body.topicId === 'string' ? body.topicId.trim() : ''
  // Several at once, for the loose stock sheet.
  const topicIds: string[] = Array.isArray(body.topicIds)
    ? body.topicIds.filter((i: unknown) => typeof i === 'string')
    : []

  if (!title && !topicId && topicIds.length === 0) {
    return NextResponse.json({ error: 'title, topicId or topicIds is required' }, { status: 400 })
  }

  const db = supabaseAdmin()
  const { data: subject } = await db
    .from('subjects').select('id, user_id, title').eq('id', subjectId).single()
  if (!subject) return NextResponse.json({ error: 'no such subject' }, { status: 404 })

  // Filing a topic the reader has pointed at, rather than one they have
  // typed the name of. There is nothing to resolve -- they have named
  // the row itself, and running the embedding over its title could only
  // disagree with them -- but it still has to be *placed*, which is the
  // same job either way and the reason this does not just insert a
  // membership row and stop.
  if (topicId) return await file(db, subject, topicId)
  if (topicIds.length > 0) return await fileMany(db, subject, topicIds)

  const vector = await embed(title)
  const candidates = await fetchCandidates(db, vector)
  const resolution = resolveConcept(title, candidates, vector)

  const bed = await readBed(db, subjectId)
  const warnings: string[] = []

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

    // A topic that already existed elsewhere arrives with its own
    // history and none of its edges into this bed. Placing it is the
    // same job as placing a new one.
    const sorted = await sort(subject.title, resolution.topicId, title, bed, warnings)
    const placed = await draw(db, subject.user_id, sorted)

    dropCache()
    return NextResponse.json({
      topicId: resolution.topicId,
      action: 'linked',
      placed,
      note: sorted?.note ?? null,
      warnings,
    })
  }

  // Nothing is written until the sort has had its say, because what it
  // says can change what is written: a topic the embedding called new
  // and the sort calls a restatement is queued rather than sown.
  const sorted = await sort(subject.title, PROSPECT, title, bed, warnings)

  // The model may raise a question the embedding did not, and may
  // clear one the embedding raised. It may never merge: `sameAs` is a
  // reason to ask, never a reason to join two histories.
  const queued =
    sorted?.sameAs != null ||
    (resolution.action === 'pending' && (sorted === null || sorted.sameAs !== null))

  const { data: topic, error } = await db.from('topics').insert({
    user_id: subject.user_id,
    title,
    slug: `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${crypto.randomUUID().slice(0, 4)}`,
    summary: null,
    embedding: JSON.stringify(vector),
    primary_subject_id: subjectId,
    state: queued ? 'pending' : 'active',
    created_by: 'user',
  }).select('id').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // The sort answered about a topic that had no id yet, so its edges
  // name the placeholder. They are the same edges either way: the
  // stand-in is swapped for the row that was just written.
  const placed = await draw(
    db,
    subject.user_id,
    sorted && {
      ...sorted,
      edges: sorted.edges.map(e => ({
        ...e,
        from: e.from === PROSPECT ? topic.id : e.from,
        to: e.to === PROSPECT ? topic.id : e.to,
      })),
    }
  )

  // No exposure is written. Adding a topic says it belongs on the map,
  // not that any of it has been learned: ability stays at the floor
  // until something real is filed against it.
  dropCache()
  return NextResponse.json({
    topicId: topic.id,
    action: queued ? 'pending' : 'created',
    // Said plainly, because "waiting for you" reads very differently
    // depending on which reading raised the question.
    queriedBy: queued ? (sorted?.sameAs != null ? 'sort' : 'resolver') : null,
    placed,
    note: sorted?.note ?? null,
    warnings,
  })
}

/**
 * File several existing topics into this bed at once, unplaced.
 *
 * Deliberately without the sort. Placing one topic is a model call over
 * the whole bed; placing thirty is thirty of them, which is several
 * minutes and well past the platform's ceiling — a bulk file that timed
 * out halfway would leave the reader with no idea which half landed.
 *
 * So this does the part that is certain and says what it has not done.
 * *Draw connections* on the bed already asks what follows what across
 * every topic in it in one pass, which is both the right tool and a
 * control the reader already knows; the answer points at it rather than
 * pretending the filing is finished.
 */
async function fileMany(
  db: SupabaseClient,
  subject: { id: string; user_id: string; title: string },
  topicIds: string[]
) {
  const { data: owned } = await db
    .from('topics').select('id').eq('user_id', subject.user_id).in('id', topicIds)

  const ids = (owned ?? []).map(t => t.id as string)
  if (ids.length === 0) return NextResponse.json({ error: 'no such topics' }, { status: 404 })

  const { error } = await db.from('topic_subjects').upsert(
    ids.map(topic_id => ({ topic_id, subject_id: subject.id, created_by: 'user' as const })),
    { onConflict: 'topic_id,subject_id', ignoreDuplicates: true }
  )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // A topic that was loose had no home either. The bed it has just
  // joined is the only candidate, and a topic filed somewhere while
  // claiming a home nowhere is the inconsistency `012` added the
  // membership table to prevent.
  await db.from('topics')
    .update({ primary_subject_id: subject.id })
    .in('id', ids)
    .is('primary_subject_id', null)

  dropCache()
  return NextResponse.json({
    filed: ids.length,
    skipped: topicIds.length - ids.length,
    placed: null,
    note: `Filed under ${subject.title}, but not placed in it — use Draw connections on the bed to work out what follows what.`,
  })
}

/**
 * File a topic that already exists into this bed, and place it in it.
 *
 * Membership is many-to-many by design: exposure is needed by portrait
 * photography and by landscape photography, JavaScript by front-end and
 * by app development, and `012` made a topic able to say so. What was
 * missing was any way to say it after the fact -- a topic could be
 * typed into a bed by name and taken out of one, and that was the whole
 * vocabulary. Moving one, or filing one under a second subject, meant
 * typing its name again somewhere else and hoping the resolver reached
 * the same row.
 *
 * This is additive to the subject, never a move: the topic keeps every
 * other subject it sits under. Taking it out of one is the DELETE
 * below, and a move is the two together -- which is what the topic
 * sheet does, in that order, so a failure leaves it filed somewhere
 * rather than nowhere.
 */
async function file(
  db: SupabaseClient,
  subject: { id: string; user_id: string; title: string },
  topicId: string
) {
  const { data: topic } = await db
    .from('topics').select('id, title, user_id').eq('id', topicId).maybeSingle()

  if (!topic) return NextResponse.json({ error: 'no such topic' }, { status: 404 })
  // The bed and the topic have to belong to the same person. Every
  // route is behind the gate, but a write that files one owner's topic
  // into another's bed should be impossible rather than merely
  // unreachable.
  if (topic.user_id !== subject.user_id) {
    return NextResponse.json({ error: 'no such topic' }, { status: 404 })
  }

  const { data: already } = await db
    .from('topic_subjects')
    .select('topic_id')
    .eq('topic_id', topicId)
    .eq('subject_id', subject.id)
    .maybeSingle()

  if (already) {
    return NextResponse.json(
      { topicId, title: topic.title, action: 'already-filed' },
      { status: 200 }
    )
  }

  const bed = await readBed(db, subject.id)
  const warnings: string[] = []

  const { error } = await db.from('topic_subjects').insert({
    topic_id: topicId,
    subject_id: subject.id,
    created_by: 'user',
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // A topic arriving from elsewhere brings its own history and none of
  // its edges into this bed. Unplaced, the outline prints it as one
  // more root at the foot and the graph draws it floating beside
  // everything it belongs to -- so it is sorted exactly as a new one is.
  const sorted = await sort(subject.title, topicId, topic.title, bed, warnings)
  const placed = await draw(db, subject.user_id, sorted)

  dropCache()
  return NextResponse.json({
    topicId,
    title: topic.title,
    action: 'linked',
    placed,
    note: sorted?.note ?? null,
    warnings,
  })
}

/**
 * The id the sort answers about for a topic that does not exist yet.
 *
 * It has to be shown *something* to relate, and inventing the row
 * first would mean writing a topic before knowing whether the sort is
 * about to call it a duplicate.
 */
const PROSPECT = 'the-new-topic'

/**
 * The bed as the sort is shown it: what is here, and what sits under
 * what. The nesting is the outline's own reading of the edges, so the
 * sort sees the same shape the reader does rather than a flat list.
 */
async function readBed(db: SupabaseClient, subjectId: string): Promise<BedTopic[]> {
  const { data: memberships } = await db
    .from('topic_subjects').select('topic_id').eq('subject_id', subjectId)
  const ids = (memberships ?? []).map(m => m.topic_id as string)
  if (ids.length === 0) return []

  const [{ data: topics }, { data: edges }] = await Promise.all([
    db.from('topics').select('id, title, summary').in('id', ids),
    db.from('edges').select('from_topic, to_topic, kind, weight')
      .in('from_topic', ids).in('to_topic', ids),
  ])

  const rows = (topics ?? []).map(t => ({
    id: t.id as string,
    title: t.title as string,
    summary: (t.summary as string | null) ?? null,
  }))

  const under = new Map<string, string>()
  const walk = (nodes: Array<{ topic: { id: string }; children: unknown[] }>, parent: string | null) => {
    for (const node of nodes) {
      if (parent) under.set(node.topic.id, parent)
      walk(node.children as typeof nodes, node.topic.id)
    }
  }
  walk(buildTopicTree(rows, edges ?? []), null)

  return rows.map(t => ({ ...t, under: under.get(t.id) ?? null }))
}

/**
 * Read the bed, and carry on without it when it cannot be read.
 *
 * A topic that could not be sorted is still a topic that was added.
 * Failing the whole request for want of a placement would make the one
 * thing the user asked for hostage to the extra thing they did not.
 */
async function sort(
  subjectTitle: string,
  topicId: string,
  title: string,
  bed: BedTopic[],
  warnings: string[]
): Promise<Sorted | null> {
  if (bed.length === 0) return null
  if (!process.env.ANTHROPIC_API_KEY) {
    warnings.push('it was filed but not placed: no key to read the bed with.')
    return null
  }

  try {
    return await sortIntoBed({ subjectTitle, topic: { id: topicId, title }, bed })
  } catch (e) {
    warnings.push(
      `it was filed but not placed against the rest of the bed: ${
        e instanceof Error ? e.message : String(e)
      }`
    )
    return null
  }
}

/** Draw what the sort proposed, the same way the bed's own edge pass
 *  draws: asking twice is ordinary here, so the count that comes back
 *  is what was actually new. */
async function draw(
  db: SupabaseClient,
  userId: string,
  sorted: Sorted | null
): Promise<number> {
  if (!sorted || sorted.edges.length === 0) return 0

  const { data } = await db.from('edges').upsert(
    sorted.edges.map(e => ({
      user_id: userId,
      from_topic: e.from,
      to_topic: e.to,
      kind: e.kind,
      weight: e.weight,
      created_by: 'ai' as const,
    })),
    { onConflict: 'from_topic,to_topic,kind', ignoreDuplicates: true }
  ).select('id')

  return data?.length ?? 0
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
