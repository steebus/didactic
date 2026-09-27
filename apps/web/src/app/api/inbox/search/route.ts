import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { ownerId } from '@/lib/auth'
import { searchShelf } from '@/lib/shelfSearch'

/**
 * Where a search is found in the shelf's text and in what the reader
 * wrote in it (058). Answers `{ hits }`, every match ranked; the inbox
 * keeps the most telling one per resource (`core/shelf.bestHits`).
 */
export async function GET(req: Request) {
  const userId = await ownerId()
  if (!userId) return NextResponse.json({ error: 'not signed in' }, { status: 401 })

  const q = (new URL(req.url).searchParams.get('q') ?? '').slice(0, 200)
  try {
    return NextResponse.json({ hits: await searchShelf(supabaseAdmin(), userId, q) })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    )
  }
}
