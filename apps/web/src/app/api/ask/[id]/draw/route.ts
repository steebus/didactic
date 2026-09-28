import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { ownerId } from '@/lib/auth'
import { drawPending } from '@/lib/drawings'
import { drawingOn } from '@/lib/features'
import { isCommission, pendingDrawings, rewritePictures } from '@didactic/core/pictures'

/**
 * Draw the picture the agent asked for in its last answer.
 *
 * The turn itself cannot: it has one minute for the model, the tools and
 * the answer, and a drawing takes most of half of that. So the answer is
 * kept with the picture as a commission -- which prints nothing -- and
 * the panel comes here straight after, for a minute of its own. The
 * stored answer is rewritten with the drawing in it, so a conversation
 * read back later, or folded into the lesson, has the picture.
 *
 * A drawing that does not come back is taken out, and the reason is
 * written under the answer by this route rather than left to the model
 * to paraphrase: "the drawing tool is down" is not something anyone can
 * fix.
 *
 * Nothing cached is read from a conversation's messages, so there is no
 * tag to drop; it is listed with the other routes that have none.
 */
export const maxDuration = 60

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await ownerId()
  if (!userId) return NextResponse.json({ error: 'not signed in' }, { status: 401 })

  const { id } = await params
  const db = supabaseAdmin()

  const { data: conversation } = await db
    .from('conversations')
    .select('id')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle()
  if (!conversation) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const { data: message } = await db
    .from('messages')
    .select('id, content')
    .eq('conversation_id', id)
    .eq('role', 'assistant')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!message) return NextResponse.json({ error: 'nothing to draw' }, { status: 404 })

  const content: string = message.content
  if (pendingDrawings(content).length === 0) return NextResponse.json({ text: content })

  let text: string
  let note: string | null = null
  if (drawingOn()) {
    const drawn = await drawPending(db, `ask/${id}`, content, DRAWN_CREDIT)
    text = drawn.text
    if (drawn.dropped) note = `The drawing could not be made: ${drawn.reasons.join('; ') || 'no reason was given'}.`
  } else {
    // Switched off between the answer and this call.
    text = rewritePictures(content, b => (isCommission(b) ? null : undefined)).text
    note = 'The drawing could not be made: drawing is switched off.'
  }

  const stored = note ? `${text.trimEnd()}\n\n*${note}*` : text
  const { error } = await db.from('messages').update({ content: stored }).eq('id', message.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ text: stored, ...(note ? { warning: note } : {}) })
}

/** Said under a picture drawn in a conversation. */
const DRAWN_CREDIT = 'Drawn for this answer'
