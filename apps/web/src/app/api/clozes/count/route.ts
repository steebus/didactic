import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { ownerId } from '@/lib/auth'
import { countClozes } from '@/lib/clozes'

/**
 * How much is due, for the figure beside Tend in the running head and
 * for the notice that offers to tend every four hours.
 *
 * Counts on `clozes_due_idx` and nothing read back, for the same reason
 * the inbox tally is its own route: this is asked for on every
 * navigation in the catalogue, so it has to cost an index scan rather
 * than a page of rows.
 */
export async function GET() {
  const userId = await ownerId()
  if (!userId) return NextResponse.json({ error: 'not signed in' }, { status: 401 })

  try {
    return NextResponse.json(await countClozes(supabaseAdmin(), userId))
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    )
  }
}
