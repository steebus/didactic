import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { ownerId } from '@/lib/auth'
import { getLooseStock } from '@/lib/loose'
import { revalidateTag } from 'next/cache'
import { tags } from '@didactic/core/tags'

function dropCache() {
  for (const tag of [tags.subjects, tags.topics, tags.pending]) revalidateTag(tag, 'max')
}

export async function GET() {
  try {
    return NextResponse.json({ loose: await getLooseStock() })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    )
  }
}

/**
 * Throw away loose topics, several at a time.
 *
 * Scoped to topics that are filed under no subject, and that is a safety
 * property rather than an implementation detail: the ids come from a
 * sheet of checkboxes, and a stale one — a topic filed somewhere in
 * another tab since the sheet was drawn — must not be deletable by a
 * press meant for loose stock. Anything that has since been filed is
 * skipped and counted back, so the sheet can say what it did not do.
 *
 * Everything filed against a topic goes with it. The exposure log is
 * append-only and keeps its own account of what was read.
 */
export async function DELETE(req: Request) {
  const userId = await ownerId()
  if (!userId) return NextResponse.json({ error: 'not signed in' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const ids: string[] = Array.isArray(body.ids) ? body.ids.filter((i: unknown) => typeof i === 'string') : []

  if (ids.length === 0) {
    return NextResponse.json({ error: 'ids is required' }, { status: 400 })
  }

  const db = supabaseAdmin()

  // Which of them are still loose, asked now rather than trusted from
  // the sheet.
  const { data: filed } = await db
    .from('topic_subjects').select('topic_id').in('topic_id', ids)
  const stillFiled = new Set((filed ?? []).map(r => r.topic_id as string))
  const removable = ids.filter(id => !stillFiled.has(id))

  if (removable.length === 0) {
    return NextResponse.json({ removed: 0, skipped: ids.length })
  }

  const { error } = await db
    .from('topics').delete().in('id', removable).eq('user_id', userId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  dropCache()
  return NextResponse.json({
    removed: removable.length,
    skipped: ids.length - removable.length,
  })
}
