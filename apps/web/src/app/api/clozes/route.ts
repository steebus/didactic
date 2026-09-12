import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { ownerId } from '@/lib/auth'
import { clozesIn, dueClozes, prefixFor, randomCloze } from '@/lib/clozes'
import { clozeProblem } from '@didactic/core/clozes'
import { freshMemory } from '@didactic/core/fsrs'
import { memoryColumns } from '@didactic/core/clozes'
import { revalidateTag } from 'next/cache'
import { tags } from '@didactic/core/tags'

/**
 * The garden, read and planted by hand.
 *
 * One route with a `mode`, rather than three addresses, because the
 * three questions -- what is due, what is in this lesson, give me
 * anything -- differ only in a where clause and answer the same shape.
 * A client that asks for a mode it has not heard of gets the due list,
 * which is the honest default: it is what the Tend sheet is for.
 */

function dropCache() {
  for (const tag of [tags.clozes, tags.topics]) revalidateTag(tag, 'max')
}

export async function GET(req: Request) {
  const userId = await ownerId()
  if (!userId) return NextResponse.json({ error: 'not signed in' }, { status: 401 })

  const query = new URL(req.url).searchParams
  const scope = {
    subjectId: query.get('subjectId'),
    topicId: query.get('topicId'),
    lessonId: query.get('lessonId'),
  }
  const mode = query.get('mode') ?? 'due'
  const limit = Math.min(Number(query.get('limit')) || 40, 100)

  const db = supabaseAdmin()
  try {
    if (mode === 'random') {
      const cloze = await randomCloze(db, userId, scope)
      // Not a 404: asking for a random cloze from a subject with none
      // is an ordinary answer to an ordinary question, and the sheet
      // says so in a sentence rather than in a status code.
      return NextResponse.json({ clozes: cloze ? [cloze] : [] })
    }

    if (mode === 'lesson') {
      if (!scope.lessonId) {
        return NextResponse.json({ error: 'lessonId is required' }, { status: 400 })
      }
      return NextResponse.json({ clozes: await clozesIn(db, userId, scope.lessonId) })
    }

    return NextResponse.json({ clozes: await dueClozes(db, userId, scope, limit) })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    )
  }
}

/**
 * Make one by hand.
 *
 * The same thing the agent does when a lesson is worked, with the
 * reader choosing the sentence and the words instead. It belongs to no
 * concept: naming one on their behalf would be putting a word in their
 * mouth, and the cards they make are usually the ones the agent's
 * concepts missed.
 */
export async function POST(req: Request) {
  const userId = await ownerId()
  if (!userId) return NextResponse.json({ error: 'not signed in' }, { status: 401 })

  const body = await req.json()
  const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
  const lessonId = text(body.lessonId)
  const passage = text(body.text)
  const blank = text(body.blank)

  if (!lessonId) return NextResponse.json({ error: 'lessonId is required' }, { status: 400 })

  const problem = clozeProblem(passage, blank, body.blankStart)
  if (problem) return NextResponse.json({ error: problem }, { status: 400 })

  const db = supabaseAdmin()
  const { data: lesson } = await db
    .from('lessons')
    .select('id, body, curricula (topic_id)')
    .eq('id', lessonId)
    .single()
  if (!lesson) return NextResponse.json({ error: 'That lesson is not there.' }, { status: 404 })

  const curriculum = lesson.curricula as { topic_id: string } | { topic_id: string }[] | null
  const topicId = Array.isArray(curriculum) ? curriculum[0]?.topic_id : curriculum?.topic_id

  // The offsets are recomputed here rather than taken from the client.
  // A selection reports an offset into the rendered prose, which is not
  // an offset into the passage that was stored beside it.
  const start =
    typeof body.blankStart === 'number' &&
    passage.slice(body.blankStart, body.blankStart + blank.length) === blank
      ? body.blankStart
      : passage.indexOf(blank)

  const { data: written, error } = await db
    .from('clozes')
    .insert({
      user_id: userId,
      concept_id: null,
      lesson_id: lessonId,
      topic_id: topicId ?? null,
      text: passage,
      // Taken from the body where there is one, rather than from the
      // client: the client's idea of what came before the passage is
      // the rendered prose, and the prefix has to match what the
      // painter will search.
      prefix: prefixFor((lesson.body as string | null) ?? '', passage) ?? (text(body.prefix) || null),
      blank,
      blank_start: start,
      blank_end: start + blank.length,
      hint: text(body.hint) || null,
      created_by: 'user',
      ...memoryColumns(freshMemory()),
    })
    .select('*, concept:cloze_concepts (id, name, gist), lesson:lessons (id, title), topic:topics (id, title)')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  dropCache()
  return NextResponse.json({ cloze: written })
}
