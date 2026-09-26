import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { ownerId } from '@/lib/auth'
import { removeSummary, summariesFor, writeSummary, type ReadingRef } from '@/lib/summaries'
import { summaryProblem } from '@didactic/core/summaries'
import { revalidateTag } from 'next/cache'
import { tags } from '@didactic/core/tags'

/**
 * Drop what this route just changed.
 *
 * The same three a mark drops: a summary is a mark, it is listed on the
 * Marked sheet and the topic sheet, and the first one of a section
 * writes an exposure that moves the topic's figure.
 */
function dropCache() {
  for (const tag of [tags.highlights, tags.topics, tags.subjects]) revalidateTag(tag, 'max')
}

const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

/** The reading a request names: a lesson or a resource, never both. */
function readingIn(source: { lessonId?: unknown; resourceId?: unknown }): ReadingRef | null {
  const lessonId = text(source.lessonId)
  const resourceId = text(source.resourceId)
  if (lessonId && !resourceId) return { lessonId }
  if (resourceId && !lessonId) return { resourceId }
  return null
}

/** Every summary written against one lesson or resource. */
export async function GET(req: Request) {
  const userId = await ownerId()
  if (!userId) return NextResponse.json({ error: 'not signed in' }, { status: 401 })

  const query = new URL(req.url).searchParams
  const where = readingIn({
    lessonId: query.get('lessonId') ?? undefined,
    resourceId: query.get('resourceId') ?? undefined,
  })
  if (!where) {
    return NextResponse.json({ error: 'lessonId or resourceId is required' }, { status: 400 })
  }

  try {
    return NextResponse.json({ summaries: await summariesFor(supabaseAdmin(), userId, where) })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    )
  }
}

/**
 * Keep a summary of a section, or of the whole reading when `section`
 * is null -- replacing whatever was said about it before.
 */
export async function POST(req: Request) {
  const userId = await ownerId()
  if (!userId) return NextResponse.json({ error: 'not signed in' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const where = readingIn(body)
  if (!where) {
    return NextResponse.json({ error: 'lessonId or resourceId is required' }, { status: 400 })
  }

  const note = text(body.note)
  const problem = summaryProblem(note)
  if (problem) return NextResponse.json({ error: problem }, { status: 400 })

  const section = text(body.section) || null
  if (section && section.length > 500) {
    return NextResponse.json({ error: 'that heading is too long to be one' }, { status: 400 })
  }
  const sectionAt =
    typeof body.sectionAt === 'number' && Number.isInteger(body.sectionAt) && body.sectionAt >= 0
      ? body.sectionAt
      : null

  try {
    const result = await writeSummary(supabaseAdmin(), {
      userId,
      where,
      section,
      sectionAt,
      note,
    })
    dropCache()
    return NextResponse.json(result)
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    return NextResponse.json(
      { error: message },
      { status: message.startsWith('That is not there') ? 404 : 500 }
    )
  }
}

export async function DELETE(req: Request) {
  const userId = await ownerId()
  if (!userId) return NextResponse.json({ error: 'not signed in' }, { status: 401 })

  const { id } = await req.json().catch(() => ({}))
  if (typeof id !== 'string' || !id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }

  try {
    await removeSummary(supabaseAdmin(), userId, id)
    dropCache()
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    )
  }
}
