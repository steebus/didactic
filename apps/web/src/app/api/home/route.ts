import { NextResponse } from 'next/server'
import { getHomeData } from '@/lib/home'
import { getActivity } from '@/lib/activity'
import { ownerId } from '@/lib/auth'

/**
 * The stock list, for a client that renders it itself.
 *
 * The web's page calls `getHomeData` directly; this calls the same
 * function, so the read is cached under the same tags and a write that
 * drops them drops this too. A second query here would be a second
 * thing to keep in step.
 *
 * `activity` is additive, and read beside the home data rather than in
 * it: the home read is cached on the map's tags and the reader's year
 * moves on writes that drop none of them (see `lib/activity`).
 */
export async function GET() {
  const userId = await ownerId()
  if (!userId) return NextResponse.json({ error: 'not signed in' }, { status: 401 })

  const [home, activity] = await Promise.all([getHomeData(), getActivity()])
  return NextResponse.json({ ...home, activity })
}
