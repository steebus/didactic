import { NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { tags } from '@didactic/core/tags'
import { ownerId } from '@/lib/auth'
import { supabaseAdmin } from '@/lib/supabase'
import { dismissTheSprout } from '@/lib/sprouting'

/** Only the decision moves; the map is as it was. */
function dropCache() {
  revalidateTag(tags.sprouts, { expire: 0 })
}

/** Not this one. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await ownerId()
  if (!userId) return NextResponse.json({ error: 'not signed in' }, { status: 401 })

  const { id } = await params
  const { status, body } = await dismissTheSprout(supabaseAdmin(), id)
  if (status === 200) dropCache()
  return NextResponse.json(body, { status })
}
