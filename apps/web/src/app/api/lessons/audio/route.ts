import { NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import { supabaseAdmin } from '@/lib/supabase'
import { ownerId } from '@/lib/auth'

/**
 * Where several lessons stand, as recordings.
 *
 * The topic sheet prints a route of up to sixteen lessons and wants a
 * play control against each, filling as its audio is made. Asking
 * `/api/lessons/[id]/audio` once per row would be sixteen requests on
 * every poll, fifteen of which say "nothing here" -- so this answers
 * for a list.
 *
 * It deliberately does not sign anything. This is the sheet asking
 * *whether* a lesson can be heard and how far along it is, not asking
 * to play it; signing sixteen lessons' worth of chunk URLs to draw
 * sixteen circles would be most of the work for none of the benefit.
 * Pressing play goes through the single-lesson route, which signs.
 */

const VOICE = 'alba'

/** Which recording is the current one. The same rule the single-lesson
 *  route uses: content, so rewriting a lesson to the same words is the
 *  same lesson. */
function bodyHash(body: string): string {
  return createHash('sha256').update(body).digest('hex').slice(0, 32)
}

export async function GET(req: Request) {
  const ids = (new URL(req.url).searchParams.get('ids') ?? '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)

  if (!ids.length) return NextResponse.json({ lessons: {} })

  const db = supabaseAdmin()
  const userId = await ownerId()

  // The bodies, only to hash them: what is being asked is whether the
  // audio that exists is audio of the lesson as it stands.
  const { data: lessons } = await db
    .from('lessons')
    .select('id, body, body_finished')
    .eq('user_id', userId)
    .in('id', ids)

  if (!lessons?.length) return NextResponse.json({ lessons: {} })

  const hashes = new Map<string, string>()
  for (const l of lessons) {
    if (l.body && l.body_finished) hashes.set(l.id, bodyHash(l.body))
  }

  const { data: audio } = await db
    .from('lesson_audio')
    .select('id, lesson_id, state, chunks, body_hash')
    .eq('user_id', userId)
    .eq('voice', VOICE)
    .in('lesson_id', [...hashes.keys()])

  const current = (audio ?? []).filter(a => hashes.get(a.lesson_id) === a.body_hash)

  // How many pieces of each are made, counted in one go rather than a
  // query per lesson.
  const made = new Map<string, number>()
  if (current.length) {
    const { data: rows } = await db
      .from('lesson_audio_chunks')
      .select('audio_id')
      .in(
        'audio_id',
        current.map(a => a.id)
      )
    for (const row of rows ?? []) {
      made.set(row.audio_id, (made.get(row.audio_id) ?? 0) + 1)
    }
  }

  const out: Record<string, { state: string; done: number; total: number | null }> = {}

  // Every lesson that could be voiced, including the ones nobody has
  // asked for: the sheet needs to tell "no recording" from "not a
  // lesson you can record", and only the first gets a play control.
  for (const id of hashes.keys()) out[id] = { state: 'none', done: 0, total: null }

  for (const a of current) {
    out[a.lesson_id] = {
      state: a.state,
      done: made.get(a.id) ?? 0,
      total: a.chunks,
    }
  }

  return NextResponse.json({ lessons: out })
}
