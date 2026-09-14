import { notFound } from 'next/navigation'
import { supabaseAdmin } from '@/lib/supabase'
import { requireOwner } from '@/lib/auth'
import { readLesson } from '@/lib/lesson'
import { answeredIn } from '@/lib/answers'
import LessonSheet from './LessonSheet'

/**
 * A lesson, read on the server.
 *
 * The sheet was a client component that fetched everything on mount,
 * so the document arrived empty and the reading began a round trip
 * later -- the whole of the wait was a request the server could have
 * made while it was rendering. Read here, the prose ships inside the
 * HTML and the sheet below starts with it in hand.
 *
 * The gate and the read run together rather than one after the other,
 * for the reason `app/page.tsx` gives: neither needs the other's
 * answer, and each is a round trip to a different continent.
 *
 * Everything that made this a client component is still one -- marks,
 * the bench, the garden, writing on first open. It is handed its
 * first read instead of fetching it.
 */
export default async function LessonPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const db = supabaseAdmin()

  // The answers need the account, so they are chained onto the gate
  // rather than onto the lesson -- that keeps them beside the lesson
  // read instead of behind it. Awaiting the gate first and then asking
  // for them put a whole round trip in front of the prose, which is
  // the thing this page exists to stop doing.
  const answers = requireOwner().then(owner => answeredIn(db, owner.id, id))

  const [data, answered] = await Promise.all([readLesson(db, id, null), answers])
  if (!data) notFound()

  return <LessonSheet id={id} initial={{ ...data, answered }} />
}
