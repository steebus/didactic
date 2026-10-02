import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getPendingTopics } from '@/lib/pending'
import { fileWhatTheBedIsSureOf } from '@/lib/filing'
import { revalidateTag } from 'next/cache'
import { tags } from '@didactic/core/tags'
import { isRelation, relationEdge } from '@didactic/core/adjudication'
import { ownerId } from '@/lib/auth'

/**
 * Drop what this route just changed.
 *
 * The cache is only safe because every write says what it touched.
 * Erring wide is deliberate: serving a stale map is the one failure
 * this app cannot afford, and re-reading a sheet costs a few hundred
 * milliseconds once.
 */
function dropCache() {
  for (const tag of [tags.pending, tags.topics, tags.subjects]) revalidateTag(tag, { expire: 0 })
}

/**
 * Drop what a merge moved, which is more than a decision moves.
 *
 * `043` has the merge carry the marked passages and the cards over to
 * the survivor as well -- they were being cut loose from the topic they
 * were about -- so the two sheets that print them have to be re-read.
 */
function dropMergedCache() {
  dropCache()
  for (const tag of [tags.highlights, tags.clozes]) revalidateTag(tag, { expire: 0 })
}


export async function GET() {
  try {
    return NextResponse.json({ pending: await getPendingTopics() })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    )
  }
}

export async function PATCH(req: Request) {
  const { topicId, action, mergeInto, relateTo } = await req.json()
  const db = supabaseAdmin()

  if (!topicId) {
    return NextResponse.json({ error: 'topicId is required' }, { status: 400 })
  }

  if (action === 'confirm') {
    const { error } = await db.from('topics').update({ state: 'active' }).eq('id', topicId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // `commit_ingestion` refuses to file a pending topic -- it must not
    // be filed anywhere until the question about it is settled -- and
    // this is what settles it. The deferred filing never happened, so
    // every topic kept from the inbox landed in loose stock with its
    // edges already drawn, which is the shape the bed was showing: a
    // pale node joined five times to a coloured hull and belonging to
    // nothing. The bed is asked now, on the same bar ingestion uses.
    //
    // Never fatal. The topic is confirmed either way; an unfiled one is
    // on the loose sheet, which exists to list it and now says where it
    // looks like it goes.
    let filed: Array<{ topicId: string; subjectId: string }> = []
    try {
      filed = await fileWhatTheBedIsSureOf(db, [topicId])
    } catch {
      // Left loose, deliberately silently: the confirm succeeded.
    }

    dropCache()
    return NextResponse.json({ ok: true, filed: filed.length })
  }

  if (isRelation(action)) {
    if (!relateTo) {
      return NextResponse.json({ error: 'relateTo is required to relate' }, { status: 400 })
    }
    if (relateTo === topicId) {
      return NextResponse.json({ error: 'A topic cannot be related to itself.' }, { status: 400 })
    }
    const userId = await ownerId()
    if (!userId) return NextResponse.json({ error: 'not signed in' }, { status: 401 })

    // Keep both, and say how they stand. Settled the way `confirm`
    // settles it -- the topic goes active and the bed is asked where it
    // belongs -- with one edge drawn first. Asking twice is ordinary
    // here, so the edge is an upsert on its own key.
    const edge = relationEdge(action, topicId, relateTo)
    const { error: edgeError } = await db.from('edges').upsert(
      {
        user_id: userId,
        from_topic: edge.from,
        to_topic: edge.to,
        kind: edge.kind,
        weight: 0.8,
        created_by: 'user' as const,
      },
      { onConflict: 'from_topic,to_topic,kind', ignoreDuplicates: true }
    )
    if (edgeError) return NextResponse.json({ error: edgeError.message }, { status: 500 })

    const { error } = await db.from('topics').update({ state: 'active' }).eq('id', topicId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    let filed: Array<{ topicId: string; subjectId: string }> = []
    try {
      filed = await fileWhatTheBedIsSureOf(db, [topicId])
    } catch {
      // Left loose, as in `confirm`: the decision is saved either way.
    }

    dropCache()
    return NextResponse.json({ ok: true, filed: filed.length })
  }

  if (action === 'merge') {
    if (!mergeInto) {
      return NextResponse.json({ error: 'mergeInto is required to merge' }, { status: 400 })
    }
    // merge_topics moves links, exposures, edges, marks and cards before
    // deleting the duplicate. Destructive and irreversible, hence a user
    // decision.
    const { error } = await db.rpc('merge_topics', { p_from: topicId, p_into: mergeInto })
    if (error) return NextResponse.json({ error: sayWhy(error.message) }, { status: 500 })
    dropMergedCache()
    return NextResponse.json({ ok: true })
  }

  if (action === 'discard') {
    const { error } = await db.from('topics').delete().eq('id', topicId).eq('state', 'pending')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    dropCache()
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: `unknown action "${action}"` }, { status: 400 })
}

/**
 * A database failure, said in the sheet's own words.
 *
 * The queue printed `error.message` straight through, so a reader
 * pressing "same as" got *duplicate key value violates unique
 * constraint "edges_from_node_to_node_kind_key"* -- a constraint name
 * carrying two column names the schema stopped using in `012`. The
 * cause of that one is fixed in `043`; the habit of printing the
 * plumbing at someone mid-decision is fixed here. Anything not
 * recognised is still passed through rather than swallowed: an
 * unexplained failure is worse than an ugly one.
 */
function sayWhy(message: string): string {
  if (message.includes('edges_from_node_to_node_kind')) {
    return 'Both topics lead to the same thing, and the merge could not fold the two connections into one. The database needs migration 043; until it has run, keep these two separate.'
  }
  if (message.includes('cannot merge a topic into itself')) {
    return 'That is the same topic on both sides, so there is nothing to merge.'
  }
  return message
}
