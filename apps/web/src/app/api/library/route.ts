import { NextResponse } from 'next/server'
import { getLibrary } from '@/lib/library'
import { ownerId } from '@/lib/auth'

/** Everything filed, as the library sheet reads it. */
export async function GET() {
  const userId = await ownerId()
  if (!userId) return NextResponse.json({ error: 'not signed in' }, { status: 401 })

  return NextResponse.json(await getLibrary())
}
