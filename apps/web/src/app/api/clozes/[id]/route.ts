import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { ownerId } from '@/lib/auth'
import { prefixFor } from '@/lib/clozes'
import { clozeProblem } from '@didactic/core/clozes'
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
 * Rewrite a cloze, or move its blank.
 *
 * A card the reader can see is wrong is a card they stop answering
 * honestly, so editing has to be possible from the sheet where they
 * meet it. What editing does **not** do is reset the schedule: the
 * reader is correcting a card, not declaring they have forgotten it,
 * and throwing away its history would be throwing away the only
 * evidence of what they hold.
 *
 * The blank is validated against the passage as it will be stored,
 * whichever of the two the reader changed.
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

  const text = typeof body.text === 'string' ? body.text.trim() : (standing.text as string)
  const blank = typeof body.blank === 'string' ? body.blank.trim() : (standing.blank as string)

  const problem = clozeProblem(text, blank, body.blankStart)
  if (problem) return NextResponse.json({ error: problem }, { status: 400 })

  const start =
    typeof body.blankStart === 'number' &&
    text.slice(body.blankStart, body.blankStart + blank.length) === blank
      ? body.blankStart
      : text.indexOf(blank)

  const lessonBody = ((standing.lessons as { body: string | null } | null)?.body ?? '') as string

  const { data: written, error } = await db
    .from('clozes')
    .update({
      text,
      blank,
      blank_start: start,
      blank_end: start + blank.length,
      hint: typeof body.hint === 'string' ? body.hint.trim() || null : standing.hint,
      // Re-found against the lesson, because a rewritten passage sits
      // somewhere else in it -- or nowhere, in which case the card is
      // still perfectly answerable and simply is not drawn on the
      // prose any more.
      prefix: prefixFor(lessonBody, text),
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
