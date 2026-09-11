import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { ownerId } from '@/lib/auth'
import { revalidateTag } from 'next/cache'
import { tags } from '@didactic/core/tags'
import {
  MAX_DOCUMENT_BYTES,
  ownsPath,
  titleFromFilename,
  tooLarge,
} from '@didactic/core/documents'

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

/**
 * The other half of a direct upload: the bytes have landed, file them.
 *
 * The path is not taken on trust. A client says where it put something,
 * and two things are checked before that becomes a row: that the path
 * is one of ours and carries this caller's own id, and that an object
 * is actually there. Without the first, a request could file somebody
 * else's object as its own; without the second, a resource row could
 * point at nothing and the shelf would carry an item that cannot be
 * opened. Both are cheap and neither is theoretical — the client is the
 * one part of this that is not ours.
 */
export async function POST(req: Request) {
  const userId = await ownerId()
  if (!userId) return NextResponse.json({ error: 'not signed in' }, { status: 401 })

  const { path, filename, consumed } = await req.json().catch(() => ({}))

  if (typeof path !== 'string' || !ownsPath(path, userId)) {
    return NextResponse.json({ error: 'that is not a path this account uploaded to' }, { status: 400 })
  }

  const db = supabaseAdmin()

  // Is anything actually there? `list` on the containing folder rather
  // than a download, because the answer needed is "yes, and this big",
  // and pulling a fifty-megabyte book into the function to find that
  // out would undo the point of the whole route.
  const folder = path.slice(0, path.lastIndexOf('/'))
  const name = path.slice(path.lastIndexOf('/') + 1)
  const { data: found, error: listError } = await db.storage
    .from('resources')
    .list(folder, { search: name, limit: 1 })

  if (listError) return NextResponse.json({ error: listError.message }, { status: 500 })

  const object = found?.find(o => o.name === name)
  if (!object) {
    return NextResponse.json({ error: 'nothing was uploaded to that path' }, { status: 404 })
  }

  // The ceiling, checked against what actually landed.
  //
  // `upload-url` checks the size the client *says* it is about to
  // upload, which is worth doing -- it fails fast, before the bytes
  // move -- but it is not a limit. A signed upload URL carries no size
  // of its own, so a client that claimed one megabyte and sent five
  // hundred would have been believed. This is the check that counts,
  // and the object goes back out of the bucket rather than being left
  // there unreferenced.
  const size = (object.metadata as { size?: number } | null)?.size ?? null
  if (size !== null && size > MAX_DOCUMENT_BYTES) {
    await db.storage.from('resources').remove([path])
    return NextResponse.json({ error: tooLarge(size) }, { status: 413 })
  }

  const title =
    typeof filename === 'string' && filename.trim()
      ? titleFromFilename(filename)
      : 'Uploaded document'

  const { data, error } = await db
    .from('resources')
    .insert({
      user_id: userId,
      title,
      kind: 'pdf',
      // Evidence of what you have already done is read material, not a
      // reading list. Nothing is scored from it here: no topics are
      // linked yet, so there is nothing to write an exposure against,
      // and the same evidence is already folded into the starting
      // figure.
      status: consumed === true ? 'consumed' : 'queued',
      consumed_at: consumed === true ? new Date().toISOString() : null,
      storage_path: path,
      mime_type: 'application/pdf',
      file_size: size,
    })
    .select('id, title')
    .single()

  if (error) {
    // The row is what makes the file findable; an orphan in the bucket
    // is worse than no upload at all.
    await db.storage.from('resources').remove([path])
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await db.from('ingestion_jobs').insert({ resource_id: data.id })
  const { error: queueError } = await db.rpc('enqueue_ingestion', { p_resource_id: data.id })

  dropCache()

  if (queueError) {
    return NextResponse.json(
      { id: data.id, title: data.title, warning: `saved but not queued: ${queueError.message}` },
      { status: 202 }
    )
  }

  return NextResponse.json({ id: data.id, title: data.title })
}
