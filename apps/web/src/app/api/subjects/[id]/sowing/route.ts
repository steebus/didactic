import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getSowing } from '@/lib/subject'
import { ownerId } from '@/lib/auth'

/**
 * What the sower said when the bed was laid out, and what the reading
 * made of it. Null for a bed that predates the sowing sheet, which the
 * reading sheet prints as "unstated" rather than as an error.
 */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await ownerId()
  if (!userId) return NextResponse.json({ error: 'not signed in' }, { status: 401 })

  const { id } = await params
  return NextResponse.json(await getSowing(supabaseAdmin(), id))
}
