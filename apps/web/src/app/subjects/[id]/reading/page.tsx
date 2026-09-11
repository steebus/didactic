import { notFound } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase'
import { requireOwner } from '@/lib/auth'
import { getSowing } from '@/lib/subject'
import { ReadingSheet } from './ReadingSheet'


export default async function ReadingPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const db = supabaseAdmin()
  // The gate and the read start together rather than one after the
  // other. Neither needs the other's answer, and each is a round trip
  // to a different continent -- run in sequence they were most of the
  // wait on every navigation. An unauthenticated request still ends in
  // the redirect the gate throws; it simply does not wait to find out
  // what it would otherwise have shown, and the proxy has already
  // turned nearly all of that traffic away before it reaches here.
  const [, { data: subject }, sowing] = await Promise.all([
    requireOwner(),
    db.from('subjects').select('id, title, colour').eq('id', id).single(),
    getSowing(db, id),
  ])

  if (!subject) notFound()

  return <ReadingSheet subject={subject} sowing={sowing} />
}
