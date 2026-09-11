import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getPlanting } from '@/lib/planting'
import { ownerId } from '@/lib/auth'

/**
 * The bed, in one call, and what both front ends read.
 *
 * The web's canvas asked `/api/topics` and `/api/subjects` separately
 * and merged them itself, which is two round trips before anything can
 * be drawn; it reads this instead as of 2.7, and the phone — on a worse
 * connection than a laptop — will do the same. Both this and
 * `/api/topics` read `getPlanting`, so neither can drift from the other.
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
