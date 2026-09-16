import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { ownerId } from '@/lib/auth'
import { cardColumns, clozesIn, dueClozes, randomCloze, type WritableCard } from '@/lib/clozes'
import { cardProblem, type CardKind } from '@didactic/core/clozes'
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

/** The three shapes, as a client may name them. Anything else is a
 *  cloze, which is what every caller that omits the field is making. */
const KINDS: CardKind[] = ['cloze', 'qa', 'truefalse']

/**
 * Make one by hand.
 *
 * The same thing the agent does when a lesson is worked, with the
 * reader holding the pen: a passage they chose with words taken out of
 * it, or a question and an answer they wrote, or a statement they want
 * to be asked to judge. It belongs to no concept -- naming one on their
 * behalf would be putting a word in their mouth, and the cards they
 * make are usually the ones the agent's concepts missed.
 *
 * Everything the row is built from goes through `cardColumns`, the same
 * function the sowing uses, so a card made by hand and a card written
 * by the model are the same shape in the table. The judgement is
 * `core/clozes.cardProblem`, which both platforms share: a card the web
 * refuses cannot be the card the phone writes.
 */
export async function POST(req: Request) {
  const userId = await ownerId()
  if (!userId) return NextResponse.json({ error: 'not signed in' }, { status: 401 })

  const body = await req.json()
  const said = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
  const lessonId = said(body.lessonId)

  if (!lessonId) return NextResponse.json({ error: 'lessonId is required' }, { status: 400 })

  const kind: CardKind = KINDS.includes(body.kind) ? body.kind : 'cloze'
  const card: WritableCard = {
    kind,
    text: said(body.text) || undefined,
    blank: said(body.blank) || undefined,
    blankStart: typeof body.blankStart === 'number' ? body.blankStart : undefined,
    question: said(body.question) || undefined,
    answer: said(body.answer) || undefined,
    note: said(body.note) || undefined,
    hint: said(body.hint) || undefined,
    anchor: said(body.anchor) || undefined,
  }

  const problem = cardProblem(
    {
      kind,
      text: card.text ?? null,
      blank: card.blank ?? null,
      blank_start: null,
      blank_end: null,
      question: card.question ?? null,
      answer: card.answer ?? null,
      note: card.note ?? null,
      anchor: card.anchor ?? null,
    },
    card.blankStart
  )
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
  const lessonBody = ((lesson.body as string | null) ?? '')

  // An anchor is a promise the painter relies on, so it is checked here
  // rather than taken on trust, and dropped rather than refused: a card
  // whose sentence is not in the body is perfectly answerable and
  // simply is not drawn on the prose.
  if (card.anchor && !collapse(lessonBody).includes(collapse(card.anchor))) {
    delete card.anchor
  }

  const { data: written, error } = await db
    .from('clozes')
    .insert({
      user_id: userId,
      concept_id: null,
      lesson_id: lessonId,
      topic_id: topicId ?? null,
      created_by: 'user',
      // The prefix is taken from the body inside here rather than from
      // the client: the client's idea of what came before the passage
      // is the rendered prose, and the prefix has to match what the
      // painter will search.
      ...cardColumns(card, lessonBody),
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

/** Whitespace as the prose renders it, not as the markdown stores it. */
const collapse = (s: string) => s.replace(/\s+/g, ' ').trim()
