import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { ownerId } from '@/lib/auth'
import { cardColumns, type WritableCard } from '@/lib/clozes'
import { cardProblem, type CardKind } from '@didactic/core/clozes'
import { revalidateTag } from 'next/cache'
import { tags } from '@didactic/core/tags'

function dropCache() {
  for (const tag of [tags.clozes, tags.topics]) revalidateTag(tag, 'max')
}

const CARD = `
  *,
  concept:cloze_concepts (id, name, gist),
  lesson:lessons (id, title),
  topic:topics (id, title)
`

/**
 * Rewrite a card: its passage, its blank, its question or its answer.
 *
 * A card the reader can see is wrong is a card they stop answering
 * honestly, so editing has to be possible from the sheet where they
 * meet it. What editing does **not** do is reset the schedule: the
 * reader is correcting a card, not declaring they have forgotten it,
 * and throwing away its history would be throwing away the only
 * evidence of what they hold.
 *
 * Nor does it change the card's **kind**. A question is not a passage
 * with a hole in it, and turning one into the other mid-row would leave
 * columns set that the shape it became has no use for -- which is the
 * row `clozes_shape` exists to refuse (046). The kind is read off what
 * is standing and every field is judged against that, so a client that
 * sends a question for a cloze is simply a client that changed nothing.
 * Pull it up and write the other one.
 *
 * Each field falls back to what is standing, so a reader fixing only
 * the nudge sends only the nudge, and the whole card is judged as it
 * will be stored rather than as it arrived.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const userId = await ownerId()
  if (!userId) return NextResponse.json({ error: 'not signed in' }, { status: 401 })

  const body = await req.json()
  const db = supabaseAdmin()

  const { data: standing } = await db
    .from('clozes')
    .select('*, lessons (body)')
    .eq('id', id)
    .eq('user_id', userId)
    .single()
  if (!standing) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const kind = (standing.kind as CardKind | null) ?? 'cloze'

  /**
   * What a field should now be: what was sent, or what is standing.
   *
   * An explicit `null` is the one thing that is neither — it is the
   * reader clearing a nudge or a line of context, and falling back to
   * the standing value would make a cleared field impossible to clear.
   * (It was: the editor has always sent `null` for an emptied nudge,
   * and this route has always read that as *say nothing about it*.)
   */
  const said = (sent: unknown, stood: unknown) => {
    if (sent === null) return undefined
    if (typeof sent === 'string') return sent.trim() || undefined
    return ((stood as string | null) ?? '') || undefined
  }

  const card: WritableCard = {
    kind,
    text: said(body.text, standing.text),
    blank: said(body.blank, standing.blank),
    blankStart:
      typeof body.blankStart === 'number'
        ? body.blankStart
        : ((standing.blank_start as number | null) ?? undefined),
    question: said(body.question, standing.question),
    answer: said(body.answer, standing.answer),
    note: said(body.note, standing.note),
    hint: said(body.hint, standing.hint),
    anchor: said(body.anchor, standing.anchor),
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

  const lessonBody = ((standing.lessons as { body: string | null } | null)?.body ?? '') as string

  // The anchor is checked against the lesson as it stands now, and
  // dropped where it is no longer in it. A rewritten passage sits
  // somewhere else in the body -- or nowhere, in which case the card is
  // still perfectly answerable and simply is not drawn on the prose any
  // more. `cardColumns` re-finds the prefix from the same reading.
  if (card.anchor && !collapse(lessonBody).includes(collapse(card.anchor))) {
    delete card.anchor
  }

  const { data: written, error } = await db
    .from('clozes')
    .update({
      ...cardColumns(card, lessonBody),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('user_id', userId)
    .select(CARD)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  dropCache()
  return NextResponse.json({ cloze: written })
}

/** Whitespace as the prose renders it, not as the markdown stores it. */
const collapse = (s: string) => s.replace(/\s+/g, ' ').trim()

/**
 * Pull one up.
 *
 * Its review log goes with it, by cascade. That is the right reading:
 * the log exists to say how this card was answered, and a card the
 * reader has judged not worth asking has no answers worth keeping. The
 * concept it sat under stays -- its other clozes are still standing.
 */
export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const userId = await ownerId()
  if (!userId) return NextResponse.json({ error: 'not signed in' }, { status: 401 })

  const { error } = await supabaseAdmin()
    .from('clozes')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  dropCache()
  return NextResponse.json({ ok: true })
}
