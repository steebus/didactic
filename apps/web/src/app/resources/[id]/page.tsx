import { notFound } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase'
import { requireOwner } from '@/lib/auth'
import { readResource } from '@/lib/resourceReading'
import ResourceSheet from './ResourceSheet'

/** Making an article's body can mean fetching its page, once. */
export const maxDuration = 60

/**
 * A resource, read in the app.
 *
 * Read on the server for the reason the lesson is: the prose ships in
 * the HTML rather than a round trip after it. The first open of an
 * article may fetch its page to make the body, which is a wait the
 * reader sees once; every open after reads the kept row.
 */
export default async function ResourcePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const owner = await requireOwner()

  const reading = await readResource(supabaseAdmin(), owner.id, id)
  if (!reading) notFound()

  return <ResourceSheet initial={reading} />
}
