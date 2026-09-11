import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getPendingTopics } from '@/lib/pending'
import { ownerId } from '@/lib/auth'

/**
 * The inbox sheet in one call: what is waiting to be read, and what is
 * waiting to be adjudicated.
 *
 * The sheet runs these two together already. `/api/inbox/count` stays
 * separate and stays cheap -- it is two counts on an index for a figure
 * in a nav, where this reads the rows and runs a similarity search per
 * pending topic.
 */
export async function GET() {
  const userId = await ownerId()
  if (!userId) return NextResponse.json({ error: 'not signed in' }, { status: 401 })

  const [pending, { data: resources }] = await Promise.all([
    getPendingTopics(),
    supabaseAdmin()
      .from('resources')
      .select('*')
      .in('status', ['queued', 'reading'])
      .order('created_at', { ascending: false }),
  ])

  return NextResponse.json({ pending, queued: resources ?? [] })
}
