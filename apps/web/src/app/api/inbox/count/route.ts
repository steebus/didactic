import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { ownerId } from '@/lib/auth'

/**
 * How much is waiting in the inbox, for the figure printed beside its
 * name in the running head.
 *
 * Two counts rather than the inbox's own queries: the sheet reads
 * every pending topic and runs a similarity search per one of them to
 * work out what each is close to, which is the right amount of work
 * for a sheet you are looking at and far too much for a number in a
 * nav that every page asks for. These are counts on an index, and
 * nothing is read back.
 */
export async function GET() {
  const userId = await ownerId()
  if (!userId) return NextResponse.json({ error: 'not signed in' }, { status: 401 })

  const db = supabaseAdmin()
  const [{ count: decisions }, { count: waiting }] = await Promise.all([
    db.from('topics').select('id', { count: 'exact', head: true }).eq('state', 'pending'),
    db
      .from('resources')
      .select('id', { count: 'exact', head: true })
      .in('status', ['queued', 'reading']),
  ])

  return NextResponse.json({
    decisions: decisions ?? 0,
    waiting: waiting ?? 0,
    total: (decisions ?? 0) + (waiting ?? 0),
  })
}
