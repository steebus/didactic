import type { SupabaseClient } from '@supabase/supabase-js'
import { cutPassages, pagesThisRound, type OutlineEntry } from '@didactic/core/passages'
import { readOutline, readPages, close, FRONT_PAGES } from './extract/pdf'
import { readContentsPages } from './llm/outline'
import { embed } from './embedding'

/**
 * Reading a document, a round at a time.
 *
 * A function gets sixty seconds. A four-hundred page book does not fit
 * in sixty seconds -- not the parsing, and certainly not an embedding
 * per passage on top of it -- so reading one cannot be a request. It is
 * a cursor and a series of requests, which is the same answer `028`
 * reached for lesson bodies and for the same reason: a long job that
 * cannot be resumed is a long job that never finishes, because the one
 * thing guaranteed about sixty seconds is that something will not fit
 * inside it.
 *
 * Each round does what it can afford, saves it, and says whether there
 * is more. The queue brings it back. Nothing is held in memory between
 * rounds and nothing has to be: the cursor is on the job row and the
 * passages are in the table.
 *
 * What makes this affordable at all is that the bytes are fetched by
 * range. pdfjs is given a signed URL rather than a buffer, so a round
 * that wants pages 200 to 240 pulls those pages, not the book. Read
 * whole on every round, a fifty megabyte document would spend most of
 * every minute downloading itself again.
 */

/**
 * What a round keeps back for writing down what it read.
 *
 * The passages and the cursor both have to land, and a round that
 * spends its whole minute parsing and is cut off before the insert has
 * done nothing at all -- worse than nothing, because it will do the
 * same thing again next time and never advance.
 */
const WRITING_NEEDS_MS = 6_000

/** What reading the outline costs on the first round, near enough. It
 *  is one pass over the bookmark tree, or a model call where there is
 *  no tree, and the page budget is only worth computing after it. */
const OUTLINE_NEEDS_MS = 20_000

/** Embeddings run a few at a time. Each is a call to the edge function
 *  that holds the model, and the same three the sower uses: more finds
 *  its limits rather than its speed. */
const CONCURRENCY = 3

/** How long a signed URL is good for. Long enough for one round with
 *  room to spare, short enough that it is not a key left lying about. */
const URL_TTL_SECONDS = 900

/** What a document turned out to be shaped like. */
export interface DocumentShape {
  chapters: OutlineEntry[]
  source: 'bookmarks' | 'model' | 'none'
  pageCount: number
  /** True when this was read before and only loaded here. */
  alreadyHeld: boolean
  warnings: string[]
}

/**
 * Read the document's structure, once, and keep it.
 *
 * Separated from the rounds because it is wanted long before them. A
 * reader uploads a book and then, within seconds, says how closely the
 * bed should follow it and presses sow -- while the queue that reads
 * documents runs on a cron once a minute. Left on the queue, the answer
 * always arrived after the question: the bed was laid out without the
 * document every single time, and the sheet said "it has not finished
 * being read" as though the reader had simply been too quick.
 *
 * So the structure is read on the upload itself, where it is cheap --
 * a bookmark tree is one pass and under a second -- and the passages,
 * which are the expensive part and which nothing needs until a lesson
 * is written, stay on the queue.
 *
 * Idempotent: a document whose outline is already on the row is loaded
 * rather than read again.
 */
export async function ensureOutline(
  db: SupabaseClient,
  resourceId: string,
  source: { url: string } | { buffer: Buffer },
  {
    title,
    userId,
    deadline,
  }: { title: string; userId: string; deadline: number }
): Promise<DocumentShape> {
  const warnings: string[] = []

  const { data: held } = await db
    .from('resource_outline')
    .select('chapters, source, page_count')
    .eq('resource_id', resourceId)
    .maybeSingle()

  if (held) {
    return {
      chapters: (held.chapters as OutlineEntry[] | null) ?? [],
      source: (held.source as 'bookmarks' | 'model' | 'none') ?? 'none',
      pageCount: (held.page_count as number | null) ?? 0,
      alreadyHeld: true,
      warnings,
    }
  }

  const read = await readOutline(source)
  let chapters = read.chapters
  // Widened from what `readOutline` can answer ('bookmarks' or 'none'),
  // because the model-read fallback below is the third case and only
  // this function can produce it.
  let outlineSource: DocumentShape['source'] = read.source

  // No bookmarks. Many documents that lack them still print their own
  // contents, so the front is read and the model is asked what it sees
  // -- which is a guess, and is recorded as one. Plenty of documents
  // have neither, and that is a fact about the document rather than a
  // failure: an article is not a book and has no chapters to follow.
  if (outlineSource === 'none' && Date.now() < deadline - OUTLINE_NEEDS_MS) {
    try {
      const front = await readPages(source, {
        from: 1,
        to: Math.min(FRONT_PAGES, read.pageCount),
      })
      const proposed = await readContentsPages({
        title,
        pageCount: read.pageCount,
        front: front.pages,
      })
      if (proposed.length > 0) {
        chapters = close(proposed, 1, read.pageCount)
        outlineSource = 'model'
      }
    } catch (e) {
      // A bed can still be sown from a document with no outline; it
      // simply cannot be sown from it to the letter. Not fatal.
      warnings.push(
        `the contents could not be read: ${e instanceof Error ? e.message : String(e)}`
      )
    }
  }

  const { error: outlineError } = await db.from('resource_outline').upsert(
    {
      resource_id: resourceId,
      user_id: userId,
      chapters,
      source: outlineSource,
      page_count: read.pageCount,
    },
    { onConflict: 'resource_id' }
  )
  if (outlineError) warnings.push(`the outline was not saved: ${outlineError.message}`)

  await db
    .from('ingestion_jobs')
    .update({ page_count: read.pageCount, updated_at: new Date().toISOString() })
    .eq('resource_id', resourceId)

  return {
    chapters,
    source: outlineSource,
    pageCount: read.pageCount,
    alreadyHeld: false,
    warnings,
  }
}

/**
 * Sign a URL for a stored document, so pdfjs can fetch it by range.
 */
export async function signedSource(
  db: SupabaseClient,
  storagePath: string
): Promise<{ url: string }> {
  const { data, error } = await db.storage
    .from('resources')
    .createSignedUrl(storagePath, URL_TTL_SECONDS)
  if (error || !data?.signedUrl) {
    throw new Error(`document: could not reach the file — ${error?.message ?? 'no URL'}`)
  }
  return { url: data.signedUrl }
}

export interface RoundResult {
  done: boolean
  pagesDone: number
  pageCount: number
  /** Written this round, not in total. */
  passages: number
  embedded: number
  outline: 'bookmarks' | 'model' | 'none' | 'already'
  warnings: string[]
}

/**
 * Read as much of a document as this round can afford.
 *
 * `deadline` is when the request as a whole must be finished, so the
 * round can stop while there is still time to save what it has rather
 * than being cut off mid-insert.
 */
export async function readDocumentRound(
  db: SupabaseClient,
  resourceId: string,
  { deadline }: { deadline: number }
): Promise<RoundResult> {
  const warnings: string[] = []

  const { data: resource, error } = await db
    .from('resources')
    .select('id, user_id, title, storage_path, kind')
    .eq('id', resourceId)
    .single()
  if (error) throw error
  if (resource.kind !== 'pdf' || !resource.storage_path) {
    throw new Error('document: not a stored PDF')
  }

  const { data: job } = await db
    .from('ingestion_jobs')
    .select('pages_done, page_count, ms_per_page')
    .eq('resource_id', resourceId)
    .single()

  let pagesDone: number = job?.pages_done ?? 0
  let pageCount: number | null = job?.page_count ?? null
  const msPerPage: number | null = job?.ms_per_page ?? null

  const source = await signedSource(db, resource.storage_path)

  /* 1. The document's own shape, which is usually already known. */

  const shape = await ensureOutline(db, resourceId, source, {
    title: resource.title,
    userId: resource.user_id,
    deadline,
  })
  const chapters = shape.chapters
  const outlineSource: RoundResult['outline'] = shape.alreadyHeld ? 'already' : shape.source
  warnings.push(...shape.warnings)
  pageCount = shape.pageCount

  /* 2. As many pages as the rest of the minute will carry. */

  let written = 0

  if (pagesDone < pageCount) {
    const take = pagesThisRound({
      remaining: pageCount - pagesDone,
      msLeft: Math.max(0, deadline - Date.now() - WRITING_NEEDS_MS),
      msPerPage,
    })

    const from = pagesDone + 1
    const to = Math.min(pageCount, pagesDone + take)

    const startedAt = Date.now()
    const { pages } = await readPages(source, { from, to })
    const spent = Date.now() - startedAt

    // Where to carry on numbering. Read from the table rather than
    // counted here, because a round that failed after inserting is a
    // round whose passages are already there.
    const { count } = await db
      .from('resource_passages')
      .select('id', { count: 'exact', head: true })
      .eq('resource_id', resourceId)

    const passages = cutPassages(pages, { outline: chapters, startOrdinal: count ?? 0 })

    if (passages.length > 0) {
      const { error: insertError } = await db.from('resource_passages').upsert(
        passages.map(p => ({
          resource_id: resourceId,
          user_id: resource.user_id,
          ordinal: p.ordinal,
          page_from: p.pageFrom,
          page_to: p.pageTo,
          heading: p.heading,
          content: p.content,
        })),
        { onConflict: 'resource_id,ordinal' }
      )
      if (insertError) throw new Error(`document: the passages were not saved — ${insertError.message}`)
      written = passages.length
    }

    pagesDone = to

    // What a page of this document actually costs, so the next round
    // can size itself on evidence rather than on a guess. Blended with
    // what was already known so one slow round does not dominate.
    const measured = Math.max(1, Math.round(spent / Math.max(1, to - from + 1)))
    const blended = msPerPage ? Math.round((msPerPage + measured) / 2) : measured

    await db
      .from('ingestion_jobs')
      .update({
        pages_done: pagesDone,
        ms_per_page: blended,
        updated_at: new Date().toISOString(),
      })
      .eq('resource_id', resourceId)
  }

  /* 3. Vectors for whatever is still without one. */

  const embedded = await embedPending(db, resourceId, { deadline })

  const { count: pending } = await db
    .from('resource_passages')
    .select('id', { count: 'exact', head: true })
    .eq('resource_id', resourceId)
    .is('embedding', null)

  return {
    done: pagesDone >= pageCount && (pending ?? 0) === 0,
    pagesDone,
    pageCount,
    passages: written,
    embedded,
    outline: outlineSource,
    warnings,
  }
}

/**
 * Give vectors to passages that have none, while there is time.
 *
 * A separate pass from the cutting because it is a separate failure:
 * the edge function that holds the model can be down while the parser
 * is perfectly happy, and a passage without a vector is still a passage
 * -- readable, citable by page, merely not retrievable yet. Losing the
 * text because the embedder was unavailable would be the worse trade.
 */
async function embedPending(
  db: SupabaseClient,
  resourceId: string,
  { deadline }: { deadline: number }
): Promise<number> {
  let done = 0

  while (Date.now() < deadline - WRITING_NEEDS_MS) {
    const { data: batch } = await db
      .from('resource_passages')
      .select('id, content')
      .eq('resource_id', resourceId)
      .is('embedding', null)
      .order('ordinal')
      .limit(CONCURRENCY)

    if (!batch?.length) break

    const vectors = await Promise.all(
      batch.map(async row => {
        try {
          return { id: row.id as string, vector: await embed(row.content as string) }
        } catch {
          // One passage the embedder refused. Left without a vector and
          // picked up next round rather than failing the whole document.
          return null
        }
      })
    )

    const got = vectors.filter((v): v is { id: string; vector: number[] } => v !== null)
    if (got.length === 0) break

    for (const { id, vector } of got) {
      await db
        .from('resource_passages')
        .update({ embedding: JSON.stringify(vector) })
        .eq('id', id)
    }
    done += got.length
  }

  return done
}
