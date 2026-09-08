import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { ownerId } from '@/lib/auth'

/** Big enough for a scanned certificate or a course handbook, small
 *  enough that a mis-picked file fails fast rather than uploading. */
const MAX_BYTES = 15 * 1024 * 1024

/**
 * A file handed over as evidence: a course handbook, a paper, a
 * certificate. Only PDFs are taken, because a PDF is the only file the
 * ingestion pipeline can actually read — an image would be filed as
 * proof the app could never open.
 */
export async function POST(req: Request) {
  const userId = await ownerId()
  if (!userId) return NextResponse.json({ error: 'not signed in' }, { status: 401 })

  const form = await req.formData()
  const file = form.get('file')
  const consumed = form.get('consumed') === 'true'

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file is required' }, { status: 400 })
  }
  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    return NextResponse.json(
      { error: 'PDFs only — anything else cannot be read. Name it as a qualification instead.' },
      { status: 415 }
    )
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'That file is over 15 MB.' }, { status: 413 })
  }

  const db = supabaseAdmin()
  const path = `evidence/${crypto.randomUUID()}.pdf`

  const { error: uploadError } = await db.storage
    .from('resources')
    .upload(path, file, { contentType: 'application/pdf', upsert: false })
  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 })
  }

  const title = file.name.replace(/\.pdf$/i, '').trim() || 'Uploaded document'

  const { data, error } = await db.from('resources').insert({
    user_id: userId,
    title,
    kind: 'pdf',
    // Evidence of what you have already done is read material, not a
    // reading list. Nothing is scored from it here: no topics are linked
    // yet, so there is nothing to write an exposure against, and the
    // same evidence is already folded into the starting figure.
    status: consumed ? 'consumed' : 'queued',
    consumed_at: consumed ? new Date().toISOString() : null,
    storage_path: path,
    mime_type: 'application/pdf',
    file_size: file.size,
  }).select('id, title').single()

  if (error) {
    // The row is what makes the file findable; an orphan in the bucket
    // is worse than no upload at all.
    await db.storage.from('resources').remove([path])
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  await db.from('ingestion_jobs').insert({ resource_id: data.id })
  const { error: queueError } = await db.rpc('enqueue_ingestion', { p_resource_id: data.id })
  if (queueError) {
    return NextResponse.json(
      { id: data.id, title: data.title, warning: `saved but not queued: ${queueError.message}` },
      { status: 202 }
    )
  }

  return NextResponse.json({ id: data.id, title: data.title })
}
