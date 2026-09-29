import type { SupabaseClient } from '@supabase/supabase-js'
import { isPlaceholderTitle } from '@didactic/core/titles'
import { mediaOf } from '@didactic/core/shared'
import { extractFromHtml } from './extract/url'
import { readMedia } from './extract/media'

/** Long enough for a slow page, short enough that the sheet's own
 *  request is long finished and nobody is waiting on this. */
const FETCH_MS = 10_000

/**
 * Give a resource the title its page carries, where it has only a
 * stand-in made from its address.
 *
 * For links saved before ingestion kept the page's title, which is all
 * of them until now: their pages were read, the title seen and thrown
 * away. The resource sheet asks for this when it opens one still wearing
 * its address, so each is put right the first time it is looked at, and
 * nothing is fetched for a resource that already has a name.
 *
 * Answers null for a resource that is not there or not the owner's.
 */
export async function retitleFromPage(
  db: SupabaseClient,
  userId: string,
  id: string
): Promise<{ title: string; changed: boolean } | null> {
  const { data: resource } = await db
    .from('resources').select('id, user_id, title, url, kind').eq('id', id).maybeSingle()
  if (!resource || resource.user_id !== userId) return null

  const title = resource.title as string
  const url = resource.url as string | null
  if (!url || resource.kind !== 'article' || !isPlaceholderTitle(title, url)) {
    return { title, changed: false }
  }

  let found: string | null = null
  try {
    // A video or a post names itself through the door it is read by;
    // its page is a script or a sign-in wall.
    const media = mediaOf(url)
    found = media ? (await readMedia(media, url)).title : await pageTitle(url)
  } catch {
    return { title, changed: false }
  }

  const named = found?.replace(/\s+/g, ' ').trim()
  if (!named || isPlaceholderTitle(named, url)) return { title, changed: false }

  const { error } = await db.from('resources').update({ title: named }).eq('id', id)
  return error ? { title, changed: false } : { title: named, changed: true }
}

/** The title a page carries, or null for one that says nothing. */
async function pageTitle(url: string): Promise<string | null> {
  const res = await fetch(url, {
    headers: { 'user-agent': 'didactic/1.0' },
    signal: AbortSignal.timeout(FETCH_MS),
  })
  if (!res.ok) return null
  const html = await res.text()
  try {
    return extractFromHtml(html, url).title
  } catch {
    // A page Readability cannot read may still say what it is called.
    return html.match(/<title[^>]*>([^<]{1,300})<\/title>/i)?.[1] ?? null
  }
}
