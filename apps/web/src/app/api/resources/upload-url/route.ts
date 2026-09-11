import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { ownerId } from '@/lib/auth'
import {
  MAX_DOCUMENT_BYTES,
  documentPath,
  isPdf,
  tooLarge,
  NOT_A_PDF,
} from '@didactic/core/documents'

/**
 * Permission to put a document straight into the bucket.
 *
 * The bytes used to come through `/api/resources/upload` as multipart
 * form data, and for a certificate that was fine. It was never fine for
 * a book: the platform refuses a request body over four and a half
 * megabytes before the handler runs, so the fifteen-megabyte ceiling
 * that route advertised was a ceiling it could not honour — anything
 * genuinely large failed with a platform error rather than ours, and
 * nothing in the app could say why.
 *
 * So the function stops carrying the file. It signs a URL, the browser
 * PUTs to storage itself, and the function hears about it afterwards
 * (`/api/resources/uploaded`). Nothing large passes through a function
 * in either direction, which is the only arrangement that works.
 *
 * Nothing is written to the database here. A signed URL that is never
 * used leaves an unreferenced object in the bucket, which is a cleanup
 * job; a resource row whose file never arrived is a broken item on the
 * shelf, which is a bug somebody has to look at. The second is worse,
 * so the row waits until the bytes have landed.
 */
export async function POST(req: Request) {
  const userId = await ownerId()
  if (!userId) return NextResponse.json({ error: 'not signed in' }, { status: 401 })

  const { filename, size, contentType } = await req.json().catch(() => ({}))

  if (typeof filename !== 'string' || !filename.trim()) {
    return NextResponse.json({ error: 'filename is required' }, { status: 400 })
  }
  if (!isPdf(filename, typeof contentType === 'string' ? contentType : null)) {
    return NextResponse.json({ error: NOT_A_PDF }, { status: 415 })
  }
  if (typeof size === 'number' && size > MAX_DOCUMENT_BYTES) {
    return NextResponse.json({ error: tooLarge(size) }, { status: 413 })
  }

  const path = documentPath(userId, crypto.randomUUID())

  const { data, error } = await supabaseAdmin()
    .storage.from('resources')
    .createSignedUploadUrl(path)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ path, token: data.token, signedUrl: data.signedUrl })
}
