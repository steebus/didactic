import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { lessonsWithinReach } from '@/lib/curriculum'
import { citableRoster } from '@/lib/citations'

/**
 * What the body's `lesson:` and `source:` names resolve against.
 *
 * Split off the lesson read rather than served with it. Both of these
 * fan out across every topic that shares a subject, which is a dozen
 * round trips that grow with the catalogue -- and neither is needed to
 * print a word of the prose. Held in the sheet's own read they were
 * the whole of its wait; asked for separately the reading paints
 * first and its links resolve underneath it.
 *
 * Read at request time rather than frozen into the body when it was
 * written: a curriculum is reshaped and a lesson is grubbed out long
 * after its neighbours were written, and a link that has stopped
 * reaching anything should say so. Likewise a document taken off the
 * shelf should turn its citations into stubs rather than leave them
 * looking like citations that still reach something.
 *
 * Until it lands the prose prints both as stubs, which is the same
 * thing a client that has never heard of this route prints, and the
 * same thing the reader already saw for a name that reaches nothing.
 */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = supabaseAdmin()

  const { data: lesson } = await db.from('lessons').select('curriculum_id').eq('id', id).single()
  if (!lesson) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const { data: curriculum } = await db.from('curricula').select('id, topic_id')
    .eq('id', lesson.curriculum_id).single()
  if (!curriculum) return NextResponse.json({ links: [], sources: [] })

  const [links, sources] = await Promise.all([
    lessonsWithinReach(db, curriculum.topic_id, id),
    citableRoster(db, { curriculumId: curriculum.id, topicId: curriculum.topic_id }),
  ])

  return NextResponse.json({ links, sources })
}
