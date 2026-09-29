import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { ownerId } from '@/lib/auth'
import { looseTopics } from '@/lib/removal'

/**
 * What removing a resource could take with it: the topics nothing but
 * this resource holds (`lib/removal`). Asked when the reader presses
 * Remove, so the question it turns into can name them. A read; changes
 * nothing.
 */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await ownerId()
  if (!userId) return NextResponse.json({ error: 'not signed in' }, { status: 401 })

  const { id } = await params
  const db = supabaseAdmin()
  const { data: resource } = await db
    .from('resources')
    .select('id')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle()
  if (!resource) return NextResponse.json({ error: 'not found' }, { status: 404 })

  return NextResponse.json({ topics: await looseTopics(db, userId, id) })
}
