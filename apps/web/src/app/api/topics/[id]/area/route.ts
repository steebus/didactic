import { NextResponse } from 'next/server'
import { getTopicArea } from '@/lib/topic'
import { getActivity } from '@/lib/activity'
import { ownerId } from '@/lib/auth'

/**
 * What the topic sheet prints.
 *
 * `GET /api/topics/[id]` stays as it is: it answers the graph panel's
 * own question and the two have different shapes on purpose.
 */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await ownerId()
  if (!userId) return NextResponse.json({ error: 'not signed in' }, { status: 401 })

  const { id } = await params
  // `activity` is additive, read beside the area rather than in its
  // cache, for the reason `lib/activity` gives.
  const [area, activity] = await Promise.all([getTopicArea(id), getActivity({ topic: id })])
  if (!area) return NextResponse.json({ error: 'not found' }, { status: 404 })

  return NextResponse.json({ ...area, activity })
}
