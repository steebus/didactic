import { NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import { supabaseAdmin } from '@/lib/supabase'
import { ownerId } from '@/lib/auth'
import { speechChunks, spokenMinutes } from '@didactic/core/speech'

/**
 * A lesson, out loud.
 *
 * This route queues and reports. It never synthesises anything: the
 * model runs on a machine of the reader's own that has no inbound
 * route, so it cannot be called -- it polls `lesson_audio`, takes what
 * is queued, and pushes the files back. POST puts a row there; GET says
 * how far it has got and hands back the pieces that exist so far.
 *
 * That indirection is what makes this work the same from a laptop on
 * localhost and from the deployed web: neither of them talks to the
 * machine, and the machine talks only to Supabase.
 *
 * Both are ordinary fast reads -- no model call happens here -- so
 * there is no `maxDuration` on this file.
 */

/**
 * Which recording is the current one.
 *
 * A lesson can be written again, and audio made from prose that has
 * since been replaced is a recording of a lesson nobody can read any
 * more. The hash is stored on the voicing and compared on every read,
 * so stale audio is re-voiced rather than played. Content, not a
 * timestamp: rewriting a lesson to the same words is the same lesson,
 * and should not throw away eight minutes of work.
 */
function bodyHash(body: string): string {
  return createHash('sha256').update(body).digest('hex').slice(0, 32)
}

/** The voice, until there is a reason for there to be a choice. */
const VOICE = 'alba'

/** How long a signed URL for a chunk is good for.
 *
 *  An hour, which is longer than any lesson and long enough that a
 *  player left paused on a locked phone is still able to carry on when
 *  it is picked back up. The player asks again when they expire. */
const SIGNED_FOR = 3600

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = supabaseAdmin()
  const userId = await ownerId()

  const { data: lesson } = await db
    .from('lessons')
    .select('id, title, body, body_finished')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle()

  if (!lesson) return NextResponse.json({ error: 'not found' }, { status: 404 })

  // Half a lesson read aloud stops mid-sentence and sounds like a
  // failure. The body is written in rounds and `body_finished` is the
  // only honest answer to "is there a whole lesson here".
  if (!lesson.body || !lesson.body_finished) {
    return NextResponse.json({ error: 'This lesson has not been written yet.' }, { status: 409 })
  }

  // What there is to say, decided here rather than on the worker, so
  // that the reader can be told there is nothing to hear before
  // anything is queued. A lesson that is all blocks is a real case.
  const chunks = speechChunks(lesson.body)
  if (!chunks.length) {
    return NextResponse.json(
      { error: 'There is nothing in this lesson to read aloud.' },
      { status: 409 }
    )
  }

  const hash = bodyHash(lesson.body)

  // Pressing Listen twice must not queue the same eight minutes twice.
  // The unique index on (lesson, voice, body_hash) is what makes this
  // safe against two presses that race; `ignoreDuplicates` turns the
  // loser into a read instead of an error.
  const { error } = await db
    .from('lesson_audio')
    .upsert(
      {
        user_id: userId,
        lesson_id: id,
        voice: VOICE,
        body_hash: hash,
        chunks: chunks.length,
        // What to say, decided here and carried on the row.
        //
        // The worker could split the body itself, but then the rule for
        // what is speakable would be written twice -- once in
        // TypeScript and once in Python -- and the two would drift the
        // first time a block was added. Here it is settled once, by the
        // code that has the tests, and the worker only reads.
        script: chunks,
      },
      { onConflict: 'lesson_id,voice,body_hash', ignoreDuplicates: true }
    )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // A voicing that failed part way is put back in the queue rather than
  // started again. The chunks it finished are already in the bucket and
  // the worker skips what it finds, so pressing Listen after a dropped
  // connection costs the pieces that are missing and not the lesson.
  // Scoped to this body's hash, so it can never revive a recording of
  // prose that has since been rewritten.
  await db
    .from('lesson_audio')
    .update({ state: 'queued', reason: null, claimed_at: null, heartbeat_at: null })
    .eq('lesson_id', id)
    .eq('voice', VOICE)
    .eq('body_hash', hash)
    .eq('state', 'failed')

  return NextResponse.json({
    ok: true,
    chunks: chunks.length,
    minutes: spokenMinutes(chunks),
    title: lesson.title,
  })
}

/**
 * How far the voicing has got, and what can be played now.
 *
 * Polled by the player while the lesson is being made, which is why it
 * returns the chunks that exist rather than waiting for all of them:
 * playback starts on the first and the rest arrive behind it.
 */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = supabaseAdmin()
  const userId = await ownerId()

  const { data: lesson } = await db
    .from('lessons')
    .select('id, title, body')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle()

  if (!lesson) return NextResponse.json({ error: 'not found' }, { status: 404 })

  // Nothing to compare against, so nothing can be current.
  if (!lesson.body) return NextResponse.json({ state: 'none', chunks: [] })

  const hash = bodyHash(lesson.body)

  // Only audio of the lesson as it stands now. A recording of prose
  // that has been rewritten since is not offered -- the reader would be
  // listening to one lesson and looking at another.
  const { data: audio } = await db
    .from('lesson_audio')
    .select('id, state, chunks, reason')
    .eq('lesson_id', id)
    .eq('voice', VOICE)
    .eq('body_hash', hash)
    .maybeSingle()

  if (!audio) return NextResponse.json({ state: 'none', chunks: [] })

  const { data: rows } = await db
    .from('lesson_audio_chunks')
    .select('idx, path, seconds, text')
    .eq('audio_id', audio.id)
    .order('idx')

  const made = rows ?? []

  // Signed in one call rather than one per chunk: a lesson is twelve
  // pieces and this route is polled while it plays.
  const signed = made.length
    ? await db.storage
        .from('lesson-audio')
        .createSignedUrls(
          made.map(c => c.path),
          SIGNED_FOR
        )
    : { data: [] }

  const urls = signed.data ?? []

  return NextResponse.json({
    state: audio.state,
    reason: audio.reason,
    title: lesson.title,
    /** How many there will be. Null until the worker has decided. */
    total: audio.chunks,
    chunks: made.map((c, i) => ({
      idx: c.idx,
      seconds: c.seconds,
      text: c.text,
      url: urls[i]?.signedUrl ?? null,
    })),
  })
}
