import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { ownerId } from '@/lib/auth'
import { rankMentions, MENTION_SUGGESTIONS } from '@didactic/core/mentionSearch'

/**
 * What an `@` in a note could mean.
 *
 * Read-only and asked on a keystroke, so it is kept cheap: two title
 * searches against what the owner holds, ranked in `mentionSearch`
 * rather than in the database, because the ranking is a rule about how
 * a reader types and that is a rule worth being able to test.
 *
 * An empty query is not an error. It is the moment the `@` was typed
 * and nothing after it, which is when a menu is most useful: it offers
 * what was worked on most recently.
 */
export async function GET(req: Request) {
  const userId = await ownerId()
  if (!userId) return NextResponse.json({ error: 'not signed in' }, { status: 401 })

  const query = (new URL(req.url).searchParams.get('q') ?? '').trim()
  const db = supabaseAdmin()

  // A wildcard inside what the reader typed would widen the search
  // rather than narrow it.
  const like = `%${query.replace(/[%_\\]/g, m => `\\${m}`)}%`
  // Wider than the menu, because the ranking below reorders them and
  // the best answer is not always the first the database found.
  const ceiling = MENTION_SUGGESTIONS * 4

  const topics = db.from('topics').select('id, title').eq('user_id', userId)
  const lessons = db.from('lessons').select('id, title').eq('user_id', userId)

  const [{ data: topicRows }, { data: lessonRows }] = await Promise.all([
    query
      ? topics.ilike('title', like).limit(ceiling)
      : topics.order('last_exposure_at', { ascending: false, nullsFirst: false }).limit(ceiling),
    query
      ? lessons.ilike('title', like).limit(ceiling)
      : lessons.order('created_at', { ascending: false }).limit(ceiling),
  ])

  return NextResponse.json({
    suggestions: rankMentions(
      query,
      (topicRows ?? []).map(t => ({ kind: 'topic' as const, id: t.id, title: t.title })),
      (lessonRows ?? []).map(l => ({ kind: 'lesson' as const, id: l.id, title: l.title }))
    ),
  })
}
