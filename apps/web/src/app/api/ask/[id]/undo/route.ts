import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { ownerId } from '@/lib/auth'
import { undoWrite } from '@/lib/ask'
import { revalidateTag } from 'next/cache'
import { tags } from '@didactic/core/tags'

/**
 * Take back a mark or a card the agent kept.
 *
 * The other half of letting it write at all: a write the reader did not
 * want is one press from gone, which is what makes writing rather than
 * proposing a fair trade for these two.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await ownerId()
  if (!userId) return NextResponse.json({ error: 'not signed in' }, { status: 401 })

  await params

  const { kind, writeId } = (await req.json().catch(() => ({}))) as {
    kind?: 'mark' | 'card'
    writeId?: string
  }
  if (!writeId || (kind !== 'mark' && kind !== 'card')) {
    return NextResponse.json({ error: 'nothing to undo' }, { status: 400 })
  }

  await undoWrite(supabaseAdmin(), userId, kind, writeId)
  revalidateTag(kind === 'mark' ? tags.highlights : tags.clozes, 'max')
  return NextResponse.json({ ok: true })
}
