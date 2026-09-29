import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { tendRound } from '@/lib/push'

/**
 * The reminder round, run every quarter hour and called by `run_tend_push()` from pg_cron
 * (069). Not part of the public surface, and behind no session: the key
 * it carries is made in the database and compared with the one there,
 * so it is never in an environment variable or in this repository.
 *
 * Writes `push_subscriptions.last_sent_at` and nothing a sheet is
 * cached on.
 */
export async function POST(req: Request) {
  const key = req.headers.get('x-internal-key')
  if (!key) return NextResponse.json({ error: 'unauthorised' }, { status: 401 })

  const db = supabaseAdmin()
  const { data: round } = await db.from('push_rounds').select('key').eq('id', true).maybeSingle()
  if (!round?.key || round.key !== key) {
    return NextResponse.json({ error: 'unauthorised' }, { status: 401 })
  }

  try {
    return NextResponse.json(await tendRound(db))
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
