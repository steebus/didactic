import { NextResponse } from 'next/server'
import { getHomeData } from '@/lib/home'
import { ownerId } from '@/lib/auth'

/**
 * The stock list, for a client that renders it itself.
 *
 * The web's page calls `getHomeData` directly; this calls the same
 * function, so the read is cached under the same tags and a write that
 * drops them drops this too. A second query here would be a second
 * thing to keep in step.
 */
export async function GET() {
  const userId = await ownerId()
  if (!userId) return NextResponse.json({ error: 'not signed in' }, { status: 401 })

  return NextResponse.json(await getHomeData())
}
