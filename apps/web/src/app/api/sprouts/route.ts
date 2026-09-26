import { NextResponse } from 'next/server'
import { getSprouting } from '@/lib/sprouting'
import { ownerId } from '@/lib/auth'

/**
 * Sprouting subjects: communities in the kinship no subject accounts
 * for, with what was decided about each, and the kinship lines the bed
 * pulls along. Read-only and cached; `POST /api/sprouts/name` is what
 * fills vectors and names.
 */
export async function GET() {
  const userId = await ownerId()
  if (!userId) return NextResponse.json({ error: 'not signed in' }, { status: 401 })

  try {
    return NextResponse.json(await getSprouting())
  } catch (e) {
    return NextResponse.json(
      { error: `Could not read what is sprouting: ${e instanceof Error ? e.message : String(e)}` },
      { status: 500 }
    )
  }
}
