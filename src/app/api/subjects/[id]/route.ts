import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { ownerId } from '@/lib/auth'

/**
 * Removing a bed.
 *
 * A subject owns nothing outright: its topics belong to every subject
 * they sit under, and the exposure log behind their figures is
 * append-only. So this takes the bed away and leaves the planting --
 * a topic filed only here becomes loose stock rather than being
 * deleted, and everything read against it still counts.
 *
 * The sowing record goes with the subject, because it is an account of
 * this bed being laid out and means nothing without it.
 */
export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await ownerId()
  if (!userId) return NextResponse.json({ error: 'not signed in' }, { status: 401 })

  const { id } = await params
  const db = supabaseAdmin()

  const { data: subject } = await db.from('subjects')
    .select('id, title, user_id').eq('id', id).single()
  if (!subject) return NextResponse.json({ error: 'not found' }, { status: 404 })
  if (subject.user_id !== userId) {
    return NextResponse.json({ error: 'not yours' }, { status: 403 })
  }

  // What the bed held, and what will be left holding nothing.
  const { data: filed } = await db.from('topic_subjects')
    .select('topic_id').eq('subject_id', id)
  const topicIds = (filed ?? []).map(t => t.topic_id)

  const { data: elsewhere } = topicIds.length
    ? await db.from('topic_subjects').select('topic_id').in('topic_id', topicIds).neq('subject_id', id)
    : { data: [] }
  const alsoFiled = new Set((elsewhere ?? []).map(t => t.topic_id))
  const loosened = topicIds.filter(t => !alsoFiled.has(t))

  const { error } = await db.from('subjects').delete().eq('id', id).eq('user_id', userId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    ok: true,
    title: subject.title,
    topicsLoosened: loosened.length,
    topicsKeptElsewhere: topicIds.length - loosened.length,
  })
}
