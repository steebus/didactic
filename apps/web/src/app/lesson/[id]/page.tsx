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

  const [owner, data] = await Promise.all([requireOwner(), readLesson(db, id, null)])
  if (!data) notFound()

  // The answers are the one part that needed to know the account, and
  // the account is only known once the gate above has answered. Its
  // own read rather than a second pass over the lesson.
  const answered = await answeredIn(db, owner.id, id)

  return <LessonSheet id={id} initial={{ ...data, answered }} />
}
