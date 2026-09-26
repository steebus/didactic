import type { SupabaseClient } from '@supabase/supabase-js'
import type { ResourceKind } from '@didactic/core/types'
import type { BodySource, ReadableBody } from '@didactic/core/shapes'
import { extractFromHtml } from './extract/url'
import { htmlToMarkdown } from './extract/markdown'

/**
 * A resource, made readable in the app.
 *
 * Made once, from whatever ingestion can already get at, and kept in
 * `resource_bodies` (053) so every later visit reads a row rather than
 * fetching somebody else's page again:
 *
 * - an **article** is its page's readable text, through Readability and
 *   into markdown (`extract/markdown`);
 * - a **note** is what was pasted, which is already prose;
 * - a **document** is the passages it was cut into (029), in order, with
 *   the chapter headings the cutter found set as headings -- so a PDF
 *   has sections to summarise just as a lesson does;
 * - a **book** has no contents here by design (PRODUCT.md), and says so.
 *
 * Nothing about this is required for anything else to work. A resource
 * that cannot be made readable is still filed, still counts when it is
 * marked read, and still opens where it lives.
 */

/** What the reader is shown, or why there is nothing. */
export type Readable = ReadableBody

interface ResourceLike {
  id: string
  user_id: string
  kind: ResourceKind
  url: string | null
  raw_text: string | null
  storage_path: string | null
}

/** Below this, what came back is a page's furniture rather than its text. */
const WORTH_READING = 200

/**
 * The readable body of a resource: kept, or made now and kept.
 *
 * A document still being read into passages is shown as far as it has
 * got and not kept, so the rest arrives on a later visit rather than
 * the first forty pages being frozen in as the whole book.
 */
export async function readableBody(db: SupabaseClient, resource: ResourceLike): Promise<Readable> {
  // Before 053 there is no table to read, and an error here is the same
  // as nothing kept: make it, and fail to keep it quietly.
  const { data: kept } = await db
    .from('resource_bodies')
    .select('body, source')
    .eq('resource_id', resource.id)
    .maybeSingle()
  if (kept?.body) return { body: kept.body as string, source: kept.source as BodySource }

  const made = await makeBody(db, resource)
  if (made.body !== null && made.keep) await keepBody(db, resource, made.body, made.source)
  return made.body === null ? made : { body: made.body, source: made.source }
}

/** Keep a body, once. A failure costs only a second making of it. */
export async function keepBody(
  db: SupabaseClient,
  resource: Pick<ResourceLike, 'id' | 'user_id'>,
  body: string,
  source: BodySource
) {
  const { error } = await db
    .from('resource_bodies')
    .upsert({ resource_id: resource.id, user_id: resource.user_id, body, source })
  if (error) console.error('resource body: could not keep it', error.message)
}

/**
 * An article's body, from the readable HTML Readability left.
 *
 * Shared with ingestion, which has the page in hand when it files an
 * article and keeps the body then, so the first open reads a row.
 */
export function articleBody(readable: string, url: string): string | null {
  const body = htmlToMarkdown(readable, url)
  return body.replace(/\s+/g, ' ').trim().length >= WORTH_READING ? body : null
}

type Made =
  | { body: string; source: BodySource; keep: boolean }
  | { body: null; why: string }

async function makeBody(db: SupabaseClient, resource: ResourceLike): Promise<Made> {
  switch (resource.kind) {
    case 'note': {
      const text = (resource.raw_text ?? '').trim()
      return text
        ? { body: text, source: 'note', keep: true }
        : { body: null, why: 'This note has nothing written in it.' }
    }

    case 'article': {
      if (!resource.url) return { body: null, why: 'There is no address to read this from.' }
      try {
        const res = await fetch(resource.url, {
          headers: { 'user-agent': 'didactic/1.0' },
          signal: AbortSignal.timeout(15_000),
        })
        if (!res.ok) {
          return { body: null, why: `The page would not open here (it answered ${res.status}).` }
        }
        const body = articleBody(extractFromHtml(await res.text(), resource.url).html, resource.url)
        return body
          ? { body, source: 'article', keep: true }
          : {
              body: null,
              why: 'The page had too little readable text to bring in — it may need a sign-in, or be mostly pictures or video.',
            }
      } catch (e) {
        return {
          body: null,
          why: `The page could not be read here — ${e instanceof Error ? e.message : String(e)}.`,
        }
      }
    }

    case 'pdf':
      return documentBody(db, resource)

    case 'book':
      return {
        body: null,
        why: 'A book is kept by its title, not its pages, so there is nothing of it to read here.',
      }

    default:
      return { body: null, why: 'There is nothing of this to read here.' }
  }
}

/**
 * A document's passages, as one reading.
 *
 * A heading is written wherever the chapter a passage falls under
 * changes, so the reader's contents list is the document's own, and
 * every chapter gets its press for a summary.
 */
async function documentBody(db: SupabaseClient, resource: ResourceLike): Promise<Made> {
  const [{ data: passages }, { data: job }] = await Promise.all([
    db
      .from('resource_passages')
      .select('heading, content')
      .eq('resource_id', resource.id)
      .order('ordinal'),
    db
      .from('ingestion_jobs')
      .select('pages_done, page_count')
      .eq('resource_id', resource.id)
      .maybeSingle(),
  ])

  if (!passages || passages.length === 0) {
    return {
      body: null,
      why: job && job.page_count === null
        ? 'This document is still being read. Its text will be here once it has been.'
        : 'No text could be read off this document — it may be scanned pages rather than words.',
    }
  }

  const body = documentMarkdown(
    passages as Array<{ heading: string | null; content: string }>
  )
  const finished =
    !job || (job.page_count !== null && (job.pages_done as number) >= (job.page_count as number))
  return { body, source: 'document', keep: finished }
}

/**
 * Passages as markdown: their words, with a heading wherever the
 * chapter changes.
 *
 * The passage text is the document's own and is set as prose, so a
 * line in it that looks like markdown syntax is escaped the way an
 * article's is -- a document is not written in markdown, and a `#` at
 * the start of a line in one is a number sign.
 */
export function documentMarkdown(passages: Array<{ heading: string | null; content: string }>): string {
  const parts: string[] = []
  let under: string | null = null

  for (const passage of passages) {
    const heading = passage.heading?.replace(/\s+/g, ' ').trim() || null
    if (heading && heading !== under) {
      parts.push(`## ${escapeProse(heading)}`)
      under = heading
    }
    for (const paragraph of passage.content.split(/\n\s*\n/)) {
      const text = escapeProse(paragraph.replace(/\s+/g, ' ').trim())
      if (text) parts.push(text)
    }
  }

  return parts.join('\n\n')
}

/** Text set as a paragraph, with markdown's syntax taken out of it. */
function escapeProse(text: string): string {
  const escaped = text.replace(/([\\`*_[\]<>$|~])/g, '\\$1')
  if (/^#{1,6}(\s|$)/.test(escaped) || /^[-+](\s|$)/.test(escaped)) return `\\${escaped}`
  return escaped.replace(/^(\d+)\.(\s|$)/, '$1\\.$2')
}
