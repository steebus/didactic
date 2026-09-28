import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { ownerId } from '@/lib/auth'
import { readChat } from '@/lib/chats'

/**
 * One conversation, read back so it can be carried on.
 *
 * The panel's drawer lists a page's conversations; pressing one asks
 * here for what was said, and the next question goes on as a turn of
 * that conversation rather than the start of a new one. Scoped by owner
 * in `readChat`, since the id arrives from a browser.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await ownerId()
  if (!userId) return NextResponse.json({ error: 'not signed in' }, { status: 401 })

  const { id } = await params
  const chat = await readChat(supabaseAdmin(), userId, id)
  if (!chat) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json(chat)
}
