import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getPlanting } from '@/lib/planting'
import { ownerId } from '@/lib/auth'

/**
 * The bed, in one call.
 *
 * The web's canvas asks `/api/topics` and `/api/subjects` separately and
 * merges them itself, which is two round trips before anything can be
 * drawn. The phone will be on a worse connection than a laptop, so it
 * asks once. Both read `getPlanting`, so neither can drift from the
 * other.
 */
export async function GET() {
  const userId = await ownerId()
  if (!userId) return NextResponse.json({ error: 'not signed in' }, { status: 401 })

  const [planting, { data: subjects }] = await Promise.all([
    getPlanting(),
    supabaseAdmin().from('subjects').select('id, title, colour').order('title'),
  ])

  return NextResponse.json({ ...planting, subjects: subjects ?? [] })
}
