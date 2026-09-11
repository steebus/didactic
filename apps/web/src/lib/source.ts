import { supabaseAdmin } from './supabase'
import type { OutlineEntry } from '@didactic/core/passages'
import { headingAt } from '@didactic/core/passages'

/**
 * One page of a document, as a citation opens it.
 *
 * Deliberately not cached, unlike every other reader in this folder.
 * The signed URL it carries expires, and a cached sheet would hand out
 * a link that has already gone -- so this is read fresh each time. It
 * is one indexed query and one signature; the sheets that are cached
 * are the ones that run five.
 */

/** How long the link to the whole document is good for. Long enough to
 *  read what you came for, short enough not to be worth passing on. */
const URL_TTL_SECONDS = 900

export interface SourcePage {
  id: string
  title: string
  pageCount: number | null
  /** The page asked for, or null where the citation named the work
   *  rather than a place in it. */
  page: number | null
  /** The chapter that page falls in, where the outline knows. */
  heading: string | null
  passages: Array<{ id: string; pageFrom: number; pageTo: number; content: string }>
  /** The document itself, for a reader who wants the real page rather
   *  than the words. Null when it could not be signed. */
  fileUrl: string | null
  /** Pages either side that have passages, for stepping through. */
  previousPage: number | null
  nextPage: number | null
}

export async function getSourcePage(
  id: string,
  page: number | null
): Promise<SourcePage | null> {
  const db = supabaseAdmin()

  const { data: resource } = await db
    .from('resources')
    .select('id, title, storage_path')
    .eq('id', id)
    .single()
  if (!resource) return null

  const { data: outline } = await db
    .from('resource_outline')
    .select('chapters, page_count')
    .eq('resource_id', id)
    .maybeSingle()

  // The passages on the page asked for. A passage that starts on the
  // page before and runs onto this one counts: the sentence the
  // citation is about may well be in the part that ran over, and a
  // reader sent to a blank page would think the citation was wrong.
  const { data: passages } = page
    ? await db
        .from('resource_passages')
        .select('id, page_from, page_to, content')
        .eq('resource_id', id)
        .lte('page_from', page)
        .gte('page_to', page)
        .order('ordinal')
    : await db
        .from('resource_passages')
        .select('id, page_from, page_to, content')
        .eq('resource_id', id)
        .order('ordinal')
        .limit(3)

  // Where the reader can step to. Asked of the table rather than
  // assumed from the page number, because a document read in rounds may
  // legitimately have gaps -- a page of nothing but a figure cuts to no
  // passages at all, and stepping onto it would show an empty sheet.
  const [{ data: before }, { data: after }] = page
    ? await Promise.all([
        db
          .from('resource_passages')
          .select('page_from')
          .eq('resource_id', id)
          .lt('page_from', page)
          .order('page_from', { ascending: false })
          .limit(1),
        db
          .from('resource_passages')
          .select('page_from')
          .eq('resource_id', id)
          .gt('page_from', page)
          .order('page_from', { ascending: true })
          .limit(1),
      ])
    : [{ data: [] }, { data: [] }]

  let fileUrl: string | null = null
  if (resource.storage_path) {
    const { data: signed } = await db.storage
      .from('resources')
      .createSignedUrl(resource.storage_path, URL_TTL_SECONDS)
    // The fragment is what makes the browser's own viewer open at the
    // right place. Every major one honours it; one that does not simply
    // opens at the front, which is no worse than a link to the file.
    fileUrl = signed?.signedUrl ? `${signed.signedUrl}#page=${page ?? 1}` : null
  }

  const chapters = (outline?.chapters as OutlineEntry[] | null) ?? []

  return {
    id: resource.id,
    title: resource.title,
    pageCount: outline?.page_count ?? null,
    page,
    heading: page ? headingAt(chapters, page) : null,
    passages: (passages ?? []).map(p => ({
      id: p.id as string,
      pageFrom: p.page_from as number,
      pageTo: p.page_to as number,
      content: p.content as string,
    })),
    fileUrl,
    previousPage: (before?.[0]?.page_from as number | undefined) ?? null,
    nextPage: (after?.[0]?.page_from as number | undefined) ?? null,
  }
}
