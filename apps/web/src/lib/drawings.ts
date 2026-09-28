import type { SupabaseClient } from '@supabase/supabase-js'
import { pendingDrawings, rewritePictures } from '@didactic/core/pictures'
import { drawPicture } from '@/lib/llm/drawing'

/**
 * Drawing a finished lesson's commissioned pictures, and keeping them.
 *
 * A `picture` block with `draw` and no `url` is the writer asking for a
 * plate nobody has made (`core/pictures.isCommission`). They are drawn
 * here, in a round of their own after the last round of writing, since
 * a round of writing already spends most of the minute a request is
 * given and an image takes a good part of another.
 *
 * The one exception to "a picture is pointed at, never kept": a drawing
 * has nowhere else to live. It goes in the public `lesson-drawings`
 * bucket under the lesson's id, and the block is given that address and
 * a credit saying where it came from. Public because the address is
 * written into the lesson body and read by every client for as long as
 * the lesson stands, and nothing in a drawing of a seed is private; the
 * name carries a random part, so the bucket cannot be walked.
 *
 * Whatever does not come back is taken out of the lesson, exactly as a
 * Commons file that cannot be found is: a commission left pending would
 * be asked for again on every open.
 */

const BUCKET = 'lesson-drawings'

/** A lesson is not an album. Beyond this, commissions are dropped: the
 *  writer is told two at most, and a third is the writer not listening. */
export const DRAWINGS_MAX = 2

/** Said under a drawn picture, where a Commons picture names Commons. */
export const DRAWN_CREDIT = 'Drawn for this lesson'

export interface Drawn {
  text: string
  drawn: number
  dropped: number
}

export async function drawPending(
  db: SupabaseClient,
  lessonId: string,
  markdown: string
): Promise<Drawn> {
  const pending = pendingDrawings(markdown)
  if (pending.length === 0) return { text: markdown, drawn: 0, dropped: 0 }

  const asked = pending.slice(0, DRAWINGS_MAX)
  const kept = new Map<number, string | null>()
  await Promise.all(
    asked.map(async block => {
      kept.set(block.index, await drawAndKeep(db, lessonId, block.draw ?? ''))
    })
  )

  let drawn = 0
  const { text, dropped } = rewritePictures(markdown, block => {
    if (!pending.some(p => p.index === block.index)) return undefined
    const url = kept.get(block.index)
    if (!url) return null
    drawn += 1
    return { url, source: DRAWN_CREDIT }
  })
  return { text, drawn, dropped }
}

async function drawAndKeep(db: SupabaseClient, lessonId: string, subject: string): Promise<string | null> {
  const image = await drawPicture(subject)
  if (!image) return null
  const path = `${lessonId}/${crypto.randomUUID()}.webp`
  const { error } = await db.storage.from(BUCKET).upload(path, image.bytes, {
    contentType: image.type,
    // A year: the file at this name never changes, since a new drawing
    // is a new name.
    cacheControl: '31536000',
  })
  if (error) {
    console.error('drawings: could not keep the drawing', error.message)
    return null
  }
  return db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
}
