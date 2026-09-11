import { NextResponse } from 'next/server'
import { getTopicArea } from '@/lib/topic'
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
  const area = await getTopicArea(id)
  if (!area) return NextResponse.json({ error: 'not found' }, { status: 404 })

  return NextResponse.json(area)
}
