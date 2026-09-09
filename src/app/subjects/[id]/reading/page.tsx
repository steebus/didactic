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
  await requireOwner()
  const { id } = await params
  const db = supabaseAdmin()

  const [{ data: subject }, sowing] = await Promise.all([
    db.from('subjects').select('id, title, colour').eq('id', id).single(),
    getSowing(db, id),
  ])

  if (!subject) notFound()

  return <ReadingSheet subject={subject} sowing={sowing} />
}
