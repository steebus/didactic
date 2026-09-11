import { NextResponse } from 'next/server'
import { getSubjectArea } from '@/lib/subject'
import { ownerId } from '@/lib/auth'

/** A subject's bed: its outline, its figures and what it stands on. */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await ownerId()
  if (!userId) return NextResponse.json({ error: 'not signed in' }, { status: 401 })

  const { id } = await params
  const area = await getSubjectArea(id)
  if (!area) return NextResponse.json({ error: 'not found' }, { status: 404 })

  return NextResponse.json(area)
}
