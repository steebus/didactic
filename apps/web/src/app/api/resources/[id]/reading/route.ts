import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { ownerId } from '@/lib/auth'
import { readResource } from '@/lib/resourceReading'

/**
 * A resource opened to be read in the app (053).
 *
 * Makes the readable body on the first ask and keeps it, so this can be
 * slow once -- it may fetch the article's page -- and is a row read ever
 * after. Nothing it keeps is anything a sheet is cached on: the body is
 * read only here, so there is no tag to drop.
 */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await ownerId()
  if (!userId) return NextResponse.json({ error: 'not signed in' }, { status: 401 })

  const { id } = await params
  try {
    const reading = await readResource(supabaseAdmin(), userId, id)
    if (!reading) return NextResponse.json({ error: 'not found' }, { status: 404 })
    return NextResponse.json(reading)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    )
  }
}
